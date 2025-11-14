# Changelog

All notable changes to this project will be documented in this file.  

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
