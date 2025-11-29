# Godot MCP + CLI

A comprehensive integration between Godot Engine and AI assistants using the Model Context Protocol (MCP) or Command Line Interface (CLI). This plugin allows AI assistants to interact with your Godot projects, providing powerful capabilities for code assistance, scene manipulation, project management, and real-time debugging. When dealing with extensive context, the command-line interface (CLI) provides an efficient way to manage and interact with the protocol.

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

### **Input Simulation**
- **Action Simulation**: Press, release, and tap input actions (`simulate_action_press`, `simulate_action_tap`)
- **Mouse Control**: Click, move, and drag operations (`simulate_mouse_click`, `simulate_drag`)
- **Keyboard Input**: Simulate key presses with modifier support (`simulate_key_press`)
- **Input Sequences**: Execute complex input combos with precise timing (`simulate_input_sequence`)
- **Action Discovery**: List all available input actions in the project (`get_input_actions`)

### Enhanced Resources
- `godot://debugger/state` - Current debugger state and session information
- `godot://debugger/breakpoints` - Active breakpoints across all scripts
- `godot://debugger/call-stack/{sessionId?}` - Call stack for specific debug session
- `godot://debugger/session/{sessionId}` - Detailed session information

### Input Simulation Tools
- `simulate_action_press` / `simulate_action_release` / `simulate_action_tap` - Input action simulation
- `simulate_mouse_click` / `simulate_mouse_move` / `simulate_drag` - Mouse input simulation
- `simulate_key_press` - Keyboard input with modifier support
- `simulate_input_sequence` - Complex input combos with timing
- `get_input_actions` - Discover available input actions

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nguyenchiencong/godot-mcp.git
cd godot-mcp
```

### 2. Set Up the Server

```bash
cd server
npm install
npm run build
# Link the CLI
npm link
```

### 3. Install the addon to a project

Copy the `addons/godot_mcp` folder to your Godot project's `addons` directory or use the CLI to install it:
```bash
godot-mcp install-addon "C:/path/to/your/project"
```

### 4. Open your project in Godot

1. Open your project in Godot
2. Go to Project > Project Settings > Plugins
3. Enable the "Godot MCP" plugin

## Using the MCP

### Set Up Coding Assistant

1. Add the following configuration to your MCP client:

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

After setup, you can work with your Godot project directly from Claude using natural language. Read the [Getting Started](docs/getting-started.md) guide for more information.

## Using the CLI

The project includes a command-line interface (CLI) for interacting with the server without using the MCP. This is useful for testing, automation, or manual control without eating up your AI assistant's tokens.

### Basic Commands

- **List available tools**:
```bash
# List available tools
godot-mcp --list-tools
# Get help for a specific tool
godot-mcp --help get_debug_output
# Execute a tool
godot-mcp get_debug_output
# With arguments
godot-mcp debugger_set_breakpoint --script_path res://test_debugger.gd --line 42
```

For more advanced usage and options, see the [CLI Documentation](docs/cli.md).

## Testing the Debugger

The project includes a comprehensive test setup for debugging:

### There's already an Example Project in this repository
1. Open Godot Engine
2. Select "Import" and navigate to the cloned repository
3. Open the `project.godot` file
4. The MCP plugin is already enabled in this example project

### Quick Debugger Test
1. Start the MCP server: `cd server && npm run start`
2. Open `test_main_scene.tscn` in Godot Editor
3. Press **F5** to run with debugging enabled
4. Enable debugger events: `debugger_enable_events()`
5. Set a breakpoint: `debugger_set_breakpoint({script_path: "res://test_debugger.gd", line: 42})`
6. Wait for automatic breakpoint triggers

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
