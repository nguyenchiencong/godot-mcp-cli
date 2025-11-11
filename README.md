# Godot MCP (Model Context Protocol)

A comprehensive integration between Godot Engine and AI assistants using the Model Context Protocol (MCP). This plugin allows AI assistants to interact with your Godot projects, providing powerful capabilities for code assistance, scene manipulation, project management, and real-time debugging.

## Features

### Core Functionality
- **Full Godot Project Access**: AI assistants can access and modify scripts, scenes, nodes, and project resources
- **Flexible Scene Inspection**: Retrieve hierarchy with `get_editor_scene_structure`, including properties and scripts
- **Runtime Scene Inspection**: Snapshot live scene tree from running games with `get_runtime_scene_structure`
- **Runtime Expression Evaluation**: Execute expressions in live games using `evaluate_runtime`
- **Dynamic Script Access**: Read scripts via `godot://script/{path}` and metadata via `godot://script/{path}/metadata`
- **Script Editing Tools**: Create, edit, or template scripts directly through MCP commands
- **Node Management**: Create, remove, list, and inspect nodes with automatic path normalization
- **Scene Operations**: Open, save, and create scenes; query project info and current scene state
- **Asset Management**: List assets by type and enumerate project files
- **Debug Output Access**: Snapshot logs with `get_debug_output` or tail them live via `stream_debug_output`
- **Editor Automation**: Execute GDScript in editor context via `execute_editor_script`

### **Debugger Integration**
- **Breakpoint Management**: Set, remove, and list breakpoints across scripts with `debugger_set_breakpoint`
- **Execution Control**: Pause, resume, and step through code with `debugger_pause_execution`, `debugger_step_over`
- **Real-time Events**: Live notifications for breakpoint hits and execution changes
- **Call Stack Inspection**: Access current call stack and frame information with `debugger_get_call_stack`
- **Session Management**: Support for multiple debug sessions
- **Runtime Debugging**: Full integration with Godot's debugging system
- **Event-driven Architecture**: Receive breakpoint hits and execution state changes in real-time

### Enhanced Resources
- `godot://debugger/state` - Current debugger state and session information
- `godot://debugger/breakpoints` - Active breakpoints across all scripts
- `godot://debugger/call-stack/{sessionId?}` - Call stack for specific debug session
- `godot://debugger/session/{sessionId}` - Detailed session information

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nguyenchiencong/godot-mcp.git
cd godot-mcp
```

### 2. Set Up the MCP Server

```bash
cd server
npm install
npm run build
# Return to project root
cd ..
```

### 3. Set Up Coding Assistant

1. Add the following configuration (or use the included `mcp.json` as a reference):

For STDIO:
```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": [
        "PATH_TO_YOUR_PROJECT/server/dist/index.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

For SSE: don't forget to build the server accordingly and start with npm start
```json
{
"mcpServers": {
  "godot-mcp": {
    "url": "http://localhost:8083/sse",
    "disabled": false,
    "alwaysAllow": []
  }
}
}
```
> **Note**: Replace `PATH_TO_YOUR_PROJECT` with the absolute path to where you have this repository stored.


2. Restart the coding assistant

### 4. Open the Example Project in Godot

1. Open Godot Engine
2. Select "Import" and navigate to the cloned repository
3. Open the `project.godot` file
4. The MCP plugin is already enabled in this example project

## Using MCP

After setup, you can work with your Godot project directly from Claude using natural language. Here are some examples:

### Example Prompts

```
@mcp godot-mcp read godot://script/current

I need help optimizing my player movement code. Can you suggest improvements?
```

```
@mcp godot-mcp run get-full-scene-tree

Add a cube in the middle of the scene and then make a camera that is looking at the cube.
```

```
@mcp godot-mcp read godot://scene/current

Create an enemy AI that patrols between waypoints and attacks the player when in range.
```

### New Enhanced Commands Examples

```
@mcp godot-mcp read godot://script/res://scripts/player.gd

Please analyze this player script and suggest improvements.
```

