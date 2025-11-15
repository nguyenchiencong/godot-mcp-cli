# Changelog

All notable changes to this project will be documented in this file.  

## 2025-11-15

### Added
- Debugger bridge can now recognize additional stack capture messages (`stack`, `call_stack`, `callstack`, `stack_dump`) and even rebuild frame data directly from the editor Output log when Godot only prints `print_stack` output, giving `debugger_get_call_stack` a fallback path when stack dumps are missing.
- Introduced `server/tests/call-stack.test.js`, a focused Node script that connects to the MCP server and exercises `debugger_get_call_stack` end-to-end once the project is paused.
- Shared `server/tests/utils/test_logger.js` so every debugger-focused Node script gets consistent colored output, structured JSON dumps, and divider helpers.

### Fixed
- Normalized session identifiers across `debugger_get_call_stack` and `mcp_debugger_bridge.gd`, covering ints, floats, and string IDs, ensuring cached state stays in sync and removing the spurious `session_not_found` errors encountered when Godot reported non-integer IDs.
- Re-ordered the debugger integration test runner now that call stack coverage lives in its own script so cleanup happens earlier, event handling reuses the same connection, and the console output stays predictable run-to-run.
- `debugger_get_call_stack` now lets the bridge auto-pick any active session (or sequentially retry each one) instead of forcing `session_id = 1`, eliminating the empty responses that occurred when Godot reused different session identifiers.

## 2025-11-13

### Added
- `get_stack_trace_panel` tooling (Godot command, MCP tool, and docs) to capture the Stack Trace panel plus parsed frames and debugger context whenever execution pauses.
- `clear_debug_output` tool/command pair that wipes the editor Output panel, resets streaming subscribers, and reports diagnostics about how the clear was performed.
- `get_stack_frames_panel` tooling and a dedicated JS test to capture structured stack frames from the debugger bridge cache.
- Reworked `execute_editor_script` flow to capture parser/runtime errors, log tails, and timeouts for more actionable diagnostics.
- Documentation updates (README, command/tool guides, testing guide) covering the new stack trace capture and output clearing workflows.

## 2025-11-11

### Added
- New MCP project control tools: `run_project`, `stop_running_project`, `run_current_scene`, and `run_specific_scene`.
- Godot-side implementations for launching/stopping scenes plus server tooling (`project_tools.ts`) wired into the MCP entrypoint.
- `get_editor_errors` command/tool to capture the Errors tab directly from the editor bottom panel, plus server/docs updates.
- Documentation updates covering the new tooling in `README.md`, `docs/testing-guide.md`, `docs/tool-prompt-guide.md`, and `docs/command-reference.md`.

### Fixed
- Resolved a Godot VM crash caused by strict typing in `_get_editor_interface` within `project_commands.gd`.
