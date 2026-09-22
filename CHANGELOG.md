# Changelog

All notable changes to this project will be documented in this file.

## 1.7.0 - 2026-09-23

### Added
- npm release tooling: `npm run release:patch|minor|major` from `server/` wraps `npm version` (commits `chore: Release v<version>`, tags `v<version>`); the `version` lifecycle hook runs `server/scripts/bump-version.mjs` to sync the `src/index.ts` version constant, `package-lock.json` (both version fields — fixing the 1.5.1 drift), and the CHANGELOG `Unreleased` heading
- `batch_operations` tool: ordered, explicitly non-atomic batches of up to 25 existing tools with schema-only `dry_run`, optional `continue_on_error`, and bounded per-operation results; a non-dry-run batch containing any failed or invalid operation fails the tool call with the compact JSON report embedded; no rollback or undo is claimed
- `playtest` tool: bounded launch/attach, readiness polling, ordered input phases, runtime node/expression assertions, optional failure capture, and cleanup; unavailable runtime/eval bridges are reported as infrastructure errors, not passing assertions
- `stream_debug_output` `read`/`capture` actions backed by a bounded cursor buffer (1,000 lines / 128 KiB) with truncation metadata; the existing global CLI `--raw` flag displays the full MCP result envelope
- Offset pagination (`offset`/`limit`, default 200, maximum 1000) with `truncated`/`next_offset` metadata for `list_assets_by_type`, `list_project_files`, and project resources
- Mock transport benchmark: `npm run benchmark:transport` (loopback echo server; does not measure Godot or editor frame cost)
- Live-editor benchmark: `npm run benchmark:live` runs sequential read, read-during-burst, mutation completion-order, and debug-stream capture cases end to end against a dedicated headless fixture editor spawned in a throwaway temp project on a free port; results are labeled headless/no-rendering and make no GPU or frame-cost claim
- Live queue-completion regression test `server/tests/mutation_queue.live.test.js` (editor-required, outside `test:offline`): a slow mutation finishes before the immediately following mutation, and a 10-deep editor-script burst completes in submission order
- `GODOT_MCP_PORT` environment variable (integer 1024-65535, fallback 9080) overrides the plugin's WebSocket listen port, so a dedicated fixture editor can run alongside an editor that already owns 9080; the server/CLI client resolves the same variable so plugin and client stay on the same port

### Changed
- MCP startup now awaits FastMCP `start()` with an idempotent shutdown path; the CLI reports connection and tool-call deadlines as separate phases and no longer implies Godot work is cancelled on timeout
- `execute_editor_script` requires explicit `allow_unsafe: true` (enforced in both the tool schema and the Godot-side command); output is bounded and timeout wording states main-thread execution cannot be preempted
- Transport bounds: 8 MiB WebSocket message ceilings on both sides, 64-entry pending-command limit with early rejection, per-peer 256 queued packets, 16 packets per peer per frame; mutation commands are admitted through a bounded FIFO and dispatched one at a time — the next mutation waits for the current one (including input sequences and `execute_editor_script`) to finish or hit its deadline — while read-only diagnostics remain concurrent

### Fixed
- `stream_debug_output` no longer prints asynchronous `[Godot Debug]` lines to server stdout, which could corrupt MCP stdio framing
- Manual WebSocket `stop_server` now emits `client_disconnected` so debug-output subscribers are cleaned up on stop/restart

## 1.6.0 - 2026-09-04

### Added
- `update_node_transform` MCP tool that updates a node's position (`[x, y]`), rotation (radians) and scale (`[x, y]`) in the currently edited 2D scene via the existing editor-side enhanced command; includes a live-editor test in the enhanced test category

### Fixed
- `godot/script/{path}` resource template now sends the `script_path` parameter the script command handler expects; it previously always failed with "Either script_path or node_path must be provided"
- `list_assets_by_type` with an unknown asset type now surfaces the error to the caller instead of returning a success payload that looked like "no assets found"
- WebSocket server disconnects the TCP socket when the WebSocket handshake fails instead of leaking it, and assigns monotonic client ids so a random-id collision can no longer silently overwrite a live client
- Runtime debugger bridge bounds pending `input_results` with the same 64-entry cap as eval/shader results and clears eval/input result stores when a debug session stops, preventing slow unbounded growth across many game run/stop cycles

