# Godot MCP Architecture

## Overview

The Godot MCP enables AI assistants to interact with Godot Engine via WebSocket. It supports both MCP protocol and CLI access.

```
AI Assistant / CLI
       |
       v
TypeScript Server (MCP + CLI)
       |
       v (WebSocket :9080)
Godot Addon (Editor Plugin)
       |
       v
Godot Engine APIs
```

## Components

### TypeScript Server (`server/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | MCP server entry point |
| `cli.ts` | Command-line interface |
| `utils/godot_connection.ts` | WebSocket client to Godot |
| `tools/*.ts` | MCP tool definitions |
| `resources/*.ts` | MCP resource definitions |

**Tool Categories:**
- `node_tools.ts` - Node creation, deletion, properties
- `scene_tools.ts` - Scene management
- `script_tools.ts` - Script editing
- `debugger_tools.ts` - Breakpoints, execution control
- `input_tools.ts` - Input simulation
- `editor_tools.ts` - Editor automation
- `project_tools.ts` - Project operations
- `asset_tools.ts` - Asset management
- `enhanced_tools.ts` - Runtime inspection

### Godot Addon (`addons/godot_mcp/`)

| File | Purpose |
|------|---------|
| `mcp_server.gd` | Main plugin, manages lifecycle |
| `websocket_server.gd` | WebSocket server on port 9080 |
| `command_handler.gd` | Routes commands to processors |
| `commands/*.gd` | Command processors by category |
| `mcp_debugger_bridge.gd` | EditorDebuggerPlugin for debugging |
| `mcp_runtime_debugger_bridge.gd` | Runtime scene inspection |
| `mcp_input_handler.gd` | Input simulation autoload |
| `runtime_debugger.gd` | Script injected into debugged projects |
| `ui/mcp_panel.*` | Dock panel UI |

**Command Processors:**
- `node_commands.gd` - Node operations
- `scene_commands.gd` - Scene operations
- `script_commands.gd` - Script operations
- `debugger_commands.gd` - Debugger operations
- `input_commands.gd` - Input simulation
- `editor_commands.gd` - Editor state
- `project_commands.gd` - Project info

## Communication

### Message Format

**Command (Server to Godot):**
```json
{
  "type": "command_name",
  "params": { ... },
  "commandId": "cmd_123"
}
```

**Response (Godot to Server):**
```json
{
  "status": "success",
  "result": { ... },
  "commandId": "cmd_123"
}
```

**Error:**
```json
{
  "status": "error",
  "message": "Error description",
  "commandId": "cmd_123"
}
```

### Debugger Events

Debugger uses events for real-time notifications:
- `breakpoint_hit` - Execution hit a breakpoint
- `execution_paused` / `execution_resumed` - Pause state changes
- `stack_frame_changed` - Stack frame navigation

Events are throttled (100ms minimum) to prevent flooding.

## Input Simulation

Input commands flow through the debugger message system:

```
TypeScript Server
       |
       v (WebSocket command)
MCPInputCommands (editor-side)
       |
       v (EngineDebugger.send_message)
MCPInputHandler (runtime autoload)
       |
       v
Godot Input System
```

`MCPInputHandler` is auto-registered as an autoload when the plugin is enabled.

## Key Patterns

- **Command Pattern**: Commands encapsulated with type + params
- **Proxy Pattern**: Server proxies Godot functionality to AI
- **Observer Pattern**: WebSocket events for connections/messages
- **Promise Pattern**: Async command execution with timeouts

## Security

- WebSocket accepts localhost connections only (default)
- All commands validated before execution
- Errors isolated from crashing the editor
