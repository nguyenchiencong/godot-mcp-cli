# Godot MCP Installation Guide

## Prerequisites

- Godot 4.x
- Node.js 18+ and npm

## Installation

### 1. Clone and Build

```bash
git clone https://github.com/nguyenchiencong/godot-mcp.git
cd godot-mcp/server
npm install
npm run build
npm link
```

### 2. Install Addon to Your Project

```bash
godot-mcp install-addon "C:/path/to/your/project"
```

Or manually copy `addons/godot_mcp` to your project's `addons` folder.

### 3. Enable Plugin

1. Open your project in Godot
2. Go to Project > Project Settings > Plugins
3. Enable "Godot MCP"

The WebSocket server starts automatically on port 9080.

## Usage

### CLI (Recommended)

```bash
godot-mcp --list-tools           # List available tools
godot-mcp get_project_info       # Execute a tool
godot-mcp --help <tool_name>     # Get help for a tool
```

### MCP Protocol

Add to your MCP client config:

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

## Testing the Debugger

This repository includes a test project for verifying debugger functionality.

### Quick Test

```bash
# 1. Run the project (from Godot or CLI)
godot-mcp run_project

# 2. Set a breakpoint
godot-mcp debugger_set_breakpoint --script-path res://test_debugger.gd --line 42

# 3. Wait for breakpoint hit, then check state
godot-mcp debugger_get_current_state
godot-mcp debugger_get_call_stack

# 4. Resume execution
godot-mcp debugger_resume_execution
```

### Test Scene Controls

When running `test_main_scene.tscn`:
- **SPACE** - Trigger manual pause point
- **R** - Reset counter
- **T** - Call test function

The scene auto-triggers breakpoints every ~60 frames.

### Debugger Requirements

- Run with **F5** (Debug) in Godot Editor, not F6
- WebSocket server must be running (auto-starts with plugin)
- Only one client can receive debugger events at a time

## Troubleshooting

### Connection Issues

- Verify WebSocket server is running (check Godot MCP panel)
- Default port is 9080
- Check firewall isn't blocking localhost

### Debugger Issues

| Problem | Solution |
|---------|----------|
| "No active debugger session" | Run project with F5, not F6 |
| "Failed to set breakpoint" | Check script path exists (`res://...`) |
| Breakpoint not hitting | Ensure code execution reaches that line |
| No events received | Call `debugger_enable_events` first |

### Command Errors

- Check Godot console for errors
- Verify paths use `res://` format
- Ensure a scene is loaded
