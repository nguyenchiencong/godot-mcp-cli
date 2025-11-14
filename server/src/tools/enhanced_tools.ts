// File: /server/src/tools/enhanced_tools.ts
import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Enhanced tools for more complex operations in Godot
 */

// Constants
const MAX_FRAMES_DISPLAY = 10;
const DEFAULT_INDENT_SIZE = 2;

// Type Definitions
interface SceneNode {
  name: string;
  type: string;
  children?: SceneNode[];
  visibility?: {
    has_visible_method?: boolean;
    visible?: boolean;
    visible_in_tree?: boolean;
  };
}

interface StackFrame {
  index?: number | string;
  function?: string;
  location?: string;
  script?: string;
  line?: number;
}

interface Diagnostics {
  error?: string;
  source?: string;
  detail?: string;
  control_class?: string;
  control_path?: string;
  tab_title?: string;
  log_file_path?: string;
  control_search?: string;
  timestamp?: number;
  search_summary?: string;
  fallback_source?: string;
  attempts?: unknown[];
}

interface PanelResult extends Record<string, unknown> {
  text?: string;
  lines?: unknown[];
  line_count?: number;
  frames?: unknown[];
  diagnostics?: Diagnostics;
}

// Utility Functions
function formatNode(node: SceneNode, depth: number = 0, includeVisibility: boolean = false): string {
  const indent = ' '.repeat(depth * DEFAULT_INDENT_SIZE);
  let output = `${indent}${node.name} (${node.type})`;

  if (includeVisibility && node.visibility) {
    const flags: string[] = [];
    if (node.visibility.has_visible_method) flags.push('has-visible');
    if (node.visibility.visible) flags.push('visible');
    if (node.visibility.visible_in_tree) flags.push('visible-in-tree');
    if (flags.length > 0) {
      output += ` [${flags.join(', ')}]`;
    }
  }

  if (node.children && node.children.length > 0) {
    output += '\n';
    output += node.children
      .map((child: SceneNode) => formatNode(child, depth + 1, includeVisibility))
      .join('\n');
  }

  return output;
}

function summarizeStackFrame(frame: StackFrame): string {
  const indexValue = typeof frame.index === 'number'
    ? frame.index
    : (typeof frame.index === 'string' && frame.index.length > 0 ? Number(frame.index) : undefined);

  const fnName = typeof frame.function === 'string' && frame.function.length > 0
    ? frame.function
    : '(anonymous)';

  const location = typeof frame.location === 'string' && frame.location.length > 0
    ? frame.location
    : (() => {
        const script = typeof frame.script === 'string' ? frame.script : '';
        const line = typeof frame.line === 'number' ? frame.line : undefined;
        if (script && line !== undefined) {
          return `${script}:${line}`;
        }
        return script || 'location unavailable';
      })();

  if (typeof indexValue === 'number' && Number.isFinite(indexValue)) {
    return `[${indexValue}] ${fnName} — ${location}`;
  }
  return `${fnName} — ${location}`;
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function safeGetDiagnostics(result: Record<string, unknown>): Diagnostics {
  if (typeof result.diagnostics === 'object' && result.diagnostics !== null) {
    return result.diagnostics as Diagnostics;
  }
  return {};
}

function safeGetStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item));
  }
  return [];
}

function formatEmptyDebugOutput(diagnostics: Diagnostics): string {
  const source = diagnostics.source || 'unknown';
  const detail = diagnostics.detail || 'No additional detail from publisher.';
  const controlClass = diagnostics.control_class || 'unset';
  const controlPath = diagnostics.control_path || 'unset';
  const logFilePath = diagnostics.log_file_path || 'not-found';
  const controlSearch = diagnostics.control_search || 'control search summary unavailable';

  return [
    'No debug output available.',
    `Capture source: ${source}`,
    `Detail: ${detail}`,
    `Control class: ${controlClass}`,
    `Control path: ${controlPath}`,
    `Log file path: ${logFilePath}`,
    `Control search: ${controlSearch}`,
  ].join('\n');
}

function formatPanelHeader(diagnostics: Diagnostics, lineCount: number, frameCount: number, successMessage: string): string[] {
  const header: string[] = [];

  if (diagnostics.error) {
    header.push(`${successMessage}: ${diagnostics.error}`);
  } else {
    header.push(`${successMessage}.`);
  }

  header.push(`Lines captured: ${lineCount}`);
  header.push(`Frames parsed: ${frameCount}`);

  if (diagnostics.control_path) {
    header.push(`Panel control: ${diagnostics.control_path}`);
  } else if (diagnostics.control_class) {
    header.push(`Panel type: ${diagnostics.control_class}`);
  }

  if (diagnostics.tab_title) {
    header.push(`Tab title: ${diagnostics.tab_title}`);
  }

  if (diagnostics.fallback_source) {
    header.push(`Fallback source: ${diagnostics.fallback_source}`);
  }

  if (typeof diagnostics.timestamp === 'number') {
    header.push(`Captured: ${new Date(diagnostics.timestamp).toISOString()}`);
  }

  if (diagnostics.search_summary) {
    header.push(`Search summary: ${diagnostics.search_summary}`);
  }

  return header;
}

