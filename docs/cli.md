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
- Install skills into a project: `godot-mcp install-skills "path/to/project"`
- Reload operations:
  - `godot-mcp rescan_filesystem` - detect external file changes
  - `godot-mcp reload_scene` - reload current scene from disk
  - `godot-mcp reload_project --save true` - restart Godot editor

## Server configuration
- Default server command: `node dist/index.js` (stdio transport).
- Editor connection: `ws://127.0.0.1:9080` by default; both the Godot plugin and this server/CLI honor `GODOT_MCP_PORT` (integer 1024-65535) for a different port.
- Override server executable: `--server-cmd node`
- Override server args: `--server-args '["path/to/server.js","--flag"]'` (JSON array). Use this to point at a mock or custom server, especially when paths contain spaces.

## Output modes
- Human-readable (default): prints tool content (text, image summary, or resource).
- Raw JSON: `--raw` prints the full MCP response.
- Progress logging: off by default; enable with `--verbose`.
- Server diagnostics: hidden by default; show server stderr with `--verbose`.

## Timeouts
- Connection and call timeout: `--timeout <ms>` (e.g., `--timeout 10000`). Connection timeout and tool-call timeout are separate phases. A tool-call deadline stops waiting for the response; it does not cancel work already accepted by Godot.

## Bounded and safety-sensitive operations
- `stream_debug_output --action capture --duration-ms 1500 --raw` captures bounded log frames for one-shot CLI use. Persistent clients can use `start`, then `read --after-cursor N`; asynchronous frames are never written to stdout.
- `list_project_files` and `list_assets_by_type` use pages (`--offset`, `--limit`, maximum 1000) and return truncation metadata. Request `next_offset` to continue. `scan_truncated: true` means the 100000-entry scan cap was hit (the warning is printed even when the page itself is not truncated), and an offset past the end of the results is called out explicitly.
- `execute_editor_script` requires `--allow-unsafe true`. It runs arbitrary code on the editor main thread with project access; a response deadline cannot preempt a blocked script. The mutation queue waits for the script to finish (or the deadline to fire) before the next mutation starts.
- `batch_operations` runs at most 25 existing tools in order. `--dry-run` validates schemas only. Outside dry run, a batch containing any failed or invalid operation fails the tool call itself and embeds the compact JSON report in the error; batches are non-atomic and have no rollback.
- `playtest` composes launch, input, runtime inspection/evaluation, assertions, and optional failure capture. Runtime bridge unavailability, thrown inspections, and unavailable or truncated runtime snapshots are reported as infrastructure failures, not passing assertions; a cleanup failure forces `passed: false`.
- Mutation commands (scene/script/shader edits, run control, input simulation, editor scripts, `evaluate_runtime`, panel clears) are admitted through a bounded FIFO and dispatched one at a time: the next mutation cannot start until the current one has finished, including input sequences and `execute_editor_script`. Read-only diagnostics stay concurrent.
