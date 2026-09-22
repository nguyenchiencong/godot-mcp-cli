import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

const assertionSchema = z.object({
  type: z.enum(['node_exists', 'node_not_exists', 'node_type', 'node_visible', 'expression']),
  node_path: z.string().optional(),
  expected_type: z.string().optional(),
  expected_visible: z.boolean().optional(),
  expression: z.string().optional(),
  operator: z.enum(['equals', 'not_equals', 'truthy', 'falsy', 'contains', 'gt', 'gte', 'lt', 'lte']).optional(),
  expected: z.unknown().optional(),
});

const phaseSchema = z.object({
  name: z.string().optional(),
  input: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  settle_ms: z.number().int().min(0).max(10000).optional(),
  assertions: z.array(assertionSchema).max(50).optional(),
});

export const playtestParamsSchema = z.object({
  launch: z.object({
    mode: z.enum(['already_running', 'main', 'current', 'scene']),
    scene_path: z.string().optional(),
  }).optional().default({ mode: 'already_running' }),
  startup_timeout_ms: z.number().int().min(100).max(60000).optional().default(10000),
  phases: z.array(phaseSchema).min(1).max(20),
  stop_after: z.boolean().optional().default(false),
  capture_on_failure: z.boolean().optional().default(false),
});

type PlaytestParams = z.infer<typeof playtestParamsSchema>;
export interface PlaytestAdapter {
  launch(mode: 'main' | 'current' | 'scene', scenePath?: string): Promise<unknown>;
  stop(): Promise<unknown>;
  runtimeScene(): Promise<any>;
  input(sequence: Array<Record<string, unknown>>): Promise<unknown>;
  evaluate(expression: string): Promise<any>;
  capture(): Promise<unknown>;
  sleep(ms: number): Promise<void>;
}

const unavailable = (value: any): boolean => !value || typeof value !== 'object' || Boolean(value.error);

