# MCP Tool Prompt Guide

Use this document to craft effective prompts when instructing an LLM to interact with the Godot MCP server. Each tool entry includes its purpose, parameters, and a ready-to-use example prompt.

---

## Node Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `create_node` | Create a new node under a parent in the current scene. | `parent_path` (string), `node_type` (string), `node_name` (string) | “Create a `Sprite2D` named `Enemy` under `./World`.” |
| `delete_node` | Remove a node from the scene tree. | `node_path` (string) | “Delete the node at `./World/Enemy`.” |
| `update_node_property` | Update a node property through the editor. | `node_path` (string), `property` (string), `value` (any) | “Set `./Player`’s `position` to `[128, 256]`.” |
| `get_node_properties` | Read all editor-visible properties of a node. | `node_path` (string) | “List the properties for `./UI/ScoreLabel`.” |
| `list_nodes` | List direct children of a node. | `parent_path` (string) | “What nodes live under `./UI`?” |

---

## Script Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `create_script` | Create a script file, optionally attaching it to a node. | `script_path` (string), `content` (string), `node_path` (optional string) | “Create `res://scripts/health_manager.gd` and attach it to `./World/HealthManager`.” |
| `edit_script` | Replace the contents of an existing script. | `script_path` (string), `content` (string) | “Update `res://scripts/player.gd` with this revised code.” |
| `get_script` | Fetch script source based on file path or node attachment. | `script_path` (optional string), `node_path` (optional string) | "Show me the script attached to `./Player`." |

---

