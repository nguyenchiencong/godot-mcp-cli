---
name: godot-mcp-quickstart
description: Set up and verify connectivity between the godot-mcp CLI and the Godot editor, covering addon installation, plugin enablement, tool discovery, output modes, and timeouts. Use when installing godot-mcp-cli, running a godot-mcp command for the first time, troubleshooting "godot not responding" or connection failures, or verifying that the MCP server is reachable.
---

# Godot MCP Quickstart

## Quick start

1. Install the CLI:

   ```bash
   npm install -g godot-mcp-cli
   ```

2. Install the addon into the Godot project:

   ```bash
   godot-mcp install-addon "C:/path/to/your/project"
   ```

3. Enable the plugin: open the project in Godot, go to Project > Project Settings > Plugins, and enable "Godot MCP". The WebSocket server starts automatically on port 9080.

4. Verify connectivity:

   ```bash
   godot-mcp get_project_info
   ```

   A successful call returns the project name, Godot version, and current scene path. Any other result means the editor is not reachable.

## Workflows

### Discover available tools

```bash
godot-mcp --list-tools
```

### Inspect a tool before calling it

```bash
godot-mcp --help debugger_set_breakpoint
```

### Verify a running game is attached

```bash
godot-mcp debugger_get_current_state
```

### Connectivity troubleshooting checklist

Work through in order when a call fails or reports "godot not responding":

1. Is the Godot editor open with the project loaded? The CLI talks to the editor over WebSocket; nothing works without it.
2. Is the "Godot MCP" plugin enabled (Project > Project Settings > Plugins)? The WebSocket server only starts when the plugin is active.
3. Is port 9080 free and reachable? The plugin listens on localhost:9080 by default; check the Godot MCP panel in the editor and make sure the firewall is not blocking localhost. If 9080 is already occupied (for example by another editor), set `GODOT_MCP_PORT` (1024-65535) for both the editor and the godot-mcp server/CLI process (both honor it) before launching; the client then connects on that port automatically.
4. Was the addon installed into the right project? The CLI connects to whatever project is currently open in the editor.
5. Is the timeout long enough? Slow machines can exceed the default; raise it with `--timeout 10000`.
6. Retry with diagnostics to see the failure reason: `godot-mcp get_project_info --verbose`.

## Advanced features

### Output modes

- Default: human-readable summary of the tool result.
- `--raw`: full MCP JSON response, useful for structured data.
- `--verbose`: progress logs plus server stderr diagnostics.
- `--params-json '{"session_id":1}'`: pass parameters as one JSON object instead of individual flags.

### Timeouts

- `--timeout <ms>`: connection and call timeout, e.g. `godot-mcp get_debug_output --timeout 10000`.

### Custom server

- `--server-cmd` and `--server-args` override the spawned server (default `node dist/index.js`). Useful for pointing at a mock or custom server, especially when paths contain spaces.