function truncatedSnapshot(value: any): boolean {
  return value?.truncated === true || value?.scan_truncated === true || value?.structure?.truncated === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function flattenNodes(node: any, path = ''): Array<{ node: any; path: string }> {
  if (!node || typeof node !== 'object') return [];
  const name = String(node.name ?? '');
  const current = path || `/${name}`;
  const result = [{ node, path: current }];
  if (Array.isArray(node.children)) node.children.forEach((child: any) => result.push(...flattenNodes(child, `${current}/${String(child?.name ?? '')}`)));
  return result;
}

function compare(actual: any, operator: string, expected: any): boolean {
  switch (operator) {
    case 'equals': return JSON.stringify(actual) === JSON.stringify(expected);
    case 'not_equals': return JSON.stringify(actual) !== JSON.stringify(expected);
    case 'truthy': return Boolean(actual);
    case 'falsy': return !actual;
    case 'contains': return typeof actual === 'string' ? actual.includes(String(expected)) : Array.isArray(actual) && actual.includes(expected);
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    default: return false;
  }
}

function findNode(snapshot: any, nodePath?: string): any | undefined {
  const structure = snapshot?.structure;
  if (!structure) return undefined;
  const nodes = flattenNodes(structure);
  if (!nodePath) return structure;
  return nodes.find(item => item.path === nodePath || item.path.endsWith(`/${nodePath.replace(/^\.\//, '')}`))?.node;
}

export async function runPlaytest(params: PlaytestParams, adapter: PlaytestAdapter): Promise<Record<string, unknown>> {
  const totalSteps = params.phases.reduce((sum, phase) => sum + (phase.input?.length ?? 0), 0);
  const totalAssertions = params.phases.reduce((sum, phase) => sum + (phase.assertions?.length ?? 0), 0);
  if (totalSteps > 50) throw new Error('Playtest input is limited to 50 total steps');
  if (totalAssertions > 50) throw new Error('Playtest assertions are limited to 50 total assertions');

  let cleanupRan = false;
  let cleanup: unknown = { skipped: !params.stop_after };
  const runCleanup = async (): Promise<void> => {
    if (!params.stop_after || cleanupRan) return;
    cleanupRan = true;
    try { cleanup = await adapter.stop(); } catch (error) { cleanup = { error: errorMessage(error) }; }
  };

  try {
    const launch = params.launch ?? { mode: 'already_running' as const };
    let launchResult: unknown = { mode: launch.mode, attached: launch.mode === 'already_running' };
    if (launch.mode !== 'already_running') launchResult = await adapter.launch(launch.mode, launch.scene_path);

    const readyDeadline = Date.now() + (params.startup_timeout_ms ?? 10000);
    let snapshot: any;
    let readinessError: string | undefined;
    while (Date.now() <= readyDeadline) {
      try {
        snapshot = await adapter.runtimeScene();
        if (!unavailable(snapshot)) break;
        readinessError = String(snapshot?.error ?? 'Runtime inspection unavailable');
      } catch (error) { readinessError = errorMessage(error); }
      await adapter.sleep(100);
    }
    const ready = !unavailable(snapshot);
    const phases: Array<Record<string, unknown>> = [];
    let passed = ready;
    for (const phase of params.phases) {
      const assertions: Array<Record<string, unknown>> = [];
      let phasePassed = ready;
      if (!ready) {
        phases.push({ name: phase.name ?? `phase-${phases.length + 1}`, status: 'infrastructure_error', error: readinessError ?? 'Runtime inspection unavailable' });
        passed = false;
        continue;
      }
      if (phase.input && phase.input.length > 0) {
        try { await adapter.input(phase.input); } catch (error) {
          phasePassed = false;
          assertions.push({ status: 'infrastructure_error', error: errorMessage(error) });
        }
      }
      if (phase.settle_ms) await adapter.sleep(phase.settle_ms);
      if (phase.assertions && phase.assertions.length > 0) {
        // A missing, errored, or truncated snapshot proves nothing about node
        // presence; every assertion in this phase becomes an infrastructure
        // error instead of a pass/fail verdict.
        let snapshotError: string | undefined;
        try { snapshot = await adapter.runtimeScene(); } catch (error) { snapshot = { error: errorMessage(error) }; }
        if (unavailable(snapshot)) {
          snapshotError = String(snapshot?.error ?? 'Runtime snapshot unavailable');
        } else if (truncatedSnapshot(snapshot)) {
          snapshotError = 'Runtime snapshot was truncated; node presence/absence cannot be proven';
        }
        if (snapshotError !== undefined) {
          phasePassed = false;
          for (const assertion of phase.assertions) {
            assertions.push({ type: assertion.type, status: 'infrastructure_error', error: snapshotError });
          }
          phases.push({ name: phase.name ?? `phase-${phases.length + 1}`, status: 'infrastructure_error', error: snapshotError, assertions });
          passed = false;
          continue;
        }
        for (const assertion of phase.assertions) {
          if (assertion.type === 'expression') {
            if (!assertion.expression || !assertion.operator) {
              assertions.push({ type: assertion.type, status: 'infrastructure_error', error: 'expression, operator, and expected are required' });
              phasePassed = false;
              continue;
            }
            try {
              const evaluation = await adapter.evaluate(assertion.expression);
              if (unavailable(evaluation)) {
                assertions.push({ type: assertion.type, status: 'infrastructure_error', error: evaluation?.error ?? 'Runtime evaluation bridge unavailable' });
                phasePassed = false;
                continue;
              }
              const actual = evaluation.result;
              const ok = compare(actual, assertion.operator, assertion.expected);
              assertions.push({ type: assertion.type, status: ok ? 'passed' : 'failed', expression: assertion.expression, operator: assertion.operator, expected: assertion.expected, actual });
              phasePassed &&= ok;
            } catch (error) { phasePassed = false; assertions.push({ type: assertion.type, status: 'infrastructure_error', error: errorMessage(error) }); }
            continue;
          }
          const node = findNode(snapshot, assertion.node_path);
          let ok = assertion.type === 'node_not_exists' ? !node : Boolean(node);
          if (assertion.type === 'node_type') ok = Boolean(node) && node.type === assertion.expected_type;
          if (assertion.type === 'node_visible') ok = Boolean(node) && Boolean(node.visibility?.visible) === assertion.expected_visible;
          assertions.push({ type: assertion.type, status: ok ? 'passed' : 'failed', node_path: assertion.node_path, expected: assertion.expected_type ?? assertion.expected_visible, actual: node ? { type: node.type, visible: node.visibility?.visible } : undefined });
          phasePassed &&= ok;
        }
      }
      phases.push({ name: phase.name ?? `phase-${phases.length + 1}`, status: phasePassed ? 'passed' : 'failed', assertions });
      passed &&= phasePassed;
      if (!phasePassed && params.capture_on_failure) {
        try { phases[phases.length - 1].capture = await adapter.capture(); } catch (error) { phases[phases.length - 1].capture_error = errorMessage(error); }
      }
    }

    await runCleanup();
    const cleanupFailed = typeof cleanup === 'object' && cleanup !== null && Boolean((cleanup as Record<string, unknown>).error);
    if (cleanupFailed) passed = false;
    return { passed, launch: launchResult, readiness: { ready, error: ready ? undefined : readinessError }, phases, cleanup };
  } catch (error) {
    // Any throw still honors stop_after; stop failures are swallowed here
    // because the original error is being rethrown.
    await runCleanup();
    throw error;
  }
}

function defaultAdapter(): PlaytestAdapter {
  const godot = getGodotConnection();
  return {
    launch: async (mode, scenePath) => godot.sendCommand(mode === 'main' ? 'run_project' : mode === 'current' ? 'run_current_scene' : 'run_specific_scene', mode === 'scene' ? { scene_path: scenePath } : {}),
    stop: async () => godot.sendCommand('stop_running_project'),
    runtimeScene: async () => godot.sendCommand('get_runtime_scene_structure', { timeout_ms: 1000 }),
    input: async sequence => godot.sendCommand('simulate_input_sequence', { sequence }),
    evaluate: async expression => godot.sendCommand('evaluate_runtime', { expression }),
    capture: async () => godot.sendCommand('capture_running_game', {}),
    sleep: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  };
}

export function createPlaytestTool(adapter: PlaytestAdapter = defaultAdapter()): MCPTool {
  return {
    name: 'playtest',
    description: 'Launch or attach to a running Godot game, apply bounded input phases, and report runtime assertions. Runtime/evaluation bridge failures, thrown inspections, and unavailable or truncated runtime snapshots are infrastructure errors, not passes; a cleanup failure forces passed=false. Capture-on-failure reuses the existing running-game capture path.',
    parameters: playtestParamsSchema,
    execute: async params => JSON.stringify(await runPlaytest(params, adapter)),
  };
}
