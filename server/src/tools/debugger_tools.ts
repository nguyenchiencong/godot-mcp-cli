import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { CommandResult, MCPTool } from '../utils/types.js';

interface DebuggerBreakpointParams {
  script_path: string;
  line: number;
}

interface DebuggerSessionParams {
  session_id?: number;
}

interface RawStackFrame {
  index?: number;
  function?: string;
  script?: string;
  file?: string;
  line?: number;
  location?: string;
}

type SimpleToolSuccess<T> = (params: T, result: CommandResult) => string;

interface SimpleDebuggerToolConfig<T> {
  name: string;
  description: string;
  command: string;
  parameters: z.ZodType<T>;
  successMessage: SimpleToolSuccess<T>;
  errorContext: string;
  transformParams?: (params: T) => Record<string, unknown>;
}

const createSimpleDebuggerTool = <T>(config: SimpleDebuggerToolConfig<T>): MCPTool<T> => ({
  name: config.name,
  description: config.description,
  parameters: config.parameters,
  execute: async (params: T): Promise<string> => {
    const godot = getGodotConnection();
    const safeParams = (params ?? ({} as T));
    const payload = config.transformParams
      ? config.transformParams(safeParams)
      : (safeParams as unknown as Record<string, unknown>);

    try {
      const result = await godot.sendCommand(config.command, payload);

      if (result?.success === false) {
        throw new Error(result.message ?? `Failed to ${config.errorContext}`);
      }

      return config.successMessage(safeParams, result);
    } catch (error) {
      throw new Error(`Failed to ${config.errorContext}: ${(error as Error).message}`);
    }
  },
});

const formatBreakpointList = (result: CommandResult): string => {
  if (!result.breakpoints) {
    return 'No breakpoints information available';
  }

  const lines: string[] = ['Current breakpoints:'];

  for (const [scriptPath, breakpointLines] of Object.entries(result.breakpoints)) {
    if (Array.isArray(breakpointLines) && breakpointLines.length > 0) {
      lines.push(`- ${scriptPath}: ${breakpointLines.map((line: number) => `line ${line}`).join(', ')}`);
    }
  }

  if (lines.length === 1) {
    lines.push('No breakpoints set');
  }

  return lines.join('\n');
};

const formatDebuggerState = (state: CommandResult): string => {
  const lines: string[] = ['Debugger State:'];
  lines.push(`- Active: ${state.debugger_active ? 'Yes' : 'No'}`);

  if (Array.isArray(state.active_sessions) && state.active_sessions.length > 0) {
    lines.push(`- Active Sessions (IDs): ${state.active_sessions.join(', ')}`);
    lines.push(`- Session Count: ${state.active_sessions.length}`);
    lines.push(`- Current Session: ${state.current_session_id ?? 'None'}`);
    lines.push(`- Paused: ${state.paused ? 'Yes' : 'No'}`);
    lines.push(`- Total Breakpoints: ${state.total_breakpoints ?? 0}`);

    if (state.current_script && typeof state.current_line === 'number' && state.current_line >= 0) {
      lines.push(`- Current Location: ${state.current_script}:${state.current_line}`);
    }
  } else {
    lines.push('- No active debug sessions');
  }

  if (state.diagnostics) {
    const diag = state.diagnostics as Record<string, unknown>;
    const rawSessionObjects = diag['godot_session_objects'];
    if (Array.isArray(rawSessionObjects)) {
      const sessionSummaries = (rawSessionObjects as Array<Record<string, unknown>>)
        .map((info) => {
          const id = info['id'] ?? '?';
          const active = info['active'] ? 'active' : 'inactive';
          const paused = info['breaked'] ? 'paused' : 'running';
          return `#${id} (${active}, ${paused})`;
        });
      lines.push(`- Godot Sessions (${diag['godot_session_count'] ?? 0}): ${sessionSummaries.length > 0 ? sessionSummaries.join('; ') : 'none detected'}`);
    }
    if (Array.isArray(diag['tracked_sessions'])) {
      const tracked = (diag['tracked_sessions'] as Array<unknown>).map((id) => String(id));
      lines.push(`- Tracked Session IDs: ${tracked.length > 0 ? tracked.join(', ') : 'none'}`);
    }
  }

  return lines.join('\n');
};

const emptyParamsSchema = z.object({}) as z.ZodType<Record<string, never>>;

