# Changelog

All notable changes to this project will be documented in this file.  

## 2025-11-11

### Added
- New MCP project control tools: `run_project`, `stop_running_project`, `run_current_scene`, and `run_specific_scene`.
- Godot-side implementations for launching/stopping scenes plus server tooling (`project_tools.ts`) wired into the MCP entrypoint.
- `get_editor_errors` command/tool to capture the Errors tab directly from the editor bottom panel, plus server/docs updates.
- Documentation updates covering the new tooling in `README.md`, `docs/testing-guide.md`, `docs/tool-prompt-guide.md`, and `docs/command-reference.md`.

### Fixed
- Resolved a Godot VM crash caused by strict typing in `_get_editor_interface` within `project_commands.gd`.