function formatStackFrames(frames: StackFrame[]): string {
  if (frames.length === 0) {
    return 'No structured frames were parsed.';
  }

  return frames
    .slice(0, MAX_FRAMES_DISPLAY)
    .map((frame, index) => `#${index}: ${summarizeStackFrame(frame)}`)
    .join('\n');
}

// Module state for debug output streaming
let debugOutputListenerAttached = false;

/**
 * Enhanced tools for more complex operations in Godot
 */
export const enhancedTools: MCPTool[] = [
  {
    name: 'get_editor_scene_structure',
    description: 'Get the current scene hierarchy with optional detail flags',
    parameters: z.object({
      include_properties: z.boolean().optional()
        .describe('Include common editor properties (position, rotation, etc.)'),
      include_scripts: z.boolean().optional()
        .describe('Include attached script information'),
      max_depth: z.number().int().min(0).optional()
        .describe('Limit traversal depth (0 = only root)')
    }),
    execute: async ({ include_properties, include_scripts, max_depth }): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const params: Record<string, unknown> = {};
        if (include_properties !== undefined) params.include_properties = include_properties;
        if (include_scripts !== undefined) params.include_scripts = include_scripts;
        if (max_depth !== undefined) params.max_depth = max_depth;

        const result = await godot.sendCommand('get_editor_scene_structure', params);

        if (result.error) {
          return `Scene structure unavailable: ${result.error}`;
        }

        if (!result.structure || Object.keys(result.structure).length === 0) {
          return 'No scene is currently open or the scene is empty.';
        }

        const structure = result.structure as SceneNode;
        return [
          `Current Scene: ${result.path}`,
          `Root Node: ${result.root_node_name} (${result.root_node_type})`,
          '',
          'Scene Tree:',
          formatNode(structure)
        ].join('\n');
      } catch (err) {
        throw new Error(`Failed to get scene structure: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'get_runtime_scene_structure',
    description: 'Inspect the live scene tree from the running game via the debugger',
    parameters: z.object({
      include_properties: z.boolean().optional()
        .describe('Include common properties (position, rotation, etc.) when available'),
      include_scripts: z.boolean().optional()
        .describe('Include script information when available'),
      max_depth: z.number().int().min(0).optional()
        .describe('Limit traversal depth (0 = only root)'),
      timeout_ms: z.number().int().min(100).max(5000).optional()
        .describe('How long to wait for a live scene snapshot (milliseconds)')
    }),
    execute: async ({ include_properties, include_scripts, max_depth, timeout_ms }): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const params: Record<string, unknown> = {};
        if (include_properties !== undefined) params.include_properties = include_properties;
        if (include_scripts !== undefined) params.include_scripts = include_scripts;
        if (max_depth !== undefined) params.max_depth = max_depth;
        if (timeout_ms !== undefined) params.timeout_ms = timeout_ms;

        const result = await godot.sendCommand('get_runtime_scene_structure', params);

        if (result.error) {
          return `Runtime scene structure unavailable: ${result.error}`;
        }

        if (!result.structure) {
          return 'Runtime scene data is unavailable. Ensure the project is running with the debugger attached.';
        }

        const structure = result.structure as SceneNode;
        const scenePath = result.scene_path || 'Unknown scene';
        const rootName = result.root_node_name || structure.name || 'Root';
        const rootType = result.root_node_type || structure.type || 'Node';

        return [
          `Runtime Scene Path: ${scenePath}`,
          `Root Node: ${rootName} (${rootType})`,
          '',
          'Live Scene Tree:',
          formatNode(structure, 0, true)
        ].join('\n');
      } catch (err) {
        throw new Error(`Failed to get runtime scene structure: ${(err as Error).message}`);
      }
    },
  },

  {
    name: 'get_debug_output',
    description: 'Get the debug output from the Godot editor',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('get_debug_output', {});
        const outputText = typeof result.output === 'string' ? result.output : '';
        const diagnostics = safeGetDiagnostics(result);

        if (!outputText || outputText.length === 0) {
          return formatEmptyDebugOutput(diagnostics);
        }

        return `Debug Output:\n${outputText}`;
      } catch (err) {
        throw new Error(`Failed to get debug output: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'get_editor_errors',
    description: 'Read the Errors tab from the Godot editor bottom panel.',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('get_editor_errors', {});
        const text = typeof result?.text === 'string' ? result.text : '';
        const lines = safeGetStringArray(result?.lines);
        const lineCount = typeof result?.line_count === 'number'
          ? result.line_count
          : (lines.length > 0 ? lines.length : (text.length > 0 ? text.split('\n').length : 0));

        const diagnostics = safeGetDiagnostics(result);

        const detailLines: string[] = [];
        if (diagnostics.control_path) {
          detailLines.push(`Control path: ${diagnostics.control_path}`);
        } else if (diagnostics.control_class) {
          detailLines.push(`Control class: ${diagnostics.control_class}`);
        }
        if (typeof diagnostics.timestamp === 'number') {
          detailLines.push(`Captured: ${new Date(diagnostics.timestamp).toISOString()}`);
        }
        if (diagnostics.search_summary) {
          detailLines.push(`Search summary: ${diagnostics.search_summary}`);
        }

        if (text.length === 0) {
          return detailLines.length > 0
            ? `Errors tab is empty.\n${detailLines.join('\n')}`
            : 'Errors tab is empty.';
        }

        const headerSections = ['Errors Tab Contents', `Lines: ${lineCount}`];
        if (detailLines.length > 0) {
          headerSections.push(detailLines.join(' | '));
        }

        const body = lines.length > 0 ? lines.join('\n') : text;
        return `${headerSections.join('\n')}\n\n${body}`;
      } catch (err) {
        throw new Error(`Failed to read Errors tab: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'get_stack_trace_panel',
    description: 'Capture the Godot debugger Stack Trace panel text and structured frames.',
    parameters: z.object({
      session_id: z.number().int().optional()
        .describe('Optional debugger session ID to associate with the capture (defaults to the active session).')
    }),
    execute: async ({ session_id }): Promise<string> => {
      const godot = getGodotConnection();

      const params: Record<string, unknown> = {};
      if (session_id !== undefined) {
        params.session_id = session_id;
      }

      try {
        const result = await godot.sendCommand('get_stack_trace_panel', params);
        const panel = (result?.stack_trace_panel ?? {}) as PanelResult;
        const diagnostics = safeGetDiagnostics(panel);
        const lines = safeGetStringArray(panel.lines);
        const frames = Array.isArray(panel.frames) ? panel.frames as StackFrame[] : [];
        const lineCount = typeof panel.line_count === 'number' ? panel.line_count : lines.length;
        const resolvedSessionId = typeof result?.session_id === 'number' ? result.session_id : undefined;

        const header = formatPanelHeader(diagnostics, lineCount, frames.length, 'Stack trace panel captured successfully');

        if (resolvedSessionId !== undefined && resolvedSessionId >= 0) {
          header.push(`Session ID: ${resolvedSessionId}`);
        }

        const frameSection = formatStackFrames(frames);
        const body = lines.length > 0
          ? lines.join('\n')
          : (typeof panel.text === 'string' && panel.text.length > 0
            ? panel.text
            : 'Stack Trace tab is empty.');

        return [
          header.join('\n'),
          '',
          'Parsed Frames:',
          frameSection,
          '',
          'Stack Trace Panel:',
          body
        ].join('\n');
      } catch (err) {
        throw new Error(`Failed to capture stack trace panel: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'get_stack_frames_panel',
    description: 'Capture the Stack Frames panel contents (tree or text fallback) from the Godot editor.',
    parameters: z.object({
      session_id: z.number().int().optional()
        .describe('Optional debugger session ID (defaults to the active session).'),
      refresh: z.boolean().optional()
        .describe('Request a fresh stack dump from the debugger before capturing.')
    }),
    execute: async ({ session_id, refresh }): Promise<string> => {
      const godot = getGodotConnection();

      const params: Record<string, unknown> = {};
      if (session_id !== undefined) params.session_id = session_id;
      if (refresh !== undefined) params.refresh = refresh;

      try {
        const result = await godot.sendCommand('get_stack_frames_panel', params);
        const panel = (result?.stack_frames_panel ?? {}) as PanelResult;
        const diagnostics = safeGetDiagnostics(panel);
        const lines = safeGetStringArray(panel.lines);
        const frames = Array.isArray(panel.frames) ? panel.frames as StackFrame[] : [];
        const lineCount = typeof panel.line_count === 'number' ? panel.line_count : lines.length;

        const header = formatPanelHeader(diagnostics, lineCount, frames.length, 'Stack Frames panel captured successfully');
        const frameSection = formatStackFrames(frames);
        const body = lines.length > 0
          ? lines.join('\n')
          : (typeof panel.text === 'string' && panel.text.length > 0
            ? panel.text
            : 'Stack Frames tab is empty.');

        return [
          header.join('\n'),
          '',
          'Parsed Frames:',
          frameSection,
          '',
          'Stack Frames Panel:',
          body
        ].join('\n');
      } catch (err) {
        throw new Error(`Failed to capture stack frames panel: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'evaluate_runtime_expression',
    description: 'Evaluate a GDScript expression inside the running game via the remote debugger',
    parameters: z.object({
      expression: z.string().min(1)
        .describe('Expression to evaluate in the runtime context (executed with the chosen node as self).'),
      context_path: z.string().optional()
        .describe('Optional node path (e.g. "/root/Main/Player") to use as the evaluation context.'),
      capture_prints: z.boolean().optional()
        .describe('Include print output from the expression (default true).'),
      timeout_ms: z.number().int().min(100).max(5000).optional()
        .describe('How long to wait for the evaluation result in milliseconds.')
    }),
    execute: async ({ expression, context_path, capture_prints, timeout_ms }): Promise<string> => {
      const godot = getGodotConnection();

      const params: Record<string, unknown> = { expression };
      if (context_path !== undefined) params.context_path = context_path;
      if (capture_prints !== undefined) params.capture_prints = capture_prints;
      if (timeout_ms !== undefined) params.timeout_ms = timeout_ms;

      try {
        const result = await godot.sendCommand('evaluate_runtime', params);

        if (!result) {
          return 'Runtime evaluation did not return a result.';
        }

        if (result.error) {
          return `Runtime evaluation failed: ${result.error}`;
        }

        const success = result.success !== false;
        const formattedValue = formatValue(result.result);
        const outputLines = safeGetStringArray(result.output);

        const sections: string[] = [];
        sections.push(success ? 'Runtime evaluation succeeded.' : 'Runtime evaluation completed with errors.');
        sections.push(`Result: ${formattedValue}`);
        if (outputLines.length > 0) {
          sections.push('Print Output:');
          sections.push(outputLines.join('\n'));
        }
        if (result.error && result.error.length > 0 && success) {
          sections.push(`Notes: ${result.error}`);
        }

        return sections.join('\n');
      } catch (err) {
        throw new Error(`Failed to evaluate expression: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'clear_debug_output',
    description: 'Clear the Godot editor Output panel and reset streaming state.',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('clear_debug_output', {});
        const diagnostics = safeGetDiagnostics(result);

        if (!result?.cleared) {
          const reason = typeof result?.message === 'string' && result.message.length > 0
            ? result.message
            : (diagnostics.error || 'Unknown reason');
          return `Failed to clear debug output: ${reason}`;
        }

        const method = typeof result.method === 'string' && result.method.length > 0
          ? result.method
          : 'unspecified method';
        const attempts = Array.isArray(diagnostics.attempts)
          ? diagnostics.attempts.map(entry => String(entry)).join(', ')
          : 'n/a';
        const timestamp = typeof diagnostics.timestamp === 'number'
          ? new Date(diagnostics.timestamp).toISOString()
          : 'n/a';

        return [
          'Debug Output panel cleared successfully.',
          `Method: ${method}`,
          `Attempts: ${attempts}`,
          `Timestamp: ${timestamp}`
        ].join('\n');
      } catch (err) {
        throw new Error(`Failed to clear debug output: ${(err as Error).message}`);
      }
    },
  },
  {
    name: 'stream_debug_output',
    description: 'Subscribe or unsubscribe from live streaming of the editor Output panel.',
    parameters: z.object({
      action: z.enum(['start', 'stop']).default('start')
        .describe('Choose "start" to begin streaming or "stop" to unsubscribe.')
    }),
    execute: async ({ action }): Promise<string> => {
      const godot = getGodotConnection();

      if (!debugOutputListenerAttached) {
        debugOutputListenerAttached = true;
        godot.on('debug_output_frame', frame => {
          try {
            const frameData = frame as Record<string, unknown>;
            const lines = safeGetStringArray(frameData.lines);
            const chunk = typeof frameData.chunk === 'string' ? frameData.chunk : '';

            if (frameData.reset) {
              console.log('\n[Godot Debug] Log reset.');
            }
            if (lines.length > 0) {
              for (const line of lines) {
                console.log(`[Godot Debug] ${line}`);
              }
            } else if (chunk.length > 0) {
              console.log(`[Godot Debug] ${chunk}`);
            }
          } catch (err) {
            console.error('Failed to print debug frame:', err);
          }
        });
      }

      if (action === 'start') {
        await godot.sendCommand('subscribe_debug_output', {});
        return 'Subscribed to live debug output. New log lines will appear in the console.';
      }

      await godot.sendCommand('unsubscribe_debug_output', {});
      return 'Unsubscribed from live debug output.';
    },
  },
];
