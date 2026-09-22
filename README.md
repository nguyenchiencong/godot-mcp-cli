# Godot MCP CLI

A Command Line Interface (CLI) for AI assistants to interact with Godot Engine, built on the Model Context Protocol (MCP). The CLI is the recommended way to use this tool as it saves context tokens compared to direct MCP integration.

[![npm version](https://img.shields.io/npm/v/godot-mcp-cli.svg)](https://www.npmjs.com/package/godot-mcp-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
- **Runtime Expression Evaluation**: Execute expressions in live games using `evaluate_runtime_expression`
- **Dynamic Script Access**: Read scripts via `godot://script/{path}` and metadata via `godot://script/{path}/metadata`
- **Script Editing Tools**: Create, edit, or template scripts directly through MCP commands
- **Script Diagnostics**: Parse GDScript files with `get_script_diagnostics`; `create_script` and `edit_script` return parse diagnostics automatically
- **Shader Tools**: Author `.gdshader` files with editor compile diagnostics and unused-declaration warnings (`create_shader`, `edit_shader`, `get_shader`, `shader_get_warnings`, `shader_project_health`) and debug shaders live in a running game: snapshot a material's shader source and uniforms (`shader_debug_snapshot`), hot reload with on-disk file sync and rollback (`shader_hot_reload`), reload from disk (`shader_reload_from_disk`), visualize UV/normals/screen/world positions or a custom expression (`shader_debug_visualize`), reset uniforms to their defaults (`shader_reset_uniforms`), measure per-viewport GPU/CPU frame times (`shader_measure_frame_time`), toggle wireframe/normal debug-draw overlays (`shader_debug_overlay`), capture the running game's rendered frame, optionally cropped to a node (`capture_running_game`), and inspect/set uniforms per-node or shader-wide (`shader_list_materials`, `shader_get_uniforms`, `shader_set_uniform`)
- **Node Management**: Create, remove, list, and inspect nodes with automatic path normalization
- **Node Warning Inspection**: Inspect current scene tree configuration warnings with `get_node_warnings`
- **Scene Operations**: Create, delete, open, and save scenes; query project info and current scene state
- **Visual Scene Feedback**: Render any scene into an off-screen viewport with `capture_scene` and receive the PNG image directly, so vision-capable models can see the scene
- **Scene Validation**: Check structural health of .tscn scenes (duplicate node names, missing scripts/resources, cyclic dependencies) with `validate_scene`
- **Asset Management**: List assets by type and enumerate project files with bounded offset pagination
- **Project Reload**: Restart editor, reload scenes, or rescan filesystem for external changes
- **Project Guidance**: Scan the project and generate `res://addons/godot_mcp/ai/project_guide.md` (and optionally `AGENTS.md`) with `generate_project_guidance`
- **Debug Output Access**: Snapshot logs with `get_debug_output` or read bounded cursor-based output via `stream_debug_output` without corrupting MCP stdout
- **Stack Trace Capture**: Pull the editor's Stack Trace text or grab structured frames via `get_stack_trace_panel` / `get_stack_frames_panel`
- **Editor Automation**: Execute explicitly opted-in GDScript in editor context via `execute_editor_script` (`allow_unsafe: true`)

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
- **Ordered Workflows**: Run bounded non-atomic `batch_operations` and automated `playtest` assertions over existing runtime tools
- **Action Discovery**: List all available input actions in the project (`get_input_actions`)

## Installation

### Option 1: Install via npm (Recommended)

```bash
npm install -g godot-mcp-cli
```

### Option 2: Build from Source

```bash
git clone https://github.com/nguyenchiencong/godot-mcp-cli.git
cd godot-mcp-cli/server
npm install
npm run build
npm link
```

## Quick Setup

### 1. Install the Addon to Your Godot Project

```bash
godot-mcp install-addon "path/to/your/project"
```

Or manually copy the `addons/godot_mcp` folder to your Godot project's `addons` directory.

### Agent Skills

The package bundles agent skills that teach AI assistants how to use the godot-mcp CLI for common Godot tasks: setup, scene editing, scripting, debugging, shader debugging, input testing, and the daily dev workflow.

Install all bundled skills into any repository (not just Godot projects):

```bash
godot-mcp install-skills "path/to/your/project"
```

This installs the skills to `<project>/.agents/skills/`, replacing previous copies of these skills while leaving unrelated skills in that directory untouched. Re-run the command to keep them up to date.

| Skill | Covers |
|-------|--------|
| godot-mcp-quickstart | Setup and connectivity: addon install, plugin enable, tool discovery, troubleshooting |
| godot-dev-workflow | The daily inspect-edit-run-verify-fix loop |
| godot-scene-editing | Scenes and nodes: structure, create/edit nodes, properties, transforms, capture |
| godot-scripting | GDScript and shader authoring: parse diagnostics, editor script execution, project guidance |
| godot-debugging | Debugger integration: breakpoints, pause/resume/step, call stacks, debug output |
| godot-shader-debugging | Live shader debugging in the running game: snapshot, uniforms, visualize, hot reload, frame times |
| godot-input-testing | Input simulation: actions, keyboard, mouse, sequences |

Agents load a skill based on its `description` frontmatter when a task matches; for example, a request to set a breakpoint loads godot-debugging. For user-level installs, copy `skills/` to `~/.agents/skills/` or `~/.pi/agent/skills/`.

See [skills/README.md](skills/README.md) for the full skill guide.

### 2. Enable the Plugin in Godot

1. Open your project in Godot
2. Go to Project > Project Settings > Plugins
3. Enable the "Godot MCP" plugin

The plugin listens on `ws://127.0.0.1:9080` by default. To use a different port (for example when 9080 is already taken), set the `GODOT_MCP_PORT` environment variable (integer 1024-65535) on the Godot editor process before launching it. The `godot-mcp` server/CLI resolves the same variable, so set it for both processes (or in a shared environment) when you move the port.

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
godot-mcp get_node_warnings
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

# Reload operations
godot-mcp rescan_filesystem
godot-mcp reload_scene
godot-mcp reload_project
```

For more CLI options, see the [CLI Documentation](docs/cli.md).

## Using the MCP Protocol

For direct MCP client integration, add this configuration:

### STDIO Transport (after npm install -g)
```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "godot-mcp",
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

### STDIO Transport (from source)
```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": ["path/to/godot-mcp-cli/server/dist/index.js"],
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
- [Agent Skills Guide](skills/README.md)
- [Tool Prompt Guide](docs/tool-prompt-guide.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/nguyenchiencong/godot-mcp-cli).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
