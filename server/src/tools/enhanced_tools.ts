// File: /server/src/tools/enhanced_tools.ts
import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

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
        
        if (!result.output || result.output.length === 0) {
          return 'No debug output available.';
        }
        
        return `Debug Output:\n${result.output}`;
      } catch (error) {
        throw new Error(`Failed to get debug output: ${(error as Error).message}`);
      }
    },
  },
];