```
@mcp godot-mcp read godot://script/res://scripts/player.gd/metadata

What signals and helper methods does this script expose?
```

```
@mcp godot-mcp read godot://assets/images

List every image asset so I can review what art is already in the project.
```

```
@mcp godot-mcp run list_assets_by_type --type images

Show me all the images in my project and help me organize them better.
```

```
@mcp godot-mcp run execute_editor_script --code "
for node in get_tree().get_nodes_in_group('enemies'):
    node.set('health', 100)
print('All enemy health reset to 100')
"

Reset all enemy nodes' health to 100.
```

### Debugger Integration Examples

```
@mcp godot-mcp run debugger_enable_events

Enable debugger events to receive real-time notifications.
```

```
@mcp godot-mcp run debugger_set_breakpoint --script_path "res://scripts/player.gd" --line 39

Set a breakpoint in the player script at line 39.
```

```
@mcp godot-mcp run debugger_get_current_state

Check the current debugger state and active sessions.
```

```
@mcp godot-mcp run debugger_pause_execution

Pause the running game execution for debugging.
```

```
@mcp godot-mcp run debugger_step_over

Step over the current line while debugging.
```

```
@mcp godot-mcp read godot://debugger/state

Get comprehensive debugger state information.
```

### Natural Language Tasks Claude Can Perform

- "Create a main menu with play, options, and quit buttons"
- "Add collision detection to the player character"
- "Implement a day/night cycle system"
- "Refactor this code to use signals instead of direct references"
- "Debug why my player character falls through the floor sometimes"
- "Show me the full structure of my scene tree and explain the relationships"
- "Generate a script for enemy AI that follows the player"

## Available Resources and Commands

### Resource Endpoints:
- `godot://script/current` - The currently open script
- `godot://script/{path}` - Any script by path
- `godot://script/{path}/metadata` - Metadata (class, methods, signals) for a specific script
- `godot://scene/current` - The currently open scene
- `godot://scene/tree` - Complete scene tree hierarchy
- `godot://project/info` - Project metadata and settings
- `godot://assets/{type}` - Assets of specific type
- `godot://debug/log` - Debug output from editor

### Command Categories:

#### Node Commands
- `get-scene-tree` - Returns the scene tree structure
- `get-node-properties` - Gets properties of a specific node
- `create-node` - Creates a new node
- `delete-node` - Deletes a node
- `modify-node` - Updates node properties

#### Script Commands
- `list-project-scripts` - Lists all scripts in the project
- `read-script` - Reads a specific script
- `modify-script` - Updates script content
- `create-script` - Creates a new script
- `analyze-script` - Provides analysis of a script

#### Scene Commands
- `list-project-scenes` - Lists all scenes in the project
- `read-scene` - Reads scene structure
- `create-scene` - Creates a new scene
- `save-scene` - Saves current scene

#### Project Commands
- `get_project_settings` - Gets project settings
- `list_project_resources` - Lists project resources
- `run_project` - Runs the project using the configured main scene
- `run_current_scene` - Runs whichever scene is currently open in the editor
- `run_specific_scene` - Runs a specific saved scene by resource path
- `stop_running_project` - Stops the scene currently being played from the editor

#### Editor Commands
- `get_editor_state` - Gets current editor state
- `execute_editor_script` - Executes arbitrary GDScript code in the Godot editor context

#### Enhanced Commands
- `get_editor_scene_structure` - Returns the current scene hierarchy with optional `include_properties`, `include_scripts`, and `max_depth` filters
- `get_runtime_scene_structure` - Returns the runtime scene hierarchy from the running game (requires active debugger session)
- `evaluate_runtime` - Evaluates a GDScript expression inside the running game via the debugger bridge (requires the runtime autoload helper)
- `get_debug_output` - Retrieves debug logs from editor
- `get_editor_errors` - Reads the Errors tab from the Godot editor bottom panel
- `update_node_transform` - Updates node position, rotation, and scale
- `list_assets_by_type` - Lists project assets by type