## Shader Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `create_shader` | Create a new .gdshader file; generates a template from `shader_type` when content is omitted, then reports editor compile diagnostics. Provide `shader_type` or explicit `content`. | `script_path` (string), `shader_type` (optional string: `canvas_item`, `spatial`, `particles`, `sky`, `fog`), `content` (optional string) | “Create a `canvas_item` shader at `res://shaders/outline.gdshader` that tints sprites red.” |
| `edit_shader` | Edit a .gdshader file and report editor compile diagnostics (parse errors with line numbers). | `script_path` (string), `content` (string) | “Fix the compile error in `res://shaders/outline.gdshader` — rewrite the fragment function.” |
| `get_shader` | Fetch the source of a .gdshader file. | `script_path` (string) | “Show me the current contents of `res://shaders/water.gdshader`.” |
| `shader_get_compile_errors` | Read shader compile errors retained by the editor logger; `wait_ms` delays the read (default 0, maximum 10000). | `script_path` (optional string), `wait_ms` (optional int) | “Wait half a second, then show me any shader compile errors captured for `res://shaders/water.gdshader`.” |
| `shader_get_warnings` | Report shader warnings for a `.gdshader` file (unused uniforms/varyings/consts/structs/functions, unused locals — a static scanner mirroring the engine UNUSED_* family) plus compile errors from a forced recompile. Editor-side (no game needed). Side effect: enables the `debug/shader_language/warnings/*` ProjectSettings toggles. | `script_path` (optional string), `wait_ms` (optional int, default 0, maximum 10000) | “Which unused uniforms does `res://shaders/water.gdshader` have?” |
| `shader_project_health` | Scan every `.gdshader` under res:// and report per-file compile errors and static warnings. Editor-side (no game needed). Side effect: enables the `debug/shader_language/warnings/*` ProjectSettings toggles. | `wait_ms` (optional int, default 5000, maximum 60000) | “Run a health check over all shaders in the project.” |
| `shader_list_materials` | List ShaderMaterials used by nodes in the **running game** (needs the game running from the editor with the debugger attached). Reports node path, material path (res:// or "local"), shader path, slot, and sharing metadata. | `node_path` (optional string, subtree root), `material_slot` (optional string), `wait_ms` (optional int) | “Which ShaderMaterials are on the sprites under `/root/TestMainScene/ShaderVisuals` right now?” |
| `shader_get_uniforms` | Read a node's shader uniforms in the **running game**: live values merged with type/hint/default metadata parsed from the shader source. | `node_path` (string, required), `material_slot` (optional string), `wait_ms` (optional int) | “Show me the current uniforms of the material on `/root/TestMainScene/ShaderVisuals/SoloSprite`.” |
| `shader_set_uniform` | Set a shader uniform in the **running game**. Locate the target with `node_path` (single material) or `shader_path` (shader-wide: applies to every material using that `.gdshader`; materials shared by more than one node are skipped unless `allow_shared=true` and reported in `skipped`). Refuses shared materials unless `allow_shared=true`; rejects unknown uniforms. Vectors/colors accept exact-length arrays or keyed dicts, textures accept a res:// string or `{path,...}` dict, mat2/mat3/mat4 accept 6/9/16-number arrays, and array uniforms require the exact declared length. | `node_path` (optional string) or `shader_path` (optional string), `uniform_name` (string), `value` (number, bool, vector/color dict or array, res:// texture string or dict, mat2/mat3/mat4 array, or uniform array), `material_slot` (optional string), `allow_shared` (optional bool), `wait_ms` (optional int, default 800, maximum 60000) | “Set the `speed` uniform to 2.5 on every material using `res://test_runtime_material.gdshader` in the running game.” |
| `shader_debug_snapshot` | Read-only snapshot of a material's shader in the **running game**: shader path (or "local"), type, full source, every uniform with live value and parseable default, plus sharing info. Polls internally with a short fixed timeout (no `wait_ms` knob). | `node_path` (string, required), `material_slot` (optional string) | “Snapshot the shader on `/root/TestMainScene/ShaderVisuals/SoloSprite` so I can see the current code, uniforms, and defaults.” |
| `shader_hot_reload` | Live-reload a shader in the **running game**: applies the new code to every material using the shader, then best-effort syncs the `.gdshader` file. The reply's `previous_code` is the rollback path (re-call with `content=previous_code`); a failed file write is reported via `file_written`/`file_write_error` and never fails the live apply. | `shader_path` (optional string) or `node_path` (optional string), `material_slot` (optional string), `content` (string, required) | “Change `albedo_tex` filtering to nearest and hot reload `res://test_runtime_material.gdshader` live in the running game.” |
| `shader_debug_overlay` | Toggle a Viewport debug-draw mode in the **running game** for visual shader debugging: `wireframe` (all renderers; on gl_compatibility wireframes only affect meshes loaded after the call), `normal` (requires the Forward+ renderer), or `off` (reset). Unsupported mode/renderer combinations return a clean error. | `mode` (string: `wireframe`, `normal`, or `off`), `viewport_index` (optional int, default 0 = root viewport; positive = Nth Viewport child of the root), `wait_ms` (optional int, default 800, maximum 60000) | “Turn on the wireframe overlay in the running game so I can inspect the mesh topology.” |
| `shader_debug_visualize` | Temporarily inject visualization code into a material's shader in the **running game** (never writes files; the original code is restored by `mode=off`, or automatically on compile failure). Modes: `uv`, `normals`, `screen_pos`, `world_pos`, `custom` (expression required), `off`. Only `canvas_item` and `spatial` shaders. | `node_path` (string, required), `mode` (string: `uv`, `normals`, `screen_pos`, `world_pos`, `custom`, or `off`), `expression` (optional string, required when `mode=custom`), `material_slot` (optional string, default `material`), `wait_ms` (optional int, default 800, maximum 60000) | “Show the UV coordinates on `/root/TestMainScene/ShaderVisuals/SoloSprite` in the running game, then restore it.” |
| `shader_reset_uniforms` | Reset every shader parameter of a material in the **running game** to its declared default (defaults parsed from the shader source; a null default clears the override so the engine default applies). | `node_path` (string, required), `material_slot` (optional string, default `material`), `wait_ms` (optional int, default 800, maximum 60000) | “Reset the uniforms on `/root/TestMainScene/ShaderVisuals/SoloSprite` back to their defaults.” |
| `shader_reload_from_disk` | Reload a shader in the **running game** from its `.gdshader` file on disk and apply it live to every material using it (same lookup as `shader_hot_reload`; a standalone res:// `.gdshader` file is required). `unchanged` reports when the live code already equals the disk content; `previous_code` is the rollback path via `shader_hot_reload`. | `shader_path` (optional string) or `node_path` (optional string), `material_slot` (optional string), `wait_ms` (optional int, default 800, maximum 60000) | “Reload `res://shaders/water.gdshader` from disk and apply it live in the running game.” |
| `shader_measure_frame_time` | Read (and optionally toggle) the **running game**'s viewport render-time measurement in milliseconds (`gpu_ms`/`cpu_ms`). `enable` omitted reads without changing state, `true` enables (waits a few frames to settle), `false` disables. Measurement is per-viewport, not per-shader. | `enable` (optional bool), `viewport_index` (optional int, default 0 = root viewport), `wait_ms` (optional int, default 800, maximum 60000) | “Enable render-time measurement in the running game and tell me the GPU and CPU frame times.” |
| `capture_running_game` | Capture the current rendered frame of the **running game**'s root viewport and return the PNG (needs the game running from the editor with the debugger attached). The frame is read after the next `frame_post_draw`, so the capture is at most one frame old; a change made in the same turn may still show the pre-change frame. PNG saved under `user://mcp_captures`. Optional `node_path` (2D CanvasItem/Control only; 3D nodes rejected) crops the capture to the node's on-screen region and the reply reports `cropped` plus the original frame dimensions. | `output_path` (optional string), `return_base64` (optional bool), `allow_large` (optional bool, lifts the 4MP pixel cap), `wait_ms` (optional int, default 3000, maximum 60000), `node_path` (optional string, 2D crop) | “Capture the running game's current frame so I can see how the shader looks right now.” |

---

## Scene Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `create_scene` | Create a new scene file with optional root node type. | `path` (string), `root_node_type` (optional string) | "Create `res://scenes/shop.tscn` with a `Control` root." |
| `delete_scene` | Delete a scene file from the project. | `path` (string) | "Delete the scene `res://scenes/old_level.tscn`." |
| `save_scene` | Save the current scene, optionally overriding the path. | `path` (optional string) | "Save our current scene as `res://scenes/level_02.tscn`." |
| `open_scene` | Open a scene in the editor. | `path` (string) | "Open `res://scenes/menu.tscn` in the editor." |
| `get_current_scene` | Summarize the active scene. | _none_ | “Which scene is currently open?” |
| `get_project_info` | Report project metadata, Godot version, and current scene. | _none_ | “Show me the project name, version, and current scene path.” |
| `create_resource` | Create a Godot resource file with preset properties. | `resource_type` (string), `resource_path` (string), `properties` (optional dict) | "Create a `StyleBoxFlat` at `res://ui/button_style.tres` with `bg_color` set to `#2f6fff`." |

---

## Project Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `run_project` | Launch the project using the Project Settings main scene (same as pressing F5). | _none_ | "Run the full project so I can watch the main menu flow." |
| `stop_running_project` | Stop whatever scene the editor is currently playing. | _none_ | "Stop the running scene and return to the editor." |
| `run_current_scene` | Play the scene currently open in the editor (F6 behavior). | _none_ | "Run the scene I have open to verify the latest changes." |
| `run_specific_scene` | Play a specific saved scene by resource path. | `scene_path` (string) | "Run `res://test_main_scene.tscn` so I can test the debugger harness." |
| `reload_project` | Restart the Godot editor to fully reload the project. | `save` (optional bool, default: true) | "Restart Godot to pick up the plugin changes." |
| `reload_scene` | Reload a scene from disk, discarding unsaved changes. | `scene_path` (optional string) | "Reload the current scene to discard my changes." |
| `rescan_filesystem` | Rescan the project filesystem for external file changes. | _none_ | "Rescan the filesystem after I added new assets externally." |

---

## Editor Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `execute_editor_script` | Run arbitrary GDScript inside the editor context; explicit unsafe opt-in is required and a deadline cannot preempt blocked main-thread code. | `code` (string), `allow_unsafe=true` | "With `allow_unsafe=true`, find all nodes in the `Enemies` group and print their names." |
| `get_node_warnings` | Inspect the current scene for node configuration warnings. | `debug` (optional bool) | "Include traversal stats." |

---

## Asset Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `list_assets_by_type` | Enumerate a bounded page of assets filtered by type. | `type` plus `offset`/`limit` (default 200, max 1000) | "List the next page of `scripts` using the returned `next_offset`." |
| `list_project_files` | List a bounded page of project files matching extensions. | `extensions`, `offset`, `limit` | “Show the first page of `.tscn` and `.gd` files, then follow `next_offset`.” |

---

## Enhanced Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `get_editor_scene_structure` | Dump the scene tree with optional properties/scripts/depth. | `include_properties` (optional bool), `include_scripts` (optional bool), `max_depth` (optional number) | "Give me the scene tree including properties and script info up to depth 2." |
| `get_runtime_scene_structure` | Inspect the live scene tree from the running game. | `include_properties` (optional bool), `include_scripts` (optional bool), `max_depth` (optional number), `timeout_ms` (optional number) | "While the game is running, snapshot the runtime tree up to depth 1." |
| `evaluate_runtime_expression` | Evaluate a GDScript expression on the running game (requires the runtime debugger bridge autoload). | `expression` (string), `context_path` (optional string), `capture_prints` (optional bool), `timeout_ms` (optional number) | "On `/root/Main/Player`, evaluate `print(position); velocity.length()` and return the value." |
| `get_debug_output` | Retrieve the current Godot editor debug log along with capture diagnostics (source, control path, etc.). | _none_ | "Fetch the latest debug log and tell me how the plugin captured it." |
| `get_stack_trace_panel` | Capture the Stack Trace panel text plus parsed frames whenever the debugger is paused. | `session_id` (optional number) | "Grab the Stack Trace panel (include the structured frames) so I can see exactly where the error originated." |
| `get_stack_frames_panel` | Return the structured stack frames from the debugger bridge cache (optionally request a refresh first). | `session_id` (optional number), `refresh` (optional bool) | "Give me the current call stack frames for the active session—refresh the dump first if needed." |
| `get_editor_errors` | Read the Errors tab of the editor bottom panel to capture recent script/runtime issues. | _none_ | "Dump the Errors tab and tell me where the messages are coming from so I can triage them." |
| `clear_debug_output` | Clear the Output panel and reset the streaming baseline before a new capture. | _none_ | "Clear the Output panel so the next debug stream only shows fresh lines." |
| `clear_editor_errors` | Clear the Errors tab in the debugger panel to remove accumulated warnings and errors. | _none_ | "Clear the Errors tab so I can verify no new errors appear during the next test run." |
| `update_node_transform` | Adjust a node's transform (position/rotation/scale). | `node_path` (string), `position` (optional array), `rotation` (optional number), `scale` (optional array) | "Move `./Camera` to `[512, 256]` and set rotation to `0.5`." |
| `stream_debug_output` | Read bounded protocol-safe Output frames. Use `start`, cursor-based `read`, bounded `capture`, or `stop`; frames never print asynchronously to stdout. | `action`, `after_cursor`, `duration_ms` | "Capture 1.5 seconds of debug output and return the next cursor." |

---

## Debugger Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `debugger_enable_events` | Enable real-time debugger event notifications for breakpoints and execution changes. | _none_ | "Enable debugger events so I get notifications when breakpoints are hit." |
| `debugger_disable_events` | Disable debugger event notifications. | _none_ | "Disable debugger events to stop receiving notifications." |
| `debugger_set_breakpoint` | Set a breakpoint at a specific line in a script. | `script_path` (string), `line` (number) | "Set a breakpoint at line 25 in the player script." |
| `debugger_remove_breakpoint` | Remove a breakpoint from a script. | `script_path` (string), `line` (number) | "Remove the breakpoint at line 25 in the player script." |
| `debugger_get_breakpoints` | List all currently set breakpoints across all scripts. | _none_ | "Show me all the breakpoints I have set currently." |
| `debugger_clear_all_breakpoints` | Clear all breakpoints at once. | _none_ | "Clear all breakpoints to start fresh." |
| `debugger_pause_execution` | Pause the execution of the running project (requires active debug session). | _none_ | "Pause the game execution to examine the current state." |
| `debugger_resume_execution` | Resume paused execution. | _none_ | "Resume execution after pausing at a breakpoint." |
| `debugger_step_over` | Step over the current line while debugging (execute without entering functions). | _none_ | "Step over the current line to continue execution." |
| `debugger_step_into` | Step into the current function call to debug inside it. | _none_ | "Step into the function to see what happens inside." |
| `debugger_get_call_stack` | Get the current call stack information (requires paused execution). | `session_id` (optional number) | "Show me the call stack when the debugger is paused." |
| `debugger_get_current_state` | Get current debugger state and session information. | _none_ | "Check the current debugger state and see if we have active sessions." |

---

## Batch and Playtest Workflows

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `batch_operations` | Run up to 25 existing tools in order; `dry_run` validates schemas only. It is non-atomic and has no rollback. Outside dry run, any failed/invalid operation fails the tool call with the compact report embedded in the error. | `operations` (JSON), `dry_run`, `continue_on_error` | "Dry-run these ordered operations, then execute only after I review the valid entries." |
| `playtest` | Launch or attach to a debug game, apply bounded input phases, and assert runtime state; unavailable/errored/truncated runtime snapshots and eval bridges are infrastructure errors, and a cleanup failure fails the run. | `launch`, `phases`, `stop_after`, `capture_on_failure` | "Run this phase, assert the Player exists, and capture on failure." |

---

## Input Simulation Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `simulate_action_press` | Press and hold an input action until released. | `action` (string), `strength` (optional number 0-1) | "Press and hold the `ui_right` action." |
| `simulate_action_release` | Release a previously pressed input action. | `action` (string) | "Release the `ui_right` action." |
| `simulate_action_tap` | Briefly press and release an input action. | `action` (string), `duration_ms` (optional number) | "Tap the `ui_accept` action to confirm the selection." |
| `simulate_mouse_click` | Click at a screen position. | `x` (number), `y` (number), `button` (optional string), `double_click` (optional bool) | "Click at position (400, 300) to press the start button." |
| `simulate_mouse_move` | Move the mouse cursor to a position. | `x` (number), `y` (number) | "Move the mouse to (200, 150) to hover over the menu." |
| `simulate_drag` | Drag from one position to another. | `start_x`, `start_y`, `end_x`, `end_y` (numbers), `duration_ms`, `steps`, `button` (optional) | "Drag from (100, 100) to (300, 200) to move the item." |
| `simulate_key_press` | Press a keyboard key. | `key` (string), `duration_ms` (optional), `modifiers` (optional object) | "Press the SPACE key to make the character jump." |
| `simulate_input_sequence` | Execute a sequence of inputs with timing. | `sequence` (array of step objects) | "Execute a combo: press right, wait 100ms, tap jump, tap attack." |
| `get_input_actions` | List all available input actions in the project. | _none_ | "What input actions are available in this project?" |

---

### Tips for Prompting

- Always specify absolute node paths (e.g. `./Player`) when referring to scene nodes.
- Use resource templates (`godot://script/{path}`, `godot://assets/{type}`) for read-only data; use commands (e.g., `edit_script`) for writes.
- Combine tool calls in natural language:
  > "List image assets, pick one, then attach it to `./UI/Logo` by editing the UI script accordingly."

### Debugger-Specific Tips

- **Debug Mode Required**: Always run projects with **F5** (Debug mode), not F6 (Run mode) when using debugger tools.
- **Enable Events First**: Call `debugger_enable_events()` before setting breakpoints to receive real-time notifications.
- **Script Paths**: Use absolute `res://` paths for script locations (e.g., `"res://scripts/player.gd"`).
- **Line Numbers**: Verify line numbers exist in the target script before setting breakpoints.
- **Active Sessions**: Some debugger tools require an active debug session - start the project with F5 first.
- **Real-time Notifications**: Breakpoint hits and execution changes are sent as events when events are enabled.

### Example Debugger Workflows

**Basic Debugging**:
> "Enable debugger events, set a breakpoint at line 25 in the player script, run the game with F5, and step through the execution."

**Complex Debugging**:
> "Enable debugger events, set breakpoints at lines 15, 25, and 42 in the enemy AI script, run the game, and pause execution when breakpoints are hit to examine the call stack."

### Input Simulation Tips

- **Runtime Required**: Input simulation only works when the game is running with the debugger attached (F5).
- **Action Names**: Use `get_input_actions` to discover available actions before simulating them.
- **Coordinates**: Mouse positions are in screen/viewport space, not world coordinates.
- **Sequences**: Use `simulate_input_sequence` for complex combos that require precise timing.

### Example Input Workflows

**Testing UI Navigation**:
> "Run the project, then tap `ui_down` three times to navigate the menu, then tap `ui_accept` to select the highlighted option."

**Automated Game Testing**:
> "Run the project, simulate pressing `ui_right` for 500ms to move the character, then tap `jump` to make them jump over the obstacle."

Keep this guide handy while constructing system or user prompts so the LLM knows exactly which tools are available and how to use them.
