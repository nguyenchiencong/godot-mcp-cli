# Godot MCP + CLI

A Command Line Interface (CLI) for AI assistants to interact with Godot Engine, built on the Model Context Protocol (MCP). The CLI is the recommended way to use this tool as it saves context tokens compared to direct MCP integration.

## When to Use What

| Method | Best For | Token Usage |
|--------|----------|-------------|
| **CLI** (recommended) | AI coding assistants, scripting, automation | Low - only tool output in context |
| **MCP** | Direct MCP client integration | High - full protocol in context |

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

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/nguyenchiencong/godot-mcp.git
cd godot-mcp
```

### 2. Build and Link the CLI

```bash
cd server
npm install
npm run build
npm link
```

### 3. Install the Addon to Your Project

```bash
godot-mcp install-addon "path/to/your/project"
```

Or manually copy the `addons/godot_mcp` folder to your Godot project's `addons` directory.

### 4. Enable the Plugin in Godot

1. Open your project in Godot
2. Go to Project > Project Settings > Plugins
3. Enable the "Godot MCP" plugin

## Using the CLI (Recommended)

The CLI is the most efficient way for AI assistants to interact with Godot. It consumes fewer tokens than the MCP protocol.

### Basic Commands

```bash
# List all available tools
godot-mcp --list-tools

# Get help for a specific tool
godot-mcp --help get_debug_output

# Execute tools
godot-mcp get_debug_output
godot-mcp get_project_info
godot-mcp run_project

# With arguments
godot-mcp debugger_set_breakpoint --script-path res://test_debugger.gd --line 42
godot-mcp simulate_action_tap --action ui_accept
godot-mcp simulate_mouse_click --x 400 --y 300
```

### CLI Examples

```bash
# Scene and node operations
godot-mcp get_current_scene
godot-mcp get_editor_scene_structure --include-properties true
godot-mcp list_nodes --parent-path "."

# Debugging
godot-mcp run_project
godot-mcp debugger_get_current_state
godot-mcp debugger_pause_execution
godot-mcp debugger_resume_execution

# Input simulation (requires running game)
godot-mcp get_input_actions
godot-mcp simulate_action_tap --action "ui_accept"
godot-mcp simulate_key_press --key "SPACE"
```

For more CLI options, see the [CLI Documentation](docs/cli.md).

## Using the MCP Protocol

For direct MCP client integration, add this configuration:

### STDIO Transport
```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": ["PATH_TO_REPO/server/dist/index.js"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

### SSE Transport
```json
{
  "mcpServers": {
    "godot-mcp": {
      "url": "http://localhost:8083/sse"
    }
  }
}
```

## Documentation

- [Installation Guide](docs/installation-guide.md)
- [Command Reference](docs/command-reference.md)
- [Architecture](docs/architecture.md)
- [CLI Usage](docs/cli.md)
- [Tool Prompt Guide](docs/tool-prompt-guide.md)

## Contributing

No contribution is needed. But, contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/nguyenchiencong/godot-mcp).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
