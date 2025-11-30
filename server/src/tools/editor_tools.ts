import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool, CommandResult } from '../utils/types.js';

interface ExecuteEditorScriptParams {
  code: string;
}

interface ReloadProjectParams {
  save?: boolean;
}

interface ReloadSceneParams {
  scene_path?: string;
}

export const editorTools: MCPTool[] = [
  {
    name: 'execute_editor_script',
    description: 'Executes arbitrary GDScript code in the Godot editor',
    parameters: z.object({
      code: z.string()
        .describe('GDScript code to execute in the editor context'),
    }),
    execute: async ({ code }: ExecuteEditorScriptParams): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('execute_editor_script', { code });
        
        // Format output for display
        let outputText = 'Script executed successfully';
        
        if (result.output && Array.isArray(result.output) && result.output.length > 0) {
          outputText += '\n\nOutput:\n' + result.output.join('\n');
        }
        
        if (result.result) {
          outputText += '\n\nResult:\n' + JSON.stringify(result.result, null, 2);
        }
        
        return outputText;
      } catch (error) {
        throw new Error(`Script execution failed: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'reload_project',
    description: 'Restart the Godot editor to fully reload the project. This will disconnect the MCP connection temporarily.',
    parameters: z.object({
      save: z.boolean()
        .optional()
        .default(true)
        .describe('Whether to save all open scenes before restarting (default: true)'),
    }),
    execute: async ({ save }: ReloadProjectParams): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand<CommandResult>('reload_project', { save: save ?? true });
        return `Godot editor is restarting${save ? ' (saving changes)' : ' (without saving)'}. The MCP connection will be temporarily lost.`;
      } catch (error) {
        throw new Error(`Failed to reload project: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'reload_scene',
    description: 'Reload a scene from disk, discarding any unsaved changes. If no scene path is provided, reloads the currently open scene.',
    parameters: z.object({
      scene_path: z.string()
        .optional()
        .describe('Resource path to the scene to reload (e.g. "res://scenes/main.tscn"). If not provided, reloads the current scene.'),
    }),
    execute: async ({ scene_path }: ReloadSceneParams): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand<CommandResult>('reload_scene', { scene_path: scene_path ?? '' });
        const reloadedPath = result?.scene_path ?? scene_path ?? 'current scene';
        return `Scene reloaded from disk: ${reloadedPath}`;
      } catch (error) {
        throw new Error(`Failed to reload scene: ${(error as Error).message}`);
      }
    },
  },

  {
    name: 'rescan_filesystem',
    description: 'Rescan the project filesystem to detect external file changes. Use this after adding, removing, or modifying files outside the editor.',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        await godot.sendCommand<CommandResult>('rescan_filesystem');
        return 'Filesystem rescan initiated. The editor will update to reflect any external file changes.';
      } catch (error) {
        throw new Error(`Failed to rescan filesystem: ${(error as Error).message}`);
      }
    },
  },
];