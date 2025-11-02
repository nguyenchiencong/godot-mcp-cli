// File: /server/src/index.ts
import { FastMCP } from 'fastmcp';
import { nodeTools } from './tools/node_tools.js';
import { scriptTools } from './tools/script_tools.js';
import { sceneTools } from './tools/scene_tools.js';
import { editorTools } from './tools/editor_tools.js';
import { assetTools } from './tools/asset_tools.js';
import { enhancedTools } from './tools/enhanced_tools.js';
import { scriptResourceTools } from './tools/script_resource_tools.js';
import { getGodotConnection } from './utils/godot_connection.js';

// Import resources
import {
  sceneListResource,
  sceneStructureResource,
  fullSceneTreeResource
} from './resources/scene_resources.js';
import {
  scriptListResource,
  scriptByPathResourceTemplate,
  scriptMetadataResourceTemplate
} from './resources/script_resources.js';
import {
  projectStructureResource,
  projectSettingsResource,
  projectResourcesResource
} from './resources/project_resources.js';
import {
  editorStateResource,
  selectedNodeResource,
  currentScriptResource
} from './resources/editor_resources.js';
import { assetListResource, assetByTypeResourceTemplate } from './resources/asset_resources.js';
import { debugOutputResource } from './resources/debug_resources.js';

/**
 * Main entry point for the Godot MCP server
 */
async function main() {
  console.error('Starting Enhanced Godot MCP server...');

  // Create FastMCP instance
  const server = new FastMCP({
    name: 'EnhancedGodotMCP',
    version: '1.1.0',
  });

  // Register all tools
  const allTools = [
    ...nodeTools,
    ...scriptTools,
    ...sceneTools,
    ...editorTools,
    ...assetTools,
    ...enhancedTools,
    ...scriptResourceTools
  ];

  allTools.forEach(tool => {
    server.addTool(tool);
    console.error(`Registered tool: ${tool.name}`);
  });

  // Register all resources
  server.addResource(sceneListResource);
  server.addResource(scriptListResource);
  server.addResource(projectStructureResource);
  server.addResource(projectSettingsResource);
  server.addResource(projectResourcesResource);
  server.addResource(editorStateResource);
  server.addResource(selectedNodeResource);
  server.addResource(currentScriptResource);
  server.addResource(sceneStructureResource);
  server.addResource(fullSceneTreeResource);
  server.addResource(debugOutputResource);
  server.addResource(assetListResource);
  server.addResourceTemplate(scriptByPathResourceTemplate);
  server.addResourceTemplate(scriptMetadataResourceTemplate);
  server.addResourceTemplate(assetByTypeResourceTemplate);

  console.error('All resources and tools registered');

  // Try to connect to Godot
  try {
    const godot = getGodotConnection();
    await godot.connect();
    console.error('Successfully connected to Godot WebSocket server');
  } catch (error) {
    const err = error as Error;
    console.warn(`Could not connect to Godot: ${err.message}`);
    console.warn('Will retry connection when commands are executed');
  }

  // Start the server

  // Start with stdio transport
  server.start({
    transportType: 'stdio',
  });

  // Start with SSE transport
  // server.start({
  //   transportType: 'sse',
  //   sse: {
  //     endpoint: '/sse',
  //     port: 8083
  //   }
  // });


  console.error('Enhanced Godot MCP server started');
  console.error('Ready to process commands from Claude or other AI assistants');

  // Handle cleanup
  const cleanup = () => {
    console.error('Shutting down Enhanced Godot MCP server...');
    const godot = getGodotConnection();
    godot.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// Start the server
main().catch(error => {
  console.error('Failed to start Enhanced Godot MCP server:', error);
  process.exit(1);
});