### Changed
- MCP server startup no longer blocks on the Godot connection attempt: stdio serving starts immediately and the initial connection retries in the background (cold start with the editor closed drops from a multi-second delay to instant; tool calls auto-connect on demand)
- Debug output publisher skips full output-dock text refetches only when the control is provably unchanged (same line count and identical first/last lines, safe against Godot 4.3+ top-trimming of the Output dock); controls without a cheap line probe (e.g. RichTextLabel) are fetched every tick as before
- WebSocket event payloads are no longer deep-copied per subscriber; per-frame CONNECTING/CLOSING state prints and per-frame array allocations removed from the websocket poll loop; enhanced command list hoisted to a file-scope constant
- TypeScript builds use incremental compilation with `tsBuildInfoFile` stored inside `dist/` so deleting `dist/` always resets build state

### Removed
- Empty `scriptResourceTools` tool module, the fully shadowed `mcp_script_resource_commands.gd` editor processor (its `get_script`/`edit_script` commands were always handled first by `script_commands.gd`), and the unused `node_utils.gd` / `script_utils.gd` / `resource_utils.gd` utility scripts
- Broken `test:debugger` npm script that pointed at a nonexistent file (use `node tests/tools.test.js --category=debugger` from `server/` instead); `tests/simple_client.js` converted from CommonJS to ESM to match the package

## 1.5.1 - 2026-08-27

### Fixed
- Quote frontmatter `description` fields in bundled agent skills (`godot-dev-workflow`, `godot-shader-debugging`) to prevent YAML parser errors caused by unquoted colons.

## 1.5.0 - 2026-08-13

### Added
- `godot-mcp install-skills <path-to-project>` CLI command that installs all bundled agent skills from `skills/` into `<project>/.agents/skills/` with clean, non-destructive updates (only the bundled skill folders and README are replaced; unrelated skills are preserved)

## 1.4.0 - 2026-08-06

