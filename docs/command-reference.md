# Godot MCP Command Reference

Quick reference for all available tools. Use `godot-mcp --help <tool>` for detailed help.

## Node Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_node` | Create a node | `--parent-path`, `--node-type`, `--node-name` |
| `delete_node` | Delete a node | `--node-path` |
| `update_node_property` | Set a property | `--node-path`, `--property`, `--value` |
| `get_node_properties` | Get all properties | `--node-path` |
| `list_nodes` | List child nodes | `--parent-path` |
| `update_node_transform` | Set position/rotation/scale | `--node-path`, `--position`, `--rotation`, `--scale` |

## Script Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_script` | Create a GDScript | `--script-path`, `--content`, `--node-path` (optional), `--diagnostics` (optional) |
| `edit_script` | Edit a script | `--script-path`, `--content`, `--diagnostics` (optional) |
| `get_script` | Get script content | `--script-path` or `--node-path` |
| `get_script_diagnostics` | Parse a GDScript file and return compile/parse errors | `--script-path` |

## Shader Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_shader` | Create a .gdshader file (template generated from type when content is omitted); returns editor compile diagnostics | `--script-path`, `--shader-type` (optional: canvas_item/spatial/particles/sky/fog), `--content` (optional); provide type or content |
| `edit_shader` | Edit a .gdshader file; returns editor compile diagnostics | `--script-path`, `--content` |
| `get_shader` | Get shader source | `--script-path` |
| `shader_get_compile_errors` | Read retained shader compile errors (fallback after a write); `wait_ms` delays the read by up to 10 seconds | `--script-path` (optional), `--wait-ms` (optional, default 0) |
| `shader_get_warnings` | Report shader warnings for a .gdshader file: unused uniforms/varyings/consts/structs/functions and unused locals (static scanner mirroring the engine UNUSED_* family) plus compile errors from a forced recompile. Side effect: enables the `debug/shader_language/warnings/*` ProjectSettings toggles | `--script-path` (optional), `--wait-ms` (optional, default 0) |
| `shader_project_health` | Scan every .gdshader under res:// and report per-file compile errors and static warnings. Side effect: enables the `debug/shader_language/warnings/*` ProjectSettings toggles | `--wait-ms` (optional, default 5000) |

Authoring writes return `path` and `diagnostics`; `get_shader` returns `path` and `content`. Each diagnostic has `line`, `message`, and `severity`.

