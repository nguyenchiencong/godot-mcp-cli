// File: /server/src/tools/asset_tools.ts
import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Tools for asset management in Godot
 */
export const assetTools: MCPTool[] = [
  {
    name: 'list_assets_by_type',
    description: 'List all assets of a specific type in the project',
    parameters: z.object({
      type: z.string()
        .describe('Type of assets to list. Valid types: "scripts" (.gd), "scenes" (.tscn), "images" (.png, .jpg, etc.), "audio" (.ogg, .mp3, .wav), "fonts" (.ttf, .otf), "models" (.glb, .gltf, .obj, .fbx), "shaders" (.gdshader), "resources" (.tres, .res), "all" (everything)'),
    }),
    execute: async ({ type }): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('list_assets_by_type', { type });
        
        // Format the results into human-readable output
        const assetCount = result.count || 0;
        const assetType = result.assetType || type;
        
        if (assetCount === 0) {
          return `No ${assetType} assets found in the project.`;
        }
        
        const fileList = result.files.join('\n- ');

        return [
          `Found ${assetCount} ${assetType} assets in the project.`,
          '',
          'Assets:',
          `- ${fileList}`
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to list assets: ${(error as Error).message}`);
      }
    },
  },
  
  {
    name: 'list_project_files',
    description: 'List files in the project matching specified extensions',
    parameters: z.object({
      extensions: z.array(z.string()).optional()
        .describe('File extensions to filter by (e.g. [".tscn", ".gd"])'),
    }),
    execute: async ({ extensions = [] }): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('list_project_files', { extensions });
        
        const fileCount = result.files ? result.files.length : 0;
        const extensionStr = extensions.length > 0 ? extensions.join(', ') : 'all';
        
        if (fileCount === 0) {
          return `No files with extensions ${extensionStr} found in the project.`;
        }
        
        const fileList = result.files.join('\n- ');

        return [
          `Found ${fileCount} files with extensions ${extensionStr} in the project.`,
          '',
          'Files:',
          `- ${fileList}`
        ].join('\n');
      } catch (error) {
        throw new Error(`Failed to list project files: ${(error as Error).message}`);
      }
    },
  },
];
