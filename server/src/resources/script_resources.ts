import { getGodotConnection } from '../utils/godot_connection.js';

/**
 * Resource for script list
 */
export const scriptListResource = {
  uri: 'godot/scripts',
  name: 'Script List',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();
    try {
      const result = await godot.sendCommand('list_project_files', {
        extensions: ['.gd', '.cs']
      });
      
      if (result && result.files) {
        return {
          text: JSON.stringify({
            scripts: result.files,
            count: result.files.length,
            gdscripts: result.files.filter((f: string) => f.endsWith('.gd')),
            csharp_scripts: result.files.filter((f: string) => f.endsWith('.cs'))
          })
        };
      } else {
        return {
          text: JSON.stringify({
            scripts: [],
            count: 0,
            gdscripts: [],
            csharp_scripts: []
          })
        };
      }
    } catch (error) {
      console.error('Error fetching script list:', error);
      throw error;
    }
  }
};

/**
 * Template resource for retrieving script content by path.
 */
export const scriptByPathResourceTemplate = {
  uriTemplate: 'godot/script/{path}',
  name: 'Script Content By Path',
  mimeType: 'text/plain',
  arguments: [
    {
      name: 'path' as const,
      description: 'Path to the script (e.g. res://scripts/player.gd)',
      required: true
    }
  ],
  async load({ path }: { path: string }) {
    const godot = getGodotConnection();
    try {
      if (!path || path.trim() === '') {
        throw new Error('Script path must be provided.');
      }

      let normalizedPath = path.trim();
      if (!normalizedPath.startsWith('res://')) {
        normalizedPath = `res://${normalizedPath}`;
      }

      const result = await godot.sendCommand('get_script', { path: normalizedPath });

      if (!result || result.script_found === false) {
        const message = result?.error ?? `Script not found at ${normalizedPath}`;
        throw new Error(message);
      }

      return {
        text: result.content ?? '',
        metadata: {
          path: result.script_path ?? normalizedPath,
          language: normalizedPath.endsWith('.gd') ? 'gdscript' :
                    normalizedPath.endsWith('.cs') ? 'csharp' : 'unknown'
        }
      };
    } catch (error) {
      console.error('Error fetching script content by path:', error);
      throw error;
    }
  }
};

/**
 * Template resource for retrieving script metadata by path.
 */
export const scriptMetadataResourceTemplate = {
  uriTemplate: 'godot/script/{path}/metadata',
  name: 'Script Metadata By Path',
  mimeType: 'application/json',
  arguments: [
    {
      name: 'path' as const,
      description: 'Path to the script (e.g. res://scripts/player.gd)',
      required: true
    }
  ],
  async load({ path }: { path: string }) {
    const godot = getGodotConnection();
    try {
      if (!path || path.trim() === '') {
        throw new Error('Script path must be provided for metadata lookup.');
      }

      let normalizedPath = path.trim();
      if (!normalizedPath.startsWith('res://')) {
        normalizedPath = `res://${normalizedPath}`;
      }

      const result = await godot.sendCommand('get_script_metadata', { path: normalizedPath });

      if (!result) {
        throw new Error(`Metadata not available for ${normalizedPath}`);
      }

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        text: JSON.stringify(result)
      };
    } catch (error) {
      console.error('Error fetching script metadata by path:', error);
      throw error;
    }
  }
};
