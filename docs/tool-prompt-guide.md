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

## Scene Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `create_scene` | Create a new scene file with optional root node type. | `path` (string), `root_node_type` (optional string) | “Create `res://scenes/shop.tscn` with a `Control` root.” |
| `save_scene` | Save the current scene, optionally overriding the path. | `path` (optional string) | “Save our current scene as `res://scenes/level_02.tscn`.” |
| `open_scene` | Open a scene in the editor. | `path` (string) | “Open `res://scenes/menu.tscn` in the editor.” |
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
| `execute_editor_script` | Run arbitrary GDScript inside the editor context. | `code` (string) | "Find all nodes in the `Enemies` group and print their names." |

---

## Asset Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `list_assets_by_type` | Enumerate assets filtered by type. | `type` (string; `images`, `audio`, `fonts`, `models`, `shaders`, `resources`, `all`) | “List all `audio` assets in the project.” |
| `list_project_files` | List project files matching specific extensions. | `extensions` (optional array of strings) | “Show all `.tscn` and `.gd` files.” |

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
| `stream_debug_output` | Start (`action="start"`) or stop (`"stop"`) live streaming of the editor Output panel (lines arrive as `[Godot Debug] ...`). | `action` (optional string, `"start"` or `"stop"`) | "Subscribe to the debug stream so new Output lines appear live; I'll stop it afterwards." |

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
