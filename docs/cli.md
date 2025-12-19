# CLI Usage

Run MCP tools from the command line via the `godot-mcp` binary.

## Installation

```bash
# Option 1: Install via npm (recommended)
npm install -g godot-mcp-cli

# Option 2: Build from source
cd server && npm run build && npm link
```

## Examples
- List tools: `godot-mcp --list-tools`
- Tool help: `godot-mcp --help get_debug_output`
- Call with flags: `godot-mcp get_debug_output`
- Call with params: `godot-mcp debugger_set_breakpoint --script-path res://test_debugger.gd --line 42`
- Call with JSON params (must be a JSON object): `godot-mcp get_stack_frames_panel --params-json '{"session_id":1}' --raw`
- Install/update addon into a Godot project: `godot-mcp install-addon "path/to/project"`
- Reload operations:
  - `godot-mcp rescan_filesystem` - detect external file changes
  - `godot-mcp reload_scene` - reload current scene from disk
  - `godot-mcp reload_project --save true` - restart Godot editor

## Server configuration
- Default server command: `node dist/index.js` (stdio transport).
- Override server executable: `--server-cmd node`
- Override server args: `--server-args '["path/to/server.js","--flag"]'` (JSON array). Use this to point at a mock or custom server, especially when paths contain spaces.

## Output modes
- Human-readable (default): prints tool content (text, image summary, or resource).
- Raw JSON: `--raw` prints the full MCP response.
- Progress logging: off by default; enable with `--verbose`.
- Server diagnostics: hidden by default; show server stderr with `--verbose`.

## Timeouts
- Connection and call timeout: `--timeout <ms>` (e.g., `--timeout 10000`).
