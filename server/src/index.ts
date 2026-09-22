// File: /server/src/index.ts
import { FastMCP } from 'fastmcp';
import { nodeTools } from './tools/node_tools.js';
import { scriptTools } from './tools/script_tools.js';
import { sceneTools } from './tools/scene_tools.js';
import { editorTools } from './tools/editor_tools.js';
import { assetTools } from './tools/asset_tools.js';
import { enhancedTools } from './tools/enhanced_tools.js';
import { debuggerTools } from './tools/debugger_tools.js';
import { projectTools } from './tools/project_tools.js';
import { inputTools } from './tools/input_tools.js';
import { captureTools } from './tools/capture_tools.js';
import { diagnosticsTools } from './tools/diagnostics_tools.js';
import { shaderTools } from './tools/shader_tools.js';
import { createBatchTool } from './tools/batch_tools.js';
import { createPlaytestTool } from './tools/playtest_tools.js';
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
import {
  debuggerStateResource,
  debuggerBreakpointsResource,
  debuggerCallStackResourceTemplate,
  debuggerSessionResourceTemplate
} from './resources/debugger_resources.js';

/**
 * Main entry point for the Godot MCP server
 */
async function main() {
  console.error('Starting Enhanced Godot MCP server...');

  // Create FastMCP instance
  const server = new FastMCP({
    name: 'EnhancedGodotMCP',
    version: '1.7.0',
  });

  // Register all tools
  const allTools = [
    ...nodeTools,
    ...scriptTools,
    ...sceneTools,
    ...editorTools,
    ...assetTools,
    ...enhancedTools,
    ...projectTools,
    ...debuggerTools,
    ...inputTools,
    ...captureTools,
    ...diagnosticsTools,
    ...shaderTools
  ];
  const batchTool = createBatchTool(allTools);
  const playtestTool = createPlaytestTool();
  const registeredTools = [...allTools, batchTool, playtestTool];

  registeredTools.forEach(tool => {
    server.addTool(tool);
  });
  console.error(`Registered ${registeredTools.length} tools`);

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
  server.addResource(debuggerStateResource);
  server.addResource(debuggerBreakpointsResource);
  server.addResourceTemplate(scriptByPathResourceTemplate);
  server.addResourceTemplate(scriptMetadataResourceTemplate);
  server.addResourceTemplate(assetByTypeResourceTemplate);
  server.addResourceTemplate(debuggerCallStackResourceTemplate);
  server.addResourceTemplate(debuggerSessionResourceTemplate);

  console.error('All resources and tools registered');

  // Try to connect to Godot
  const godot = getGodotConnection();
  godot.connect().then(
    () => console.error('Successfully connected to Godot WebSocket server'),
    (error) => {
      console.warn(`Could not connect to Godot: ${(error as Error).message}`);
      console.warn('Will retry connection when commands are executed');
    }
  );

  // Start with stdio transport. FastMCP startup is asynchronous; await it so
  // startup failures reach the outer catch instead of leaving a half-live pipe.
  await server.start({
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

  // Handle cleanup exactly once. Do not write protocol diagnostics to stdout.
  let shuttingDown = false;
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('Shutting down Enhanced Godot MCP server...');
    getGodotConnection().disconnect();
    try {
      await server.stop();
    } catch (error) {
      console.error('FastMCP shutdown failed:', error);
    }
  };

  const handleSignal = () => {
    void cleanup().then(() => process.exit(0));
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
}

// Start the server
main().catch(error => {
  console.error('Failed to start Enhanced Godot MCP server:', error);
  process.exit(1);
});