export const debuggerTools: MCPTool[] = [
  createSimpleDebuggerTool<DebuggerBreakpointParams>({
    name: 'debugger_set_breakpoint',
    description: 'Sets a breakpoint at a specific line in a script',
    command: 'debugger_set_breakpoint',
    parameters: z.object({
      script_path: z.string()
        .describe('The path to the script file (absolute or relative to res://)'),
      line: z.number()
        .int()
        .min(0)
        .describe('The line number where to set the breakpoint'),
    }),
    successMessage: ({ script_path, line }) => `Breakpoint set successfully at ${script_path}:${line}`,
    errorContext: 'set breakpoint',
  }),

  createSimpleDebuggerTool<DebuggerBreakpointParams>({
    name: 'debugger_remove_breakpoint',
    description: 'Removes a breakpoint at a specific line in a script',
    command: 'debugger_remove_breakpoint',
    parameters: z.object({
      script_path: z.string()
        .describe('The path to the script file (absolute or relative to res://)'),
      line: z.number()
        .int()
        .min(0)
        .describe('The line number where to remove the breakpoint'),
    }),
    successMessage: ({ script_path, line }) => `Breakpoint removed successfully from ${script_path}:${line}`,
    errorContext: 'remove breakpoint',
  }),

  {
    name: 'debugger_get_breakpoints',
    description: 'Gets all currently set breakpoints',
    parameters: emptyParamsSchema,
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('debugger_get_breakpoints', {});
        return formatBreakpointList(result);
      } catch (error) {
        throw new Error(`Failed to get breakpoints: ${(error as Error).message}`);
      }
    },
  },

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_clear_all_breakpoints',
    description: 'Clears all breakpoints',
    command: 'debugger_clear_all_breakpoints',
    parameters: emptyParamsSchema,
    successMessage: () => 'All breakpoints cleared successfully',
    errorContext: 'clear breakpoints',
  }),

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_pause_execution',
    description: 'Pauses the execution of the running project',
    command: 'debugger_pause_execution',
    parameters: emptyParamsSchema,
    successMessage: () => 'Execution paused successfully',
    errorContext: 'pause execution',
  }),

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_resume_execution',
    description: 'Resumes the execution of the paused project',
    command: 'debugger_resume_execution',
    parameters: emptyParamsSchema,
    successMessage: () => 'Execution resumed successfully',
    errorContext: 'resume execution',
  }),

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_step_over',
    description: 'Steps over the current line of code',
    command: 'debugger_step_over',
    parameters: emptyParamsSchema,
    successMessage: () => 'Step over executed successfully',
    errorContext: 'step over',
  }),

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_step_into',
    description: 'Steps into the current function call',
    command: 'debugger_step_into',
    parameters: emptyParamsSchema,
    successMessage: () => 'Step into executed successfully',
    errorContext: 'step into',
  }),

  {
    name: 'debugger_get_call_stack',
    description: 'Gets the current call stack',
    parameters: z.object({
      session_id: z.number()
        .int()
        .optional()
        .describe('Optional debug session ID (will use active session if not provided)'),
    }),
    execute: async ({ session_id }: DebuggerSessionParams): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const params = session_id !== undefined ? { session_id } : {};
        const result = await godot.sendCommand('debugger_get_call_stack', params);

        if (result.error) {
          throw new Error(result.error);
        }

        const frames = Array.isArray(result.frames) ? result.frames as RawStackFrame[] : [];
        if (frames.length === 0) {
          return 'Call stack is empty.';
        }

        const lines = frames.map((frame: RawStackFrame, index: number) => {
          const idx = typeof frame.index === 'number' ? frame.index : index;
          const fn = typeof frame.function === 'string' && frame.function.length > 0
            ? frame.function
            : '(anonymous)';
          const script = typeof frame.script === 'string' && frame.script.length > 0
            ? frame.script
            : (typeof frame.file === 'string' ? frame.file : '');
          const lineNumber = typeof frame.line === 'number' ? frame.line : -1;
          let location = script;
          if (lineNumber >= 0) {
            location = location.length > 0 ? `${location}:${lineNumber}` : `:${lineNumber}`;
          }
          if (location.length === 0 && typeof frame.location === 'string' && frame.location.length > 0) {
            location = frame.location;
          }
          if (location.length === 0) {
            location = 'location unavailable';
          }
          return `#${idx} ${fn} — ${location}`;
        });

        return [
          `Captured ${frames.length} frame(s)${result.session_id !== undefined ? ` (session ${result.session_id})` : ''}.`,
          ...lines
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get call stack: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'debugger_get_current_state',
    description: 'Gets the current state of the debugger',
    parameters: emptyParamsSchema,
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('debugger_get_current_state', {});
        return formatDebuggerState(result);
      } catch (error) {
        throw new Error(`Failed to get debugger state: ${(error as Error).message}`);
      }
    },
  },

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_enable_events',
    description: 'Enables debugger events for this client (required for breakpoint notifications)',
    command: 'debugger_enable_events',
    parameters: emptyParamsSchema,
    successMessage: (_, result) => `Debugger events enabled for client ${result.client_id}. You will now receive notifications for breakpoints and execution changes.`,
    errorContext: 'enable debugger events',
  }),

  createSimpleDebuggerTool<Record<string, never>>({
    name: 'debugger_disable_events',
    description: 'Disables debugger events for this client',
    command: 'debugger_disable_events',
    parameters: emptyParamsSchema,
    successMessage: (_, result) => `Debugger events disabled for client ${result.client_id}`,
    errorContext: 'disable debugger events',
  }),
];
