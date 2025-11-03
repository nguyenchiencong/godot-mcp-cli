// File: /server/src/tools/enhanced_tools.ts
import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Enhanced tools for more complex operations in Godot
 */
let debugOutputListenerAttached = false;

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

        const formatNode = (node: any, depth = 0): string => {
          const indent = ' '.repeat(depth * 2);
          let output = `${indent}${node.name} (${node.type})`;

          if (node.children && node.children.length > 0) {
            output += '\n';
            output += node.children.map((child: any) => formatNode(child, depth + 1)).join('\n');
          }

          return output;
        };

        return `Current Scene: ${result.path}\nRoot Node: ${result.root_node_name} (${result.root_node_type})\n\nScene Tree:\n${formatNode(result.structure)}`;
      } catch (error) {
        throw new Error(`Failed to get scene structure: ${(error as Error).message}`);
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

        const formatNode = (node: any, depth = 0): string => {
          const indent = ' '.repeat(depth * 2);
          let output = `${indent}${node.name} (${node.type})`;
          if (node.visibility) {
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
            output += node.children.map((child: any) => formatNode(child, depth + 1)).join('\n');
          }

          return output;
        };

        const scenePath = result.scene_path || 'Unknown scene';
        const rootName = result.root_node_name || result.structure?.name || 'Root';
        const rootType = result.root_node_type || result.structure?.type || 'Node';

        return [
          `Runtime Scene Path: ${scenePath}`,
          `Root Node: ${rootName} (${rootType})`,
          '',
          'Live Scene Tree:',
          formatNode(result.structure)
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to get runtime scene structure: ${(error as Error).message}`);
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
        
        const outputText: string = typeof result.output === 'string' ? result.output : '';
        const diagnostics = typeof result.diagnostics === 'object' && result.diagnostics !== null
          ? result.diagnostics as Record<string, unknown>
          : {};

        if (!outputText || outputText.length === 0) {
          const source = typeof diagnostics.source === 'string' && diagnostics.source.length > 0
            ? diagnostics.source
            : 'unknown';
          const detail = typeof diagnostics.detail === 'string' && diagnostics.detail.length > 0
            ? diagnostics.detail
            : 'No additional detail from publisher.';
          const controlClass = typeof diagnostics.control_class === 'string' && diagnostics.control_class.length > 0
            ? diagnostics.control_class
            : 'unset';
          const controlPath = typeof diagnostics.control_path === 'string' && diagnostics.control_path.length > 0
            ? diagnostics.control_path
            : 'unset';
          const logFilePath = typeof diagnostics.log_file_path === 'string' && diagnostics.log_file_path.length > 0
            ? diagnostics.log_file_path
            : 'not-found';
          const controlSearch = typeof diagnostics.control_search === 'string' && diagnostics.control_search.length > 0
            ? diagnostics.control_search
            : 'control search summary unavailable';
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
        
        return `Debug Output:\n${outputText}`;
      } catch (error) {
        throw new Error(`Failed to get debug output: ${(error as Error).message}`);
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
        const outputLines: string[] = Array.isArray(result.output) ? result.output.map((line: unknown) => String(line)) : [];

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
      } catch (error) {
        throw new Error(`Failed to evaluate expression: ${(error as Error).message}`);
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
            const lines: string[] = Array.isArray((frame as any)?.lines) ? (frame as any).lines : [];
            const chunk: string = typeof (frame as any)?.chunk === 'string' ? (frame as any).chunk : '';
            if ((frame as any)?.reset) {
              console.error('\n[Godot Debug] Log reset.');
            }
            if (lines.length > 0) {
              for (const line of lines) {
                console.error(`[Godot Debug] ${line}`);
              }
            } else if (chunk.length > 0) {
              console.error(`[Godot Debug] ${chunk}`);
            }
          } catch (error) {
            console.error('Failed to print debug frame:', error);
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
