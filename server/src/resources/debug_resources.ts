import { Resource } from 'fastmcp';
import { getGodotConnection } from '../utils/godot_connection.js';

/**
 * Resource that provides access to Godot's debug output log
 */
export const debugOutputResource: Resource = {
  uri: 'godot/debug/log',
  name: 'Godot Debug Output',
  mimeType: 'text/plain',
  async load() {
    const godot = getGodotConnection();
    
    try {
      // Call a command on the Godot side to get debug output
      const result = await godot.sendCommand('get_debug_output');
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

        return {
          text: [
            'No debug output available.',
            `Capture source: ${source}`,
            `Detail: ${detail}`,
            `Control class: ${controlClass}`,
            `Control path: ${controlPath}`,
            `Log file path: ${logFilePath}`,
            `Control search: ${controlSearch}`,
          ].join('\n'),
        };
      }

      return {
        text: outputText,
      };
    } catch (error) {
      console.error('Error fetching debug output:', error);
      throw error;
    }
  }
};
