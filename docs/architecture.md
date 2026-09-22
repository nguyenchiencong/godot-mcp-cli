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
| `utils/godot_connection.ts` | Bounded WebSocket client to Godot (8 MiB messages, 64 pending commands, truthful response deadlines) |
| `utils/debug_output_buffer.ts` | Bounded cursor-based debug stream buffer |
| `tools/*.ts` | MCP tool definitions, including ordered `batch_operations` and bounded `playtest` orchestration |
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
- `shader_tools.ts` - Shader authoring (create/edit/get, compile diagnostics) and runtime shader inspection (materials/uniforms)

### Godot Addon (`addons/godot_mcp/`)

| File | Purpose |
|------|---------|
| `mcp_server.gd` | Main plugin, manages lifecycle |
| `websocket_server.gd` | WebSocket server on port 9080 by default (`GODOT_MCP_PORT` override, 1024-65535) with finite message/packet buffers and per-frame packet budgeting |
| `command_handler.gd` | Routes commands to processors; mutation admission is bounded FIFO and each dispatch is awaited, so the next mutation starts only after the current one (input sequences, editor scripts included) completes or hits its deadline, while read-only inspection remains concurrent |
| `commands/*.gd` | Command processors by category |
| `commands/capture_commands.gd` | Scene capture (`capture_scene`) |
| `commands/validation_commands.gd` | Script diagnostics and scene validation |
| `mcp_debugger_bridge.gd` | EditorDebuggerPlugin for debugging |
| `mcp_runtime_debugger_bridge.gd` | Runtime scene inspection |
| `mcp_input_handler.gd` | Input simulation autoload |
| `mcp_debug_output_publisher.gd` | Publishes editor Output-panel text to subscribers; signal-driven control resolution |
| `mcp_shader_error_logger.gd` | Custom `Logger` capturing `ERROR_TYPE_SHADER` into a marker-correlated buffer for compile diagnostics |
| `mcp_shader_runtime.gd` | Game-side autoload registering the `mcp_shader` debugger capture for runtime shader inspection |
| `runtime_debugger.gd` | Script injected into debugged projects |
| `ui/mcp_panel.*` | Dock panel UI |

**Command Processors:**
- `node_commands.gd` - Node operations
- `scene_commands.gd` - Scene operations
- `script_commands.gd` - Script operations
- `debugger_commands.gd` - Debugger operations
- `input_commands.gd` - Input simulation
- `editor_commands.gd` - Editor state
- `project_commands.gd` - Project info (tree scans use a single parameterized DFS walker)
- `capture_commands.gd` - Scene capture
- `validation_commands.gd` - Script diagnostics and scene validation
- `shader_commands.gd` - Shader authoring plus runtime shader material/uniform tools
- `mcp_enhanced_commands.gd` - Runtime inspection
- `mcp_asset_commands.gd` - Asset operations

### Diagnostics & Feedback

`get_script_diagnostics` (and the automatic diagnostics returned by `create_script`/`edit_script`) runs the headless `--check-only` parser on a worker thread, so broken scripts never block the editor main thread; results are cached per script content (bounded to 64 entries).

The debug output publisher (`mcp_debug_output_publisher.gd`) caches the Output-panel control and its NodePath, recovers via `SceneTree` signals, and never scans the editor control tree during its 0.5s poll.

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

## Shader Tooling

Shader support has two layers:

**Authoring (editor-side).** `shader_commands.gd` handles `create_shader`,
`edit_shader`, `get_shader`, and `shader_get_compile_errors`. Compile
diagnostics come from `mcp_shader_error_logger.gd`, a custom `Logger` installed
via `OS.add_logger()` that captures `ERROR_TYPE_SHADER` into a thread-safe,
marker-correlated buffer. After a write the processor forces a fresh load
(`CACHE_MODE_REPLACE` + `Shader.get_rid()`) and drains errors recorded after a
marker; results are path-filtered and deduplicated.

**Runtime (game-side).** `shader_list_materials`, `shader_get_uniforms`, and
`shader_set_uniform` target the running game. The `MCPShaderRuntime` autoload
registers the `mcp_shader` `EngineDebugger` capture and answers with
primitives-only payloads; `mcp_runtime_debugger_bridge.gd` correlates
`mcp_shader:result` replies by request id in a bounded per-session store. Writes
use strict value coercion and refuse shared materials unless `allow_shared`.

See `docs/adr/adr-001-shader-tooling.md` for the full rationale.

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
- Arbitrary editor scripts require explicit `allow_unsafe: true`
- Batch execution is ordered but non-atomic and has no rollback
- Command errors are returned to callers where possible; opted-in arbitrary editor code can still block or crash the editor
