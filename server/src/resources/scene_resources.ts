import { getGodotConnection } from '../utils/godot_connection.js';

/**
 * Resource that provides a list of all scenes in the project
 */
export const sceneListResource = {
  uri: 'godot/scenes',
  name: 'Godot Scene List',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();
    
    try {
      // Call a command on the Godot side to list all scenes
      const result = await godot.sendCommand('list_project_files', {
        extensions: ['.tscn', '.scn']
      });
      
      if (result && result.files) {
        return {
          text: JSON.stringify({
            scenes: result.files,
            count: result.files.length
          })
        };
      } else {
        return {
          text: JSON.stringify({
            scenes: [],
            count: 0
          })
        };
      }
    } catch (error) {
      console.error('Error fetching scene list:', error);
      throw error;
    }
  }
};

/**
 * Resource that provides detailed information about a specific scene
 */
export const sceneStructureResource = {
    uri: 'godot/scene/current',
    name: 'Godot Scene Structure',
    mimeType: 'application/json',
    async load() {
        const godot = getGodotConnection();
        
        try {
            // Call a command on the Godot side to get current scene structure
            const result = await godot.sendCommand('get_editor_scene_structure', {
                include_properties: true,
                include_scripts: true,
            });
            
            return {
                text: JSON.stringify(result)
            };
        } catch (error) {
            console.error('Error fetching scene structure:', error);
            throw error;
        }
    }
};

/**
 * Resource that provides the complete scene tree hierarchy
 */
export const fullSceneTreeResource = {
  uri: 'godot/scene/tree',
  name: 'Full Scene Tree',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();
    
    try {
      // Call a command on the Godot side to get the full scene tree
      const result = await godot.sendCommand('get_editor_scene_structure', {
        include_properties: true,
        include_scripts: true,
      });
      
      return {
        text: JSON.stringify(result.structure ?? result)
      };
    } catch (error) {
      console.error('Error fetching full scene tree:', error);
      throw error;
    }
  }
};
