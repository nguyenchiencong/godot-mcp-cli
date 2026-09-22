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
      offset: z.number().int().min(0).optional().describe('Zero-based page offset (default 0).'),
      limit: z.number().int().min(1).max(1000).optional().describe('Page size (default 200, maximum 1000).'),
    }),
    execute: async ({ type, offset, limit }): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('list_assets_by_type', { type, ...(offset === undefined ? {} : { offset }), ...(limit === undefined ? {} : { limit }) });
        
        if (result && typeof result === 'object' && result.error) {
          throw new Error(result.error);
        }

        // Format the results into human-readable output
        const assetCount = result.count || 0;
        const assetType = result.assetType || type;
        
        if (assetCount === 0) {
          return `No ${assetType} assets found in the project.`;
        }
        
        const fileList = result.files.join('\n- ');

        const page = result.truncated ? ` Page ${result.offset ?? 0}-${(result.offset ?? 0) + (result.returned_count ?? assetCount)} of ${result.total_count ?? '?'}. Request offset ${result.next_offset} for more.` : '';
        return [
          `Found ${assetCount} ${assetType} assets in this page.${page}`,
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
      offset: z.number().int().min(0).optional().describe('Zero-based page offset (default 0).'),
      limit: z.number().int().min(1).max(1000).optional().describe('Page size (default 200, maximum 1000).'),
    }),
    execute: async ({ extensions = [], offset, limit }): Promise<string> => {
      const godot = getGodotConnection();
      
      try {
        const result = await godot.sendCommand('list_project_files', { extensions, ...(offset === undefined ? {} : { offset }), ...(limit === undefined ? {} : { limit }) });
        
        const fileCount = result.files ? result.files.length : 0;
        const extensionStr = extensions.length > 0 ? extensions.join(', ') : 'all';
        const scanWarning = result.scan_truncated
          ? ` Warning: the project scan hit the ${100000}-entry cap; this page may be incomplete (scan_truncated).`
          : '';
        
        if (fileCount === 0) {
          if ((result.total_count ?? 0) > 0 && (result.returned_count ?? 0) === 0) {
            return `Requested offset ${result.offset ?? offset ?? 0} is past the end: the scan found ${result.total_count} matching files but returned none at this offset. Use offset 0 or a smaller offset.${scanWarning}`;
          }
          return `No files with extensions ${extensionStr} found in the project.${scanWarning}`;
        }
        
        const fileList = result.files.join('\n- ');

        const page = result.truncated ? ` Page ${result.offset ?? 0}-${(result.offset ?? 0) + (result.returned_count ?? fileCount)} of ${result.total_count ?? '?'}. Request offset ${result.next_offset} for more.` : '';
        return [
          `Found ${fileCount} files with extensions ${extensionStr} in this page.${page}${scanWarning}`,
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