Runtime shader tools below require a running game with the debugger attached (F5 from the editor). Runtime waits default to 800 ms and are capped at 60 seconds.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `shader_list_materials` | List ShaderMaterials used by nodes in the running game (shader path, material path, sharing metadata) | `--node-path` (optional subtree root), `--material-slot` (optional), `--wait-ms` (optional) |
| `shader_get_uniforms` | Read a node's shader uniforms in the running game: live values merged with type/hint/default parsed from shader source | `--node-path`, `--material-slot` (optional), `--wait-ms` (optional) |
| `shader_set_uniform` | Set a shader uniform in the running game (refuses shared materials unless `--allow-shared`, rejects unknown uniforms); locate the target with `--node-path` (single material) or `--shader-path` (shader-wide: applies to every material using that .gdshader, shared materials skipped unless `--allow-shared`); serialized value forms: number, bool, vector/color arrays or dicts, res:// texture path or {path,...} dict, 6-number mat2 (Transform2D), 9-number mat3 (Basis), 16-number mat4 (Transform3D) array, or arrays of these (exact declared length) | `--node-path` or `--shader-path`, `--uniform-name`, `--value`, `--material-slot` (optional), `--allow-shared` (optional), `--wait-ms` (optional) |
| `shader_debug_snapshot` | Read-only snapshot of a material's shader in the running game: shader path (or "local"), type, full source, every uniform with live value and parseable default, and sharing info; fixed short internal poll, no user `wait_ms` | `--node-path`, `--material-slot` (optional) |
| `shader_hot_reload` | Live-reload a shader in the running game: applies the new code to every material using it, then best-effort syncs the .gdshader file (write failure is reported, not fatal); returns `previous_code` — re-call with `--content` set to it to roll back (no separate revert tool) | `--shader-path` or `--node-path`, `--material-slot` (optional), `--content` |
| `shader_debug_overlay` | Toggle a Viewport debug-draw mode in the running game: "wireframe" (all renderers; on gl_compatibility wireframes only affect meshes loaded after the call), "normal" (requires Forward+), or "off" (reset). Unsupported mode/renderer combinations return a clean error | `--mode`, `--viewport-index` (optional, default 0), `--wait-ms` (optional, default 800) |
| `shader_debug_visualize` | Temporarily inject visualization code into a material's shader in the running game (never writes files; restored by mode=off or automatically on compile failure): "uv", "normals", "screen_pos", "world_pos", "custom" (expression required), or "off". Only canvas_item and spatial shaders | `--node-path`, `--mode`, `--expression` (required for custom), `--material-slot` (optional, default material), `--wait-ms` (optional, default 800) |
| `shader_reset_uniforms` | Reset every shader parameter of a material in the running game to its declared default (defaults parsed from the shader source; null clears the override) | `--node-path`, `--material-slot` (optional, default material), `--wait-ms` (optional, default 800) |
| `shader_reload_from_disk` | Reload a shader in the running game from its .gdshader file on disk and apply it live to every material using it (standalone res:// file required); `unchanged` reports when the live code already equals the disk content; `previous_code` is the rollback path via `shader_hot_reload` | `--shader-path` or `--node-path`, `--material-slot` (optional), `--wait-ms` (optional, default 800) |
| `shader_measure_frame_time` | Read (and optionally toggle) the running game's viewport render-time measurement in ms (gpu_ms/cpu_ms); enable omitted reads without changing state, true enables (waits a few frames to settle), false disables. Per-viewport, not per-shader | `--enable` (optional bool), `--viewport-index` (optional, default 0), `--wait-ms` (optional, default 800) |

Runtime list results contain `materials` and `count`; uniform reads contain `node_path`, `slot`, `shader_path`, `uniforms`, and `count`; successful per-node writes contain `node_path`, `slot`, `uniform_name`, `previous_value`, `new_value`, and `sharing`; shader-wide writes (shader_path) contain `uniform_name`, `value`, `affected`, `skipped`, and `count`. Snapshots contain `node_path`, `slot`, `shader_path`, `shader_type`, `render_modes`, `code`, `uniforms`, and `sharing`; hot reloads contain `shader_path`, `affected_materials`, `previous_code`, `file_written`, `file_write_error`, and `compile_errors`. Debug overlay replies contain `mode`, `renderer`, `viewport_index`, and `caveat` when a renderer caveat applies (e.g. `wireframe_generated` on gl_compatibility). Warnings replies contain `warnings_enabled`, `warnings`, `errors`, and `total`; project health replies contain `total_files`, `files_with_errors`, `files_with_warnings`, `results`, and `enabled_warnings`. Visualization replies contain `mode`, `shader_type`, `injected`, `compile_errors`, `rolled_back`, and `restore_note`; resets contain `node_path`, `slot`, `reset`, and `count`; disk reloads contain `shader_path`, `affected_materials`, `file_read`, `file_error`, `compile_errors`, and `unchanged`; frame-time replies contain `gpu_ms`, `cpu_ms`, `enabled`, `viewport_index`, `renderer`, and `note`.

## Scene Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_scene` | Create a new scene | `--path`, `--root-node-type` |
| `delete_scene` | Delete a scene file | `--path` |
| `save_scene` | Save current scene | `--path` (optional) |
| `open_scene` | Open a scene | `--path` |
| `get_current_scene` | Get current scene info | (none) |
| `create_resource` | Create a resource | `--resource-type`, `--resource-path`, `--properties` |
| `capture_scene` | Render a scene into an off-screen viewport and return the PNG image | `--scene-path` (optional), `--width`, `--height`, `--transparent`, `--output-path`, `--return-base64` (optional), `--allow-large` (optional) |
| `capture_running_game` | Capture the running game's current rendered frame (root viewport, up to one frame of latency) and return the PNG image; optional `--node-path` crops to a 2D node's (CanvasItem/Control) on-screen region (3D nodes rejected) | `--output-path` (optional), `--return-base64` (optional), `--allow-large` (optional), `--wait-ms` (optional, default 3000), `--node-path` (optional) |
| `validate_scene` | Check a scene's structural health | `--scene-path`, `--check-instantiate` (optional) |

## Project Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_project_info` | Get project info | (none) |
| `run_project` | Run with F5 (debug) | (none) |
| `run_current_scene` | Run with F6 | (none) |
| `run_specific_scene` | Run a specific scene | `--scene-path` |
| `stop_running_project` | Stop running project | (none) |
| `reload_project` | Restart Godot editor | `--save` (default: true) |
| `reload_scene` | Reload scene from disk | `--scene-path` (optional) |
| `rescan_filesystem` | Rescan for file changes | (none) |
| `generate_project_guidance` | Scan the project and write AI guidance files | `--include-agents-md`, `--force` |
| `batch_operations` | Run up to 25 existing tools in order; non-atomic, no rollback; a failed/invalid batch fails the tool call with the report embedded | `--operations` (JSON), `--dry-run`, `--continue-on-error` |
| `playtest` | Launch/attach, wait for runtime inspection, apply input phases, assert state, and optionally capture failures | `--launch`, `--phases` (JSON), `--stop-after`, `--capture-on-failure` |

## Asset Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_assets_by_type` | List a bounded page of assets | `--type`, `--offset`, `--limit` (default 200, max 1000); `scan_truncated` flags a capped scan |
| `list_project_files` | List a bounded page of files by extension | `--extensions`, `--offset`, `--limit` (default 200, max 1000); `scan_truncated` flags a capped scan |

## Debugger Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `debugger_set_breakpoint` | Set a breakpoint | `--script-path`, `--line` |
| `debugger_remove_breakpoint` | Remove a breakpoint | `--script-path`, `--line` |
| `debugger_get_breakpoints` | List all breakpoints | (none) |
| `debugger_clear_all_breakpoints` | Clear all breakpoints | (none) |
| `debugger_pause_execution` | Pause execution | (none) |
| `debugger_resume_execution` | Resume execution | (none) |
| `debugger_step_over` | Step over | (none) |
| `debugger_step_into` | Step into | (none) |
| `debugger_get_call_stack` | Get call stack | `--session-id` (optional) |
| `debugger_get_current_state` | Get debugger state | (none) |
| `debugger_enable_events` | Subscribe to events | (none) |
| `debugger_disable_events` | Unsubscribe from events | (none) |

## Input Simulation Tools

Requires a running game (F5).

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_input_actions` | List available actions | (none) |
| `simulate_action_press` | Press and hold action | `--action`, `--strength` |
| `simulate_action_release` | Release action | `--action` |
| `simulate_action_tap` | Tap action briefly | `--action`, `--duration-ms` |
| `simulate_mouse_click` | Click at position | `--x`, `--y`, `--button`, `--double-click` |
| `simulate_mouse_move` | Move mouse | `--x`, `--y` |
| `simulate_drag` | Drag operation | `--start-x`, `--start-y`, `--end-x`, `--end-y`, `--duration-ms` |
| `simulate_key_press` | Press keyboard key | `--key`, `--duration-ms`, `--modifiers` |
| `simulate_input_sequence` | Complex input sequence | `--sequence` (JSON array) |

## Enhanced Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_editor_scene_structure` | Editor scene tree | `--include-properties`, `--include-scripts`, `--max-depth` |
| `get_runtime_scene_structure` | Runtime scene tree | `--include-properties`, `--max-depth`, `--timeout-ms` |
| `evaluate_runtime_expression` | Evaluate expression in game | `--expression`, `--context-path`, `--timeout-ms` |
| `execute_editor_script` | Run arbitrary GDScript in the editor (explicit unsafe opt-in; main-thread execution cannot be preempted) | `--code`, `--allow-unsafe true` |

## Editor Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_debug_output` | Get Output panel | (none) |
| `clear_debug_output` | Clear Output panel | (none) |
| `get_editor_errors` | Get Errors tab | (none) |
| `clear_editor_errors` | Clear Errors tab | (none) |
| `get_node_warnings` | Inspect current scene tree for configuration warnings | `--debug` |
| `get_stack_trace_panel` | Get stack trace | `--session-id` |
| `get_stack_frames_panel` | Get stack frames | `--session-id`, `--refresh` |
| `stream_debug_output` | Bounded protocol-safe debug stream; asynchronous frames never print to stdout | `--action` (start/read/capture/stop), `--after-cursor`, `--duration-ms` |

`batch_operations` dry-run validates allowlists and Zod schemas only; it does not check Godot runtime preconditions, and dry-run reports are returned normally even when entries are invalid. Outside dry run, any failed or invalid operation makes the tool call itself fail with the compact JSON report embedded in the error (bounded to 8 KiB); there is no rollback either way. File and asset scans stop at a 100000-entry cap and set `scan_truncated`; a requested offset past the end of the results is reported explicitly. `playtest` reports unavailable runtime/evaluation bridges, thrown inspections, and unavailable or truncated runtime snapshots as infrastructure errors rather than passing assertions; a cleanup failure forces `passed: false`. Mutation commands are dispatched one at a time through the bounded FIFO and the next mutation waits for the current one (including input sequences and `execute_editor_script`) to finish or hit its deadline.

## MCP Resources

Read-only endpoints for MCP clients:

```
godot://script/{path}              # Script content
godot://script/{path}/metadata     # Script metadata
godot://scene/current              # Current scene structure
godot://scene/tree                 # Scene tree only
godot://assets/{type}              # Assets by type
godot://debug/log                  # Debug output
godot://debugger/state             # Debugger state
godot://debugger/breakpoints       # All breakpoints
godot://debugger/call-stack/{id}   # Call stack
godot://debugger/session/{id}      # Session info
```

## CLI Examples

```bash
# Node operations
godot-mcp create_node --parent-path "." --node-type "Sprite2D" --node-name "Player"
godot-mcp update_node_property --node-path "./Player" --property "position" --value "[100,200]"

# Script operations
godot-mcp get_script --script-path "res://scripts/player.gd"
godot-mcp get_script_diagnostics --script-path "res://scripts/player.gd"

# Scene operations
godot-mcp open_scene --path "res://scenes/main.tscn"
godot-mcp get_editor_scene_structure --include-properties true
godot-mcp capture_scene --scene-path "res://scenes/main.tscn" --width 1280 --height 720
godot-mcp validate_scene --scene-path "res://scenes/main.tscn"

# Debugging
godot-mcp run_project
godot-mcp debugger_set_breakpoint --script-path "res://player.gd" --line 42
godot-mcp debugger_get_current_state

# Reload operations
godot-mcp rescan_filesystem
godot-mcp reload_scene
godot-mcp reload_scene --scene-path "res://scenes/main.tscn"
godot-mcp reload_project --save true

# Project guidance
godot-mcp generate_project_guidance --include-agents-md true

# Input simulation
godot-mcp get_input_actions
godot-mcp simulate_action_tap --action "ui_accept"
godot-mcp simulate_mouse_click --x 400 --y 300
```

## Input Sequence Format

```json
{
  "sequence": [
    { "type": "press", "action": "ui_right" },
    { "type": "wait", "duration_ms": 500 },
    { "type": "tap", "action": "jump", "duration_ms": 100 },
    { "type": "release", "action": "ui_right" },
    { "type": "click", "x": 100, "y": 200, "button": "left" }
  ]
}
```

Sequence step types: `press`, `release`, `tap`, `wait`, `click`

## Response Formats

### capture_scene

Returns the captured PNG as an MCP image content block plus a text summary ("Scene captured and saved to ..."). The underlying command result:

```json
{
  "file_path": "user://mcp_captures/capture_1750000000.png",
  "absolute_path": "C:/Users/you/AppData/Roaming/Godot/app_userdata/YourProject/capture_1750000000.png",
  "width": 1280,
  "height": 720,
  "image_base64": "..."
}
```

Defaults: width 1280, height 720, transparent background off, output directory `user://mcp_captures/`. Without `--scene-path`, the scene currently open in the editor is captured.

- `return_base64` (default false): when true, Godot sends the PNG as base64 over the WebSocket (included as `image_base64` in the command result). When false (the default), Godot only writes the PNG to disk and the server reads it back from `absolute_path`, avoiding multi-megabyte WebSocket payloads.
- `allow_large` (default false): captures whose width x height exceeds 4,000,000 pixels are refused unless this is set to true.

### capture_running_game

Captures the running game's root viewport and returns the PNG as an image content block. The result shape mirrors `capture_scene` (`file_path`, `absolute_path`, `width`, `height`, plus `image_base64` when `return_base64` is true). The frame is read after the next `RenderingServer.frame_post_draw` (no forced draw on the live viewport), so the capture is at most one frame old: a uniform set in the same turn may still show the pre-change frame. Default output directory is `user://mcp_captures/` in the game's user data dir (shared with the editor, so the server can read the PNG back). The same 4,000,000-pixel cap as `capture_scene` applies unless `allow_large` is set.

Optional `node_path` (2D only: CanvasItem/Control) crops the capture to the node's on-screen region — CanvasItems use `get_global_transform_with_canvas()` applied to their local bounds, Controls use `get_global_rect()`. 3D nodes are rejected with a clean error. When a crop is applied the reply additionally contains `cropped: true`, `original_width`, and `original_height` (the pre-crop frame dimensions); `width`/`height` then describe the cropped image. The 4MP cap applies to the final (cropped) size.

### shader_debug_snapshot

```json
{
  "node_path": "/root/TestMainScene/ShaderVisuals/SoloSprite",
  "slot": "material",
  "shader_path": "res://test_runtime_material.gdshader",
  "shader_type": "canvas_item",
  "render_modes": [],
  "code": "shader_type canvas_item; ...",
  "uniforms": [
    { "name": "speed", "type": "float", "value": 2.0, "default": 2.0, "hint": { "type": "range", "min": 0.0, "max": 10.0, "step": 0.5 } },
    { "name": "tint", "type": "color", "value": { "r": 1.0, "g": 0.5, "b": 0.25, "a": 1.0 }, "default": { "r": 1.0, "g": 0.5, "b": 0.25, "a": 1.0 }, "hint": "source_color" }
  ],
  "sharing": { "users_count": 1, "users": ["/root/TestMainScene/ShaderVisuals/SoloSprite"] }
}
```

Read-only: nothing is modified. `shader_path` is "local" for shaders not saved to a file. Uniform values use the canonical reply serialization: vectors `{x,y,...}`, colors `{r,g,b,a}`, transforms as arrays, textures `{path,width,height,format}`.

### shader_hot_reload

```json
{
  "shader_path": "res://test_runtime_material.gdshader",
  "affected_materials": [
    { "node_path": "/root/TestMainScene/ShaderVisuals/SharedSpriteA", "slot": "material", "material_path": "res://test_main_scene.tscn::ShaderMaterial_shared" },
    { "node_path": "/root/TestMainScene/ShaderVisuals/SoloSprite", "slot": "material", "material_path": "res://test_runtime_material.tres" }
  ],
  "previous_code": "shader_type canvas_item; ...",
  "file_written": true,
  "file_write_error": "",
  "compile_errors": []
}
```

`previous_code` is the rollback mechanism: call `shader_hot_reload` again with `--content` set to it. A failed file write never fails the live apply; it is reported via `file_written` / `file_write_error`. `compile_errors` merges the game-side live-apply errors with the editor's recompile diagnostics (the shader error logger mechanism).

### shader_debug_overlay

```json
{
  "mode": "wireframe",
  "renderer": "gl_compatibility",
  "viewport_index": 0,
  "wireframe_generated": true,
  "caveat": "Wireframe generation enabled for gl_compatibility, but it only affects meshes loaded after this call; already-loaded meshes may not display wireframes"
}
```

`mode` echoes the requested mode ("wireframe", "normal", or "off") and `renderer` is the running game's rendering method (`forward_plus`, `mobile`, or `gl_compatibility`). "normal" (NORMAL_BUFFER) requires Forward+. On gl_compatibility, "wireframe" enables wireframe generation and reports `wireframe_generated: true`; the flag only affects meshes loaded after the call. Mode "off" resets the viewport to `VIEWPORT_DEBUG_DRAW_DISABLED`.

### shader_get_warnings

```json
{
  "warnings_enabled": true,
  "warnings": [
    { "line": 7, "message": "The uniform 'steps' is declared but never used.", "severity": "warning", "file": "res://test_runtime_material.gdshader" },
    { "line": 11, "message": "The uniform 'weights' is declared but never used.", "severity": "warning", "file": "res://test_runtime_material.gdshader" }
  ],
  "errors": [],
  "total": 7
}
```

`warnings` entries carry `line`, `message`, `severity` (always "warning"), and `file`. Each mirrors an engine UNUSED_* warning (UNUSED_UNIFORM / UNUSED_VARYING / UNUSED_CONSTANT / UNUSED_STRUCT / UNUSED_FUNCTION / UNUSED_LOCAL_VARIABLE) plus FORMATTING_ERROR for empty statements, gated on the matching `debug/shader_language/warnings/*` ProjectSettings toggle (the call enables them — a documented side effect). `errors` are real compile errors from a forced recompile of the file; `total` is `warnings.size()`. Without `script_path` only `warnings_enabled` is meaningful (warnings/errors empty).

### shader_project_health

```json
{
  "total_files": 1,
  "files_with_errors": 0,
  "files_with_warnings": 1,
  "results": [
    { "path": "res://test_runtime_material.gdshader", "errors": [], "warnings": [ { "line": 7, "message": "...", "severity": "warning", "file": "res://test_runtime_material.gdshader" } ] }
  ],
  "enabled_warnings": true
}
```

Scans every .gdshader under res:// (`.godot` cache excluded), force-recompiling each with the marker-correlated error logger so one file's recompile cannot contaminate another's results. `results` entries are `{ path, errors, warnings }`; `files_with_errors` / `files_with_warnings` count the non-empty ones. The `debug/shader_language/warnings/*` toggles are enabled as a side effect (see shader_get_warnings).

### shader_debug_visualize

```json
{
  "mode": "uv",
  "shader_type": "canvas_item",
  "injected": "COLOR = vec4(UV, 0.0, 1.0);",
  "original_code": "shader_type canvas_item; ...",
  "compile_errors": [],
  "rolled_back": false,
  "restore_note": "call shader_debug_visualize with mode=off to restore",
  "renderer": "gl_compatibility"
}
```

The injected code lives only in the live Shader resource (never written to disk). `mode=off` restores the exact original code and replies `{ mode: "off", restored: true, previous_mode: "uv", shader_type, renderer }` (or `restored: false` when nothing was registered for the node). If the injected variant fails to compile, the original code is restored automatically and `rolled_back: true` with the `compile_errors` reported. Only `canvas_item` and `spatial` shaders are supported; `custom` mode assigns the user `expression` to COLOR (canvas_item) or ALBEDO (spatial).

### shader_reset_uniforms

```json
{
  "node_path": "/root/TestMainScene/ShaderVisuals/SoloSprite",
  "slot": "material",
  "reset": [
    { "name": "speed", "value": 2.0 },
    { "name": "albedo_tex", "value": null }
  ],
  "count": 9
}
```

Defaults come from `Shader.get_shader_uniform_list()` when the engine provides them, falling back to the regex-parsed defaults from the shader source; a null default clears the parameter override so the shader's built-in default applies. `reset` lists every parameter with its restored value; `count` is `reset.size()`.

### shader_reload_from_disk

```json
{
  "shader_path": "res://test_runtime_material.gdshader",
  "affected_materials": [
    { "node_path": "/root/TestMainScene/ShaderVisuals/SoloSprite", "slot": "material", "material_path": "res://test_runtime_material.tres" }
  ],
  "applied_code": "shader_type canvas_item; ...",
  "previous_code": "shader_type canvas_item; ...",
  "file_read": true,
  "file_error": "",
  "compile_errors": [],
  "unchanged": false
}
```

Same material lookup as `shader_hot_reload`; the shader must be a standalone res:// .gdshader file. When the live code already equals the disk content, `unchanged: true` and nothing is reapplied. `previous_code` is the rollback path (re-call `shader_hot_reload` with `--content` set to it). Parameter values are re-applied through the shared coercion helper so values keep working when the disk content changed a uniform's type.

### shader_measure_frame_time

```json
{
  "gpu_ms": 1.24,
  "cpu_ms": 0.83,
  "enabled": true,
  "viewport_index": 0,
  "renderer": "gl_compatibility",
  "note": "Measurement is per-viewport, not per-shader; to compare shaders, toggle the shader change and measure again"
}
```

`enable` omitted reads without changing state; `enable=true` enables measurement and waits a few frames for it to settle (the first frames after enabling report 0.0); `enable=false` disables. Units are milliseconds. Measurement is per-viewport (0 = root viewport; positive index selects the Nth Viewport child of the root), so it measures the whole frame, not one shader.

### get_script_diagnostics

```json
{
  "script_path": "res://scripts/player.gd",
  "exists": true,
  "valid": false,
  "error_count": 1,
  "errors": [
    { "line": 12, "column": 0, "message": "..." }
  ]
}
```

`valid` is true when the script parses without errors. `create_script` and `edit_script` responses also include this `diagnostics` field for GDScript files; pass `--diagnostics false` to skip the (potentially headless-subprocess) diagnostics run for faster writes. Diagnostics run on a worker thread so the editor stays responsive; results are cached per script content.

### validate_scene

```json
{
  "scene_path": "res://scenes/main.tscn",
  "valid": true,
  "issue_count": 0,
  "issues": []
}
```

Issues use `{ severity, category, message, node_path? }` with categories `load`, `instantiate`, `duplicate_name`, `missing_resource`, and `cyclic_dependency`.

Pass `--check-instantiate false` to skip the `PackedScene.instantiate()` tree-build check and keep only the faster structural/dependency checks.

### generate_project_guidance

```json
{
  "written_paths": ["res://addons/godot_mcp/ai/project_guide.md"],
  "scene_count": 3,
  "autoload_count": 1,
  "input_action_count": 5,
  "guide_path": "res://addons/godot_mcp/ai/project_guide.md",
  "agents_md_path": "res://AGENTS.md",
  "action": "created"
}
```

Writes `res://addons/godot_mcp/ai/project_guide.md` and, when `--include-agents-md` is passed, writes or updates `res://AGENTS.md`. `action` is `created`, `appended`, `replaced`, or `skipped`; an existing `AGENTS.md` is never overwritten unless `--force` is passed.
