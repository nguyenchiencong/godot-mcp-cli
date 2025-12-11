import { getGodotConnection } from '../utils/godot_connection.js';

type AssetType = 'images' | 'audio' | 'fonts' | 'models' | 'shaders' | 'resources' | 'all';

// Fix: Using Record type instead of a mapped type in interface
type AssetMap = Record<AssetType, string[]>;

const extensionMap: AssetMap = {
  images: ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.bmp', '.tga'],
  audio: ['.ogg', '.mp3', '.wav', '.opus'],
  fonts: ['.ttf', '.otf', '.fnt', '.font'],
  models: ['.glb', '.gltf', '.obj', '.fbx'],
  shaders: ['.gdshader', '.shader'],
  resources: ['.tres', '.res', '.theme', '.material'],
  all: []
};

interface FileStructure {
  [key: string]: FileStructure | string;
}

interface AssetQueryParams {
  type: AssetType;
}

/**
 * Resource for retrieving asset lists
 */
export const assetListResource = {
  uri: 'godot/assets',
  name: 'Asset List',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();
    
    try {
      // If type is not provided, list all files
      const result = await godot.sendCommand('list_project_files', {
        extensions: []
      });
      
      const files = result.files || [];
      const organizedFiles: FileStructure = {};
      
      files.forEach((file: string) => {
        const parts = file.split('/');
        let current: FileStructure = organizedFiles;
        
        for (let i = 1; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!(part in current)) {
            current[part] = {};
          }
          current = current[part] as FileStructure;
        }
        
        const fileName = parts[parts.length - 1];
        current[fileName] = file;
      });
      
      return {
        text: JSON.stringify({
          count: files.length,
          files: files,
          organizedFiles: organizedFiles
        })
      };
    } catch (error) {
      console.error('Error fetching asset list:', error);
      throw error;
    }
  }
};

/**
 * Template resource for retrieving assets filtered by type.
 */
export const assetByTypeResourceTemplate = {
  uriTemplate: 'godot/assets/{type}',
  name: 'Typed Asset List',
  mimeType: 'application/json',
  arguments: [
    {
      name: 'type' as const,
      description: 'Asset category (images, audio, fonts, models, shaders, resources, all)',
      required: true
    }
  ],
  async load({ type }: { type: string }) {
    const godot = getGodotConnection();

    try {
      const incomingType = (type ?? 'all').toLowerCase();
      const validTypes: AssetType[] = ['images', 'audio', 'fonts', 'models', 'shaders', 'resources', 'all'];
      const assetType = (validTypes.includes(incomingType as AssetType) ? incomingType : 'all') as AssetType;

      const result = await godot.sendCommand('list_assets_by_type', { type: assetType });
      return {
        text: JSON.stringify(result)
      };
    } catch (error) {
      console.error('Error fetching assets by type:', error);
      throw error;
    }
  }
};
