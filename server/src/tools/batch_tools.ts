import { z } from 'zod';
import { MCPTool, MCPToolResult } from '../utils/types.js';

export const BATCH_MAX_OPERATIONS = 25;
export const BATCH_MAX_ARGUMENT_BYTES = 256 * 1024;
export const BATCH_MAX_RESULT_TEXT = 16 * 1024;
export const BATCH_MAX_ERROR_CHARS = 8 * 1024;

const batchOperationSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional().default({}),
});

export const batchParamsSchema = z.object({
  operations: z.array(batchOperationSchema).min(1).max(BATCH_MAX_OPERATIONS),
  dry_run: z.boolean().optional().default(false),
  continue_on_error: z.boolean().optional().default(false),
});

type BatchParams = z.infer<typeof batchParamsSchema>;

const EXCLUDED_TOOLS = new Set([
  'batch_operations', 'execute_editor_script', 'reload_project',
  'stream_debug_output', 'playtest',
]);

function compactResult(value: MCPToolResult): unknown {
  if (typeof value === 'string') {
    if (value.length <= BATCH_MAX_RESULT_TEXT) return value;
    return { result_omitted: true, reason: 'result exceeds batch result limit', characters: value.length, limit: BATCH_MAX_RESULT_TEXT };
  }
  const content = value.content.map(block => block.type === 'text'
    ? { type: 'text', text: block.text.length <= BATCH_MAX_RESULT_TEXT ? block.text : `[text omitted: ${block.text.length} characters exceeds ${BATCH_MAX_RESULT_TEXT}]` }
    : { type: 'image', mimeType: block.mimeType, data_omitted: true, reason: 'batch results do not inline image payloads' });
  return { content };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Creates the ordered, deliberately non-atomic batch tool from existing tools. */
export function createBatchTool(tools: MCPTool[]): MCPTool {
  const registry = new Map(tools.map(tool => [tool.name, tool]));
  return {
    name: 'batch_operations',
    description: 'Run a bounded ordered sequence of existing tools. This is non-atomic: there is no rollback and earlier side effects remain after a failure. dry_run validates schemas only and performs no Godot work. Outside dry_run, a batch containing any failed or invalid operation fails the tool call itself, with the compact JSON report embedded in the error.',
    parameters: batchParamsSchema,
    execute: async (params: BatchParams): Promise<string> => {
      const serializedBytes = Buffer.byteLength(JSON.stringify(params.operations), 'utf8');
      if (serializedBytes > BATCH_MAX_ARGUMENT_BYTES) {
        throw new Error(`Batch arguments are ${serializedBytes} bytes; maximum is ${BATCH_MAX_ARGUMENT_BYTES}`);
      }
      const report: Array<Record<string, unknown>> = [];
      let blocked = false;
      for (let index = 0; index < params.operations.length; index += 1) {
        const operation = params.operations[index];
        const base = { index, id: operation.id, tool: operation.tool };
        if (blocked) {
          report.push({ ...base, status: 'skipped', reason: 'previous operation failed and continue_on_error is false' });
          continue;
        }
        const target = registry.get(operation.tool);
        if (!target || EXCLUDED_TOOLS.has(operation.tool)) {
          report.push({ ...base, status: params.dry_run ? 'invalid' : 'failed', error: `Tool ${operation.tool} is not allowed in a batch` });
          if (!params.dry_run && !params.continue_on_error) blocked = true;
          continue;
        }
        const parsed = target.parameters.safeParse(operation.arguments ?? {});
        if (!parsed.success) {
          report.push({ ...base, status: params.dry_run ? 'invalid' : 'failed', error: parsed.error.issues.map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`).join('; ') });
          if (!params.dry_run && !params.continue_on_error) blocked = true;
          continue;
        }
        if (params.dry_run) {
          report.push({ ...base, status: 'valid' });
          continue;
        }
        const started = Date.now();
        try {
          const value = await target.execute(parsed.data);
          report.push({ ...base, status: 'success', elapsed_ms: Date.now() - started, result: compactResult(value) });
        } catch (error) {
          report.push({ ...base, status: 'failed', elapsed_ms: Date.now() - started, error: errorText(error) });
          if (!params.continue_on_error) blocked = true;
        }
      }
      const failed = report.some(item => item.status === 'failed' || item.status === 'invalid');
      const payload = JSON.stringify({
        ordered: true,
        atomic: false,
        rollback: false,
        dry_run: params.dry_run,
        dry_run_note: params.dry_run ? 'Only allowlist and schema validation ran; Godot preconditions and runtime state were not checked.' : undefined,
        warning: 'This batch has no rollback. Earlier side effects remain after a later failure.',
        success: !failed,
        operations: report,
      });
      // dry_run "invalid" entries are expected validation output; a real batch
      // with any failed/invalid operation must fail the tool call, embedding a
      // bounded copy of the report so callers cannot miss partial failures.
      if (failed && !params.dry_run) {
        const embedded = payload.length > BATCH_MAX_ERROR_CHARS
          ? `${payload.slice(0, BATCH_MAX_ERROR_CHARS)}...[report truncated]`
          : payload;
        throw new Error(`Batch failed; report: ${embedded}`);
      }
      return payload;
    },
  };
}