### Added
- Shader diagnostics and visualization tools (Phase D): `shader_get_warnings`, `shader_project_health`, `shader_debug_visualize`, `shader_reset_uniforms`, `shader_reload_from_disk` and `shader_measure_frame_time` tools/commands
- `shader_debug_visualize` temporarily injects visualization code into a material's shader in the running game and never writes files: `uv`, `normals`, `screen_pos`, `world_pos` or `custom` (`expression` required, assigned to COLOR for canvas_item / ALBEDO for spatial); `mode=off` restores the exact original code, and a compile failure rolls back automatically reporting `rolled_back` plus `compile_errors`; only canvas_item and spatial shaders are supported
- `shader_reset_uniforms` resets every shader parameter of a material in the running game to its declared default (engine `Shader.get_shader_uniform_list()` values with regex-parsed source defaults as fallback; a null default clears the override); the reply lists each restored entry in `reset` plus `count`
- `shader_reload_from_disk` pushes the current `.gdshader` file content into the running game and applies it live to every material using the shader (same material lookup as `shader_hot_reload`; a standalone res:// file is required); `unchanged` reports when the live code already equals the disk content, `file_read`/`file_error` report the disk read, and disk is the source of truth (no rollback needed)
- `shader_measure_frame_time` reads (and optionally toggles) the running game's viewport render-time measurement in milliseconds (`gpu_ms`/`cpu_ms`): `enable` omitted reads without changing state, `true` enables, `false` disables; measurement is per-viewport (`viewport_index`, 0 = root), not per-shader
- `shader_get_warnings` surfaces shader warnings (unused uniforms/varyings/consts/structs/functions and unused locals, mirroring the engine UNUSED_* family) via a static scanner plus compile errors from a forced recompile; the first call enables the `debug/shader_language/warnings/*` ProjectSettings toggles (documented persisted side effect)
- `shader_project_health` scans every .gdshader under res:// (`.godot` cache excluded), force-recompiles each with the marker-correlated error logger so one file's recompile cannot contaminate another's, and reports `total_files`, `files_with_errors`, `files_with_warnings`, per-file `results` and `enabled_warnings`; `wait_ms` defaults to 5000 with a 60000 maximum
- New static scanner `mcp_shader_warning_scanner.gd` (`MCPShaderWarningScanner`) detects UNUSED_* style warnings and formatting errors in .gdshader sources (comment-stripped), gated on the matching `debug/shader_language/warnings/*` ProjectSettings toggles, because engine shader warnings never reach the error logger
- `shader_set_uniform` extended with shader-wide scope: an optional `shader_path` (res:// .gdshader) applies the uniform to every material using that shader in the running game, skipping materials shared by more than one node unless `allow_shared=true` (reported via `affected`/`skipped`/`count`); the `node_path` mode is unchanged
- `capture_running_game` extended with an optional `node_path` (2D CanvasItem/Control only; 3D nodes are rejected with a clean error) that crops the capture to the node's on-screen region; the reply gains `cropped`, `original_width` and `original_height`
- Runtime shader and diagnostics test coverage extended in `server/tests/tools.test.js`: 94/94 tests passing

### Fixed
- `shader_measure_frame_time` waits `MEASURE_SETTLE_FRAMES` process frames after enabling measurement before reading (the first frames report 0.0), fixing the off-by-one read of the enabling frame

## 1.3.0 - 2026-08-06

### Added
- Shader runtime debugging tools (Phase C): `shader_debug_snapshot`, `shader_hot_reload`, `shader_debug_overlay` and `capture_running_game` tools/commands for debugging shaders in the RUNNING game over the debugger message system
- `shader_debug_snapshot` returns a read-only snapshot of a ShaderMaterial: shader path (or "local"), full source, shader type and render modes, every uniform with live value and parseable default, and sharing info; polls internally with a fixed short timeout (no `wait_ms` knob)
- `shader_hot_reload` live-reloads new shader source on every material using the shader in the running game, then best-effort syncs the `.gdshader` file; the reply includes `previous_code` (roll back by re-calling with `content=previous_code`; no separate revert tool) and merged `compile_errors`, and a failed file write is reported via `file_written`/`file_write_error` without failing the live apply
- `shader_debug_overlay` toggles Viewport debug-draw modes (`wireframe`, `normal`, `off`) with renderer-aware behavior: `normal` requires Forward+, and `wireframe` on gl_compatibility reports `wireframe_generated` (only affects meshes loaded after the call); unsupported mode/renderer combinations return a clean error
- `capture_running_game` captures the running game's root viewport and returns the PNG: the frame is read after the next `RenderingServer.frame_post_draw` (at most one frame of latency), the PNG is saved under `user://mcp_captures` with the 4MP pixel cap (lifted by `allow_large`), and `wait_ms` defaults to 3000 with a 60000 maximum
- `shader_set_uniform` extended value types: vectors (arrays or `{x,y,...}` dicts), colors, mat2/Transform2D (6 floats), mat3/Basis (9), mat4/Transform3D (16, column-major), textures (res:// string or `{path,...}` dict), and arrays of all of these (exact declared length required); the shared-material gate (`allow_shared`) and unknown-uniform rejection are retained
- Test project renderer flipped to `forward_plus` so the runtime shader tools exercise the Forward+ path

### Fixed
- Documentation now refers to the runtime evaluation tool as `evaluate_runtime_expression` (was `evaluate_runtime`) in the command reference and README

## 1.2.0 - 2026-08-05

### Added
- Shader authoring tools (Phase A): `create_shader`, `edit_shader`, `get_shader` and `shader_get_compile_errors` tools/commands for creating and editing .gdshader files with editor-backed compile diagnostics
- `create_shader` generates a valid template per shader type (`canvas_item`, `spatial`, `particles`, `sky`, `fog`) when content is omitted, and fails when the target file already exists
- `edit_shader`/`create_shader` return bundled compile diagnostics `{line, message, severity}` captured from the engine's own shader compiler; diagnostics are empty when the shader compiles cleanly
- A custom `Logger` (`mcp_shader_error_logger.gd`) installed by the plugin captures `Logger.ERROR_TYPE_SHADER` entries into a thread-safe, marker-correlated buffer; forced write diagnostics are serialized and path-filtered after reload/recompile (`ResourceLoader.load` with `CACHE_MODE_REPLACE` plus `Shader.get_rid()`)
- `shader_get_compile_errors` fallback drain tool with optional `script_path` filter and `wait_ms` wait for pending recompiles
- shader_type conflicts are reported as warnings in diagnostics (content declaring a different type than requested on create; an edit changing the type of an existing file) while the write still succeeds
- Integration test category (`shader`) in `server/tests/tools.test.js` covering create/edit/get/drain against the live editor
- Shader runtime tools (Phase B): `shader_list_materials`, `shader_get_uniforms` and `shader_set_uniform` tools/commands that inspect and modify ShaderMaterials in the RUNNING game over the debugger message system
- New game-side autoload `mcp_shader_runtime.gd` (`MCPShaderRuntime`) registers an `EngineDebugger` capture named `mcp_shader` and answers `list_materials`/`get_uniforms`/`set_uniform` requests with fully serializable payloads (vectors as arrays, colors as `{r,g,b,a}`, transforms as 16-float column-major arrays, textures/materials as res:// paths)
- `mcp_runtime_debugger_bridge.gd` routes `mcp_shader:result` captures into a per-session pending-result store keyed by request id (`send_shader_request`/`has_shader_result`/`take_shader_result`), mirroring the eval correlation pattern
- Uniform metadata (type, hint, default, array size) is parsed from the .gdshader source via regex (comment-stripped) and merged with live material values (`get_shader_parameter`); `set_uniform` converts serialized values back to proper Variants and refuses shared materials unless `allow_shared=true`, reporting sharing users in responses
- Runtime shader tests added to the `shader` category in `server/tests/tools.test.js`, gated behind the existing `--skip-runtime` mechanism; `test_main_scene.tscn` gained ShaderVisuals nodes (two sprites sharing one ShaderMaterial sub-resource, one sprite with a .tres ShaderMaterial) backed by `res://test_runtime_material.gdshader`

### Fixed
- Shader logger sequence assignment is atomic with marker reads, and overlapping editor shader writes serialize their diagnostic windows
- Runtime uniform writes reject invalid scalar coercions, wrong-length arrays/vectors/transforms, and texture paths outside `res://`
- Plugin shutdown preserves autoload settings that existed before the plugin instance started
- Runtime shader success tests now fail on unexpected no-session/runtime errors instead of accepting them

## 1.1.0 - 2026-08-05

### Added
- `capture_scene` tool/command that renders a Godot scene into an off-screen SubViewport and returns the PNG to the AI as an MCP image content block, giving vision-capable models direct visual feedback on the scene
- `get_script_diagnostics` tool/command to parse a GDScript file and return compile/parse errors with line numbers
- `validate_scene` tool/command to check a .tscn scene's structural health: loadability, instantiation, duplicate node names, missing scripts/resources, and cyclic dependencies
- `generate_project_guidance` tool/command that scans the project (autoloads, input actions, scenes, key scripts, settings) and writes `res://addons/godot_mcp/ai/project_guide.md`, optionally writing or appending `res://AGENTS.md` (an existing `AGENTS.md` is never overwritten unless `force` is set)
- `create_script` and `edit_script` responses now include a `diagnostics` field reporting parse errors for GDScript files
- `server/tests/async_diagnostics.test.js` regression test proving broken-script diagnostics run on a worker thread without blocking the editor (run via `npm run test:async-diagnostics`)

### Changed
- Per-command payload logging (send/receive) is now gated behind `GODOT_MCP_DEBUG=1`, removing stderr I/O on normal commands; lifecycle/error logs remain unconditional
- `capture_scene` reads the PNG from disk (written by Godot) instead of shipping base64 over the WebSocket by default; `return_base64: true` restores the old behavior, and `allow_large: true` lifts the 4MP capture limit
- `create_script`/`edit_script` headless diagnostics subprocess results are cached per script content (bounded to 64 entries) and can be skipped with `diagnostics: false` for faster writes
- `validate_scene` runs a single dependency scan shared by all checks and can skip `PackedScene.instantiate()` with `check_instantiate: false`
- Fixed a reconnect edge case where `disconnect()` during a pending reconnect timer would still trigger a reconnect
- Diagnostics headless parser runs on a dedicated worker thread so broken-script diagnostics no longer block editor frames
- Debug-output publishing resolves the Output-panel control once and recovers via `SceneTree` signals; the 0.5s poll never scans the editor control tree
- Four project directory walkers consolidated into one parameterized DFS scanner with preserved outputs

## 1.0.10 - 2026-08-05

### Added
- `get_node_warnings` tool/command to inspect configuration warnings ([!] badges) on nodes in the current scene tree

## 1.0.9 - 2025-12-19

### Changed
- Removed unused `websocket` dependency (eliminates deprecated `yaeti` install warning)

## 1.0.8 - 2025-12-19

### Changed
- **Dependency Upgrade**: Upgraded `zod` from 3.24.2 to 4.1.13
- Updated `create_resource` schema to use the Zod 4-required `z.record(keySchema, valueSchema)` form

### Fixed
- CLI now reports a stable, friendly error for missing required tool parameters (instead of relying on upstream validation wording)
- `install-addon` can now locate the bundled addon folder in both dev and published package layouts

## 1.0.7 - 2025-12-11

### Added
- `delete_scene` tool/command to delete scene files from the project, complementing the existing `create_scene` tool
- Support for "scripts" and "scenes" asset types in `list_assets_by_type` tool (previously only supported images, audio, fonts, models, shaders, resources)
- Comprehensive test suite in `server/tests/tools.test.js` covering all 54 MCP tools across 9 categories with automatic cleanup of generated test files

### Fixed
- `list_assets_by_type` now correctly filters by asset type instead of returning all project files when requesting scripts
- `list_assets_by_type` now returns helpful error message for unknown asset types with list of valid types
- `delete_scene` prevents deletion of currently open scenes with clear error message

### Changed
- Consolidated test suite: removed 7 redundant individual test files (call-stack.test.js, pause.test.js, resume.test.js, stack-frames-panel.test.js, stack-trace-panel.test.js, editor-errors.test.js, debugger.test.js) in favor of comprehensive `tools.test.js`
- Test suite now includes automatic cleanup of generated files (scripts, scenes, resources) with final cleanup pass

## 1.0.6 - 2025-12-11

### Changed
- **Dependency Upgrade**: Upgraded `fastmcp` from 1.20.4 to 3.25.4
  - Removed direct `@modelcontextprotocol/sdk` dependency (now managed by fastmcp internally)
  - Removed `overrides` block from package.json
  - Updated resource template files to use `as const` for argument names (TypeScript inference requirement in 3.x)
  - Core API (`FastMCP`, `addTool`, `addResource`, etc.) remains compatible

## 1.0.5 - 2025-12-09

### Fixed
- **Debugger Warning**: Fixed "Unknown message: mcp_input:result" warning in Godot editor by returning `true` from `_capture()` when messages are successfully handled in `mcp_runtime_debugger_bridge.gd`

## 1.0.4 - 2025-12-09

### Fixed
- **CLI Compatibility**: Pinned `@modelcontextprotocol/sdk` to 1.6.0 to fix "Server does not support completions" error when running CLI commands
- **npm Package**: README.md now displays correctly on the npm package page
- **Dependency Cleanup**: postpublish script properly cleans up copied files after npm publish

## 1.0.0 - 2025-12-06

### Added
- **npm Package**: Published to npm as `godot-mcp-cli` for easy installation via `npm install -g godot-mcp-cli`
- **Cross-platform Addon Installation**: `godot-mcp install-addon <path>` command copies the Godot addon to any project

### Changed
- **Project Structure**: Addon source lives in `addons/godot_mcp/`, automatically copied to npm package on publish
- **Package Name**: `godot-mcp-cli` (binary remains `godot-mcp` for convenience)

## 2025-11-30

### Added
- **Project Reload Tools**: New tools for reloading the Godot project without manual intervention:
  - `reload_project` - Restart the Godot editor (with optional save before restart)
  - `reload_scene` - Reload current or specific scene from disk
  - `rescan_filesystem` - Rescan project filesystem for external file changes

## 2025-11-29

### Added
- **Input Simulation System**: New tools for AI agents to interact with running Godot games in real-time:
  - `simulate_action_press` / `simulate_action_release` / `simulate_action_tap` - Simulate input actions
  - `simulate_mouse_click` / `simulate_mouse_move` / `simulate_drag` - Mouse input simulation
  - `simulate_key_press` - Keyboard input with modifier key support
  - `simulate_input_sequence` - Execute complex input combos with precise timing
  - `get_input_actions` - Discover all available input actions in the project
- `MCPInputHandler` autoload automatically registered when plugin is enabled
- Runtime input handler (`mcp_input_handler.gd`) for receiving input commands via debugger bridge

## 2025-11-23

### Changed
- CLI is quieter by default, with `--verbose` enabling progress logs and server diagnostics.
- `--list-tools` now prints a colorized table; mixed-content results render with clearer bullets/tags.
- Simplified CLI invocation: drop the optional `mcp` namespace; use `godot-mcp <tool>` (e.g., `godot-mcp get_debug_output`).

### Added
- CLI tests for progress streaming, missing tool, invalid params, and JSON-flag arg handling using a new `progress_task` mock tool.
- `godot-mcp install-addon <path>` to install/update the `godot_mcp` addon into a Godot project’s `addons` folder.

## 2025-11-17

### Added
- `clear_editor_errors` tool/command to clear the Errors tab in the Godot editor debugger panel, complementing the existing `get_editor_errors` and `clear_debug_output` tools.
- Test file `server/tests/editor-errors.test.js` to verify `get_editor_errors` and `clear_editor_errors` functionality.
- Documentation updates for `clear_editor_errors` in command-reference.md, README.md, testing-guide.md, and tool-prompt-guide.md.

### Fixed
- Updated command handler to properly route all enhanced commands (including `get_editor_errors`, `clear_editor_errors`, `clear_debug_output`, etc.) to the enhanced commands processor.

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
