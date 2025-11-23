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
- **Stack Trace Capture**: Pull the editor's Stack Trace text or grab structured frames via `get_stack_trace_panel` / `get_stack_frames_panel`
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

### 3. Add the Plugin to your Godot Project

1. Copy the `addons/godot_mcp` folder to your Godot project's `addons` directory
2. Open your project in Godot
3. Go to Project > Project Settings > Plugins
4. Enable the "Godot MCP" plugin

### 4. Set Up Coding Assistant

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

### There's already an Example Project in this repository

1. Open Godot Engine
2. Select "Import" and navigate to the cloned repository
3. Open the `project.godot` file
4. The MCP plugin is already enabled in this example project

## Using MCP

After setup, you can work with your Godot project directly from Claude using natural language. Read the [Getting Started](docs/getting-started.md) guide for more information.

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

## Contributing

No contribution is needed. But, contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/nguyenchiencong/godot-mcp).

## Documentation

For more detailed information, check the documentation in the `docs` folder:

- [Getting Started](docs/getting-started.md)
- [Installation Guide](docs/installation-guide.md)
- [Command Reference](docs/command-reference.md)
- [Tool Testing Guide](docs/testing-guide.md)
- [Architecture](docs/architecture.md)
- [CLI Usage](docs/cli.md)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