#### Debugger Commands
- `debugger_set_breakpoint` - Set a breakpoint at a specific line in a script
- `debugger_remove_breakpoint` - Remove a breakpoint from a script
- `debugger_get_breakpoints` - List all currently set breakpoints
- `debugger_clear_all_breakpoints` - Clear all breakpoints at once
- `debugger_pause_execution` - Pause the execution of the running project
- `debugger_resume_execution` - Resume paused execution
- `debugger_step_over` - Step over the current line of code
- `debugger_step_into` - Step into the current function call
- `debugger_get_call_stack` - Get the current call stack information
- `debugger_get_current_state` - Get current debugger state and session info
- `debugger_enable_events` - Enable real-time debugger event notifications
- `debugger_disable_events` - Disable debugger event notifications

## Testing the Debugger

The project includes a comprehensive test setup for debugging:

### Quick Debugger Test
1. Start the MCP server: `cd server && npm run start`
2. Open `test_main_scene.tscn` in Godot Editor
3. Press **F5** to run with debugging enabled
4. Enable debugger events: `debugger_enable_events()`
5. Set a breakpoint: `debugger_set_breakpoint({script_path: "res://test_debugger.gd", line: 42})`
6. Wait for automatic breakpoint triggers

## Troubleshooting

### Connection Issues
- Ensure the plugin is enabled in Godot's Project Settings
- Check the Godot console for any error messages
- Verify the server is running when Claude Desktop launches it

### Plugin Not Working
- Reload Godot project after any configuration changes
- Check for error messages in the Godot console
- Make sure all paths in your Claude Desktop config are absolute and correct

### Debugger Issues

**"No active debugger session"**
- Ensure project is running with **F5** (Debug) from Godot Editor (not F6)
- Check that WebSocket server is running on port 9080
- Verify the MCP server is connected to Godot

**"Failed to set breakpoint"**
- Verify script path exists and is correct (use absolute `res://` paths)
- Check that line number is valid for the target script
- Ensure the project is running in debug mode

**Missing debugger events**
- Call `debugger_enable_events()` first to receive event notifications
- Check WebSocket connection status in server console
- Verify that only one client has events enabled at a time

**Breakpoint not hitting**
- Make sure the code execution actually reaches the breakpoint line
- Check console output for any debugger errors
- Test with the provided `test_debugger.gd` script to verify functionality

## Adding the Plugin to Your Own Godot Project

If you want to use the MCP plugin in your own Godot project:

1. Copy the `addons/godot_mcp` folder to your Godot project's `addons` directory
2. Open your project in Godot
3. Go to Project > Project Settings > Plugins
4. Enable the "Godot MCP" plugin

## New Files Added in This Fork

This fork adds several new files to the original project:

### Server-side (TypeScript)
- `server/src/resources/asset_resources.ts` - Asset querying functionality
- `server/src/resources/debug_resources.ts` - Debug output access
- `server/src/resources/debugger_resources.ts` - **Debugger state and resources**
- `server/src/tools/debugger_tools.ts` - **Debugger MCP tools**

### Godot-side (GDScript)
- `addons/godot_mcp/mcp_enhanced_commands.gd` - Enhanced command processor
- `addons/godot_mcp/mcp_script_resource_commands.gd` - Script resource processor
- `addons/godot_mcp/mcp_asset_commands.gd` - Asset commands processor
- `addons/godot_mcp/commands/debugger_commands.gd` - **Debugger command processor**
- `addons/godot_mcp/mcp_debugger_bridge.gd` - **EditorDebuggerPlugin for debugging**
- `addons/godot_mcp/runtime_debugger.gd` - **Runtime debugger script**

### Testing and Documentation
- `test_main_scene.tscn` - **Test scene for debugger functionality**
- `test_debugger.gd` - **Test script with breakpoint testing**

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/nguyenchiencong/godot-mcp).

## Documentation

For more detailed information, check the documentation in the `docs` folder:

- [Getting Started](docs/getting-started.md)
- [Installation Guide](docs/installation-guide.md)
- [Command Reference](docs/command-reference.md)
- [Tool Testing Guide](docs/testing-guide.md)
- [Architecture](docs/architecture.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
