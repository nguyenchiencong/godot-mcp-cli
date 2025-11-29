# Godot MCP Command Reference

This document provides a reference for the commands available through the Godot MCP integration.

## Table of Contents

- [Node Tools](#node-tools)
- [Script Tools](#script-tools)
- [Editor Tools](#editor-tools)
- [Scene Tools](#scene-tools)
- [Project Tools](#project-tools)
- [Asset Tools](#asset-tools)
- [Debugger Tools](#debugger-tools)
- [Input Simulation Tools](#input-simulation-tools)
- [Enhanced Tools](#enhanced-tools)
- [Resource Templates](#resource-templates)
- [Using Commands with Claude](#using-commands-with-claude)
- [Usage Examples](#usage-examples)

## Node Tools

### create_node
Create a new node in the Godot scene tree.

**Parameters:**
- `parent_path` - Path to the parent node (e.g., ".", "./UI")
- `node_type` - Type of node to create (e.g., "Node2D", "Sprite2D", "Label")
- `node_name` - Name for the new node

**Example:**
```
Create a Button node named "StartButton" under the CanvasLayer.
```

### delete_node
Delete a node from the scene tree.

**Parameters:**
- `node_path` - Path to the node to delete

**Example:**
```
Delete the node at "./UI/OldButton".
```

### update_node_property
Update a property of a node.

**Parameters:**
- `node_path` - Path to the node to update
- `property` - Name of the property to update
- `value` - New value for the property

**Example:**
```
Update the "text" property of the node at "./UI/Label" to "Game Over".
```

### get_node_properties
Get all properties of a node.

**Parameters:**
- `node_path` - Path to the node to inspect

**Example:**
```
Show me all the properties of the node at "./Player".
```

### list_nodes
List all child nodes under a parent node.

**Parameters:**
- `parent_path` - Path to the parent node

**Example:**
```
List all nodes under "./UI".
```

## Script Tools

### create_script
Create a new GDScript file.

**Parameters:**
- `script_path` - Path where the script will be saved
- `content` - Content of the script
- `node_path` (optional) - Path to a node to attach the script to

**Example:**
```
Create a script at "res://scripts/player_controller.gd" with a basic movement system.
```

### edit_script
Edit an existing GDScript file.

**Parameters:**
- `script_path` - Path to the script file to edit
- `content` - New content of the script

**Example:**
```
Update the script at "res://scripts/player_controller.gd" to add a jump function.
```

### get_script
Get the content of a GDScript file.

**Parameters:**
- `script_path` (optional) - Path to the script file
- `node_path` (optional) - Path to a node with a script attached

**Example:**
```
Show me the script attached to the node at "./Player".
```

## Editor Tools

### execute_editor_script
Execute arbitrary GDScript code directly in the Godot editor context.

**Parameters:**
- `code` - GDScript code to execute in the editor context

**Example:**
```
Execute a script to find all nodes with "Player" in their name and print their paths.
```

**Use Cases:**
- Batch operations on multiple nodes or assets
- Running custom utility scripts without saving files
- Testing code snippets and inspecting editor state
- Automating repetitive editor tasks

**Note:** Scripts run in the editor context with access to editor APIs and can modify the current scene, but don't run in the game runtime.

## Scene Tools

### create_scene
Creates a new empty scene with an optional root node type.

**Parameters:**
- `path` (string): Path where the new scene will be saved (e.g. "res://scenes/new_scene.tscn")
- `root_node_type` (string, optional): Type of root node to create (e.g. "Node2D", "Node3D", "Control"). Defaults to "Node" if not specified

**Returns:**
- `scene_path` (string): Path where the scene was saved
- `root_node_type` (string): The type of the root node that was created

**Example:**
```typescript
// Create a new scene with a Node2D as root
const result = await mcp.execute('create_scene', {
  path: 'res://scenes/game_level.tscn',
  root_node_type: 'Node2D'
});
console.log(`Created scene at ${result.scene_path}`);
```

### save_scene
Save the current scene to disk.

**Parameters:**
- `path` (optional) - Path where the scene will be saved (uses current path if not provided)

**Example:**
```
Save the current scene to "res://scenes/level_1.tscn".
```

### open_scene
Open a scene in the editor.

**Parameters:**
- `path` - Path to the scene file to open

**Example:**
```
Open the scene at "res://scenes/main_menu.tscn".
```

### get_current_scene
Get information about the currently open scene.

**Parameters:** None

**Example:**
```
What scene am I currently editing?
```

### get_project_info
Get information about the current Godot project.

**Parameters:** None

**Example:**
```
Tell me about the current project.
```

### create_resource
Create a new resource in the project.

**Parameters:**
- `resource_type` - Type of resource to create
- `resource_path` - Path where the resource will be saved
- `properties` (optional) - Dictionary of property values to set on the resource

**Example:**
```
Create a StyleBoxFlat resource at "res://resources/button_style.tres" with a blue background color.
```

## Project Tools

### run_project
Start the project using the main scene defined in Project Settings (same as pressing **F5** in the editor).

**Parameters:** None

**Example:**
```
Run the full project so I can verify the intro flow.
```

### stop_running_project
Stop the currently running scene if the editor is in play mode.

**Parameters:** None

**Example:**
```
Stop the running project and return to the editor.
```

### run_current_scene
Play the scene that is currently open in the editor (equivalent to pressing **F6**).

**Parameters:** None

**Example:**
```
Run the open scene so I can test the latest layout changes.
```

### run_specific_scene
Launch a specific saved scene by resource path without changing the editor’s open scene.

**Parameters:**
- `scene_path` - Resource path of the scene to run (e.g., `"res://test_main_scene.tscn"`)

**Example:**
```
Run "res://test_main_scene.tscn" to exercise the debugger harness.
```

## Asset Tools

### list_assets_by_type
List every asset of a specific type in the project.

**Parameters:**
- `type` - Asset category to list (`images`, `audio`, `fonts`, `models`, `shaders`, `resources`, or `all`)

**Behavior:**
- Returns a summary line, followed by the full list of matching asset paths.

**Example:**
```
List all image assets in the project so I can audit the art pipeline.
```

### list_project_files
List project files that match a set of extensions.

**Parameters:**
- `extensions` (optional) - Array of extensions to filter by (e.g. `[".tscn", ".gd"]`). Leave empty to list every file.

**Behavior:**
- Returns a summary line, followed by the full list of matching file paths.

**Example:**
```
Show me every *.tscn file in the project.
```

## Debugger Tools

The debugger tools provide comprehensive debugging capabilities for your Godot projects. These tools require running the project with debugging enabled (F5 in Godot Editor).

### debugger_enable_events
Enable real-time debugger event notifications for the current client.

**Parameters:** None

**Returns:** Success message with client ID

**Example:**
```
Enable debugger events so I can receive breakpoint notifications.
```

### debugger_disable_events
Disable debugger event notifications for the current client.

**Parameters:** None

**Returns:** Success message

**Example:**
```
Disable debugger events for this client.
```

### debugger_set_breakpoint
Set a breakpoint at a specific line in a script.

**Parameters:**
- `script_path` - Path to the script file (absolute or relative to res://)
- `line` - Line number where to set the breakpoint

**Returns:** Success message with breakpoint details

**Example:**
```
Set a breakpoint at line 42 in the player script.
```

### debugger_remove_breakpoint
Remove a breakpoint from a script.

**Parameters:**
- `script_path` - Path to the script file
- `line` - Line number where to remove the breakpoint

**Returns:** Success message

**Example:**
```
Remove the breakpoint at line 42 in the player script.
```

### debugger_get_breakpoints
Get all currently set breakpoints across all scripts.

**Parameters:** None

**Returns:** List of breakpoints organized by script

**Example:**
```
Show me all the breakpoints I currently have set.
```

### debugger_clear_all_breakpoints
Clear all breakpoints at once.

**Parameters:** None

**Returns:** Success message with cleared breakpoints

**Example:**
```
Clear all breakpoints in the project.
```

### debugger_pause_execution
Pause the execution of the running project.

**Parameters:** None

**Returns:** Success message with session information

**Example:**
```
Pause the game execution so I can examine the current state.
```

### debugger_resume_execution
Resume paused execution.

**Parameters:** None

**Returns:** Success message with session information

**Example:**
```
Resume the game execution.
```

### debugger_step_over
Step over the current line of code (don't enter function calls).

**Parameters:** None

**Returns:** Success message with session information

**Example:**
```
Step over the current line while debugging.
```

### debugger_step_into
Step into the current function call.

**Parameters:** None

**Returns:** Success message with session information

**Example:**
```
Step into this function to see what it does.
```


### debugger_get_call_stack
Get the current call stack information.

**Parameters:**
- `session_id` (optional) - Debug session ID (will use active session if not provided)

**Returns:** Call stack information with frames

**Example:**
```
Get the current call stack to see how we got here.
```

### debugger_get_current_state
Get the current debugger state including sessions and execution status.

**Parameters:** None

**Returns:** Comprehensive debugger state information

**Example:**
```
Show me the current debugger state and active sessions.
```

## Input Simulation Tools

The input simulation tools allow AI agents to interact with a running Godot game in real-time. These tools can simulate button presses, mouse clicks, drag operations, and complex input sequences for automated testing and game interaction.

**Requirements:**
- The Godot project must be running with the debugger attached (F5 in editor)
- The `mcp_input_handler.gd` autoload must be registered in the running game

### simulate_action_press
Press and hold a Godot input action. The action will remain pressed until released.

**Parameters:**
- `action` - The action name (e.g., "ui_accept", "ui_left", "jump")
- `strength` (optional) - Action strength from 0 to 1 (default: 1.0)

**Example:**
```
Press and hold the "ui_right" action to move the character right.
```

### simulate_action_release
Release a previously pressed input action.

**Parameters:**
- `action` - The action name to release

**Example:**
```
Release the "ui_right" action.
```

### simulate_action_tap
Briefly press and release an input action (like pressing a button).

**Parameters:**
- `action` - The action name
- `duration_ms` (optional) - How long to hold in milliseconds (default: 100ms)

**Example:**
```
Tap the "ui_accept" button to confirm the selection.
```

### simulate_mouse_click
Simulate a mouse click at a specific screen position.

**Parameters:**
- `x` - X coordinate in screen/viewport space
- `y` - Y coordinate in screen/viewport space
- `button` (optional) - Mouse button: "left", "right", or "middle" (default: "left")
- `double_click` (optional) - Perform a double-click (default: false)

**Example:**
```
Click at position (400, 300) to press the start button.
```

### simulate_mouse_move
Move the mouse cursor to a specific screen position.

**Parameters:**
- `x` - X coordinate in screen/viewport space
- `y` - Y coordinate in screen/viewport space

**Example:**
```
Move the mouse to (200, 150) to hover over the menu item.
```

### simulate_drag
Simulate a drag operation from one position to another.

**Parameters:**
- `start_x` - Starting X coordinate
- `start_y` - Starting Y coordinate
- `end_x` - Ending X coordinate
- `end_y` - Ending Y coordinate
- `duration_ms` (optional) - Total drag duration in milliseconds (default: 200ms)
- `steps` (optional) - Number of intermediate positions (default: 10)
- `button` (optional) - Mouse button to use (default: "left")

**Example:**
```
Drag the inventory item from (100, 200) to (300, 200) to move it to another slot.
```

### simulate_key_press
Simulate pressing a keyboard key.

**Parameters:**
- `key` - Key to press (e.g., "SPACE", "ENTER", "A", "F1", "ESCAPE")
- `duration_ms` (optional) - How long to hold in milliseconds (default: 100ms)
- `modifiers` (optional) - Object with modifier keys: `shift`, `ctrl`, `alt`, `meta`

**Example:**
```
Press the SPACE key to make the character jump.
```

### simulate_input_sequence
Execute a sequence of input actions with precise timing.

**Parameters:**
- `sequence` - Array of input steps, each with:
  - `type` - One of: "press", "release", "tap", "wait", "click"
  - `action` (for press/release/tap) - Action name
  - `duration_ms` (for tap/wait) - Duration in milliseconds
  - `x`, `y` (for click) - Click coordinates
  - `button` (for click) - Mouse button

**Example:**
```
Execute a combo: press "ui_right" for 500ms, then tap "jump", wait 100ms, then tap "attack".
```

**Sequence Example:**
```json
{
  "sequence": [
    { "type": "press", "action": "ui_right" },
    { "type": "wait", "duration_ms": 500 },
    { "type": "tap", "action": "jump", "duration_ms": 100 },
    { "type": "wait", "duration_ms": 100 },
    { "type": "tap", "action": "attack" },
    { "type": "release", "action": "ui_right" }
  ]
}
```

### get_input_actions
List all available input actions defined in the Godot project.

**Parameters:** None

**Example:**
```
What input actions are available in this project?
```

**Response Contains:**
- List of action names with their key/button bindings
- Deadzone settings for each action

**Common Godot UI Actions:**
- `ui_accept` - Enter/Space
- `ui_cancel` - Escape
- `ui_left`, `ui_right`, `ui_up`, `ui_down` - Arrow keys
- `ui_focus_next` - Tab
- `ui_focus_prev` - Shift+Tab
- `ui_page_up`, `ui_page_down` - Page Up/Down
- `ui_home`, `ui_end` - Home/End

## Enhanced Tools

### get_editor_scene_structure
Return the current scene hierarchy with optional detail flags.

**Parameters:**
- `include_properties` (optional, default `false`) - include editor-visible properties such as position/rotation.
- `include_scripts` (optional, default `false`) - include attached script metadata for each node.
- `max_depth` (optional) - limit recursion depth (`0` = only root).

**Command Details**
```typescript
// Command: get_editor_scene_structure
// Parameters (all optional):
//   include_properties: boolean
//   include_scripts: boolean
//   max_depth: number  // 0 = only root
```

**Usage**
```
@mcp godot-mcp run get_editor_scene_structure
```

```
@mcp godot-mcp run get_editor_scene_structure --include_properties true --include_scripts true
```

```
@mcp godot-mcp run get_editor_scene_structure --max_depth 1
```

**Response Contains**
- `scene_path`, `root_node_name`, `root_node_type`.
- `structure`: nested hierarchy (`name`, `type`, `path`, child array).
- Optional `properties` and `script` blocks when the corresponding flags are enabled.

**Use Cases**
- Audit scene layout before making structural edits.
- Generate summaries for documentation or code review.
- Quickly locate nodes or scripts in complex projects.

### get_runtime_scene_structure
Return the live scene hierarchy from the running game (via the remote debugger).

**Parameters:**
- `include_properties` (optional, default `false`) - attempt to include common properties (when available).
- `include_scripts` (optional, default `false`) - reserve script metadata (currently informational only).
- `max_depth` (optional) - limit recursion depth (`0` = only root).
- `timeout_ms` (optional, default `800`) - how long to wait for a runtime snapshot (100-5000 ms).

**Usage**
```
@mcp godot-mcp run get_runtime_scene_structure
```

```
@mcp godot-mcp run get_runtime_scene_structure --max_depth 1 --timeout_ms 1200
```

**Response Contains**
- `scene_path`, `root_node_name`, `root_node_type`, `runtime`.
- `structure`: nested hierarchy with `name`, `type`, `path`, `object_id`, `scene_file_path`, and `visibility`.
- Optional warnings when a requested detail (scripts/properties) is not yet exposed.

**Use Cases**
- Compare the edited scene with the runtime instance to find dynamically spawned nodes.
- Diagnose objects that appear or disappear only while the project is running.
- Capture live hierarchy snapshots during automated debugging sessions.

### evaluate_runtime
Evaluate a single GDScript expression against the running game through the remote debugger.

> Warning: Requires the sample autoload (`runtime_scene_publisher_limboai.gd`) or another script that registers `EngineDebugger.register_message_capture("mcp_eval", ...)` in the running project.

**Parameters:**
- `expression` - The expression to evaluate. Runs with the resolved node as `self`.
- `context_path` (optional) - Node path (e.g. `"/root/Main/Player"`) to resolve `self` for the expression. Defaults to the current scene root.
- `capture_prints` (optional, default `true`) - Include any `print()` output produced by the expression.
- `timeout_ms` (optional, default `800`) - How long to wait for the debugger response (100-5000 ms).

**Usage**
```
@mcp godot-mcp run evaluate_runtime --expression "health"
```

```
@mcp godot-mcp run evaluate_runtime --expression "print(position); velocity.length()" --context_path "/root/Main/Player" --timeout_ms 1200
```

**Response Contains**
- `success` - Whether the expression executed without runtime errors.
- `result` - The evaluated value (when available).
- `output` - Array of strings containing intercepted `print()` output.
- `error` - Error message when evaluation fails or times out.

**Use Cases**
- Inspect live values from the running scene without pausing the game.
- Grab quick measurements (positions, health, timers) from remote nodes.
- Trigger lightweight runtime-side helpers (e.g. `print(debug_state())`) and capture the output inline.

### get_debug_output
Fetch the current contents of the editor Output panel.

**Parameters:** None

**Example:**
```
Show me the latest debug logs from the editor.
```

**Response Contains**
- `output` — string containing the full Output panel text at the moment of the request.
- `diagnostics` — dictionary describing how the log was captured (`source`, `detail`, last control path/class, log file fallback, etc.).

**Use Cases:**
- Investigate crash/warning messages while iterating on features.
- Review custom `print()` output triggered through `execute_editor_script`.
- Share runtime diagnostics with collaborators or automated agents, including metadata that explains where the text was sourced (editor control, debugger fallback, log file).

### get_editor_errors
Read the Errors tab that appears beside Output/Debugger in the editor bottom panel.

**Parameters:** None

**Example:**
```
List the errors currently shown in the Errors tab and include whatever diagnostics you have about their source.
```

**Response Contains**
- `text` - Full Errors tab text.
- `lines` - Array of individual lines (when available).
- `line_count` - Number of lines parsed from the control.
- `diagnostics` - Metadata describing how the Errors tab text was captured (`control_path`, `control_class`, `timestamp`, `search_summary`, etc.).

**Use Cases**
- Capture script/runtime errors without leaving the MCP conversation.
- Provide supporting evidence when explaining crashes or failed evaluations.
- Verify that recent warnings have been resolved by re-running the command and checking that the tab is empty.

### get_stack_trace_panel
Capture the Stack Trace tab content along with parsed stack frames whenever execution pauses.

**Parameters**
- `session_id` (optional) – Debugger session identifier to associate with the capture. Defaults to the active session reported by Godot.

**Example**
```
@mcp godot-mcp run get_stack_trace_panel
```

**Response Contains**
- `stack_trace_panel.text` – Raw text extracted from the Stack Trace panel.
- `stack_trace_panel.lines` – Individual lines when the panel control supports them.
- `stack_trace_panel.frames` – Array of parsed frames with `index`, `function`, `script`, `line`, and original column data.
- `stack_trace_panel.diagnostics` – Metadata such as capture timestamp, control path, and search summary.
- `session_id` – Session the capture is associated with (when available).
- `debugger_state` – Snapshot of the debugger’s current state (active sessions, paused flag, etc.).

**Use Cases**
- When an error pauses execution, grab the same Stack Trace view shown in the editor for sharing with collaborators or tooling.
- Extract structured frame data for automated reasoning (e.g., highlight scripts/lines that need fixes).
- Confirm that the Stack Trace panel is empty again after resolving an exception.

### subscribe_debug_output / unsubscribe_debug_output
Register or remove a live subscription to the Output panel feed. Once subscribed, incremental log frames are pushed asynchronously over the MCP WebSocket connection; they appear in the MCP server console by default.

**Parameters:** None

**Usage**
```
@mcp godot-mcp run subscribe_debug_output
```

```
@mcp godot-mcp run unsubscribe_debug_output
```

**Response Contains**
- `subscribed` - boolean flag indicating if the subscription is now active.
- `message` - Text explaining the effect (start/stop).

**Use Cases**
- Keep a running tail of warnings and prints during play mode without issuing repeated `get_debug_output` calls.
- Capture noisy runtime diagnostics while reproducing bugs.
- Mirror the debugger log in external tooling or CI pipelines.

> **Tip:** The enhanced MCP tool `stream_debug_output` wraps these commands with an `action` parameter (`"start"`/`"stop"`). When the stream is active, each new line appears in the MCP server console prefixed with `[Godot Debug] ...`.

### get_stack_frames_panel
Return the structured stack frames for a paused debugger session as reported by the debugger bridge cache.

**Parameters**
- `session_id` (optional) – Target debugger session. Defaults to the active session.
- `refresh` (optional, boolean) – If `true`, requests a fresh `get_stack_dump` before reading the cache (the response still returns the cached frames available when the command finishes).

**Example**
```
@mcp godot-mcp run get_stack_frames_panel --refresh true
```

**Response Contains**
- `frames` – Array of frame objects (`index`, `function`, `script`, `line`, etc.).
- `stack_info` – The raw bridge snapshot including `total_frames`, `current_frame`, and any additional metadata.
- `diagnostics` – Session ID, cache source, and warnings when no frames are available.

**Use Cases**
- Retrieve a machine-friendly call stack even when the Stack Trace UI is empty.
- Compare the UI output with the debugger bridge cache during CI or automated testing.

**Manual Test**
1. `@mcp godot-mcp run stream_debug_output {"action":"start"}` — the client reports that the subscription is active.
2. Trigger fresh output in Godot (e.g., `push_error("Stream test")` or a `print()`).
3. Confirm the MCP console shows `[Godot Debug] Stream test`.
4. `@mcp godot-mcp run stream_debug_output {"action":"stop"}` — no further log lines are emitted after unsubscribing.

### clear_debug_output
Clear the editor Output panel and reset the streaming baseline so subscribers receive a fresh log.

**Parameters:** None

**Example**
```
@mcp godot-mcp run clear_debug_output
```

**Response Contains**
- `cleared` – `true` if the Output panel text was erased successfully.
- `method` – Which strategy succeeded (`editor_log_clear`, `control_clear`, etc.).
- `diagnostics` – Attempts, timestamp, and any errors encountered while looking for the control.
- `message` – Human-friendly summary of the action taken.

**Use Cases**
- Reset noisy logs before starting a fresh debug capture.
- Force `stream_debug_output` subscribers to treat subsequent frames as a clean slate (a reset frame is broadcast automatically).
- Quickly confirm that the Output panel can be controlled programmatically from an MCP workflow.

### clear_editor_errors
Clear the Errors tab in the Godot editor debugger panel.

**Parameters:** None

**Example**
```
@mcp godot-mcp run clear_editor_errors
```

**Response Contains**
- `cleared` – `true` if the Errors tab was cleared successfully.
- `method` – Which strategy succeeded (`tree_clear`, `tab_control_clear`, etc.).
- `diagnostics` – Attempts, timestamp, tab title, and any errors encountered while looking for the control.
- `message` – Human-friendly summary of the action taken.

**Use Cases**
- Clear accumulated errors before running a fresh test session.
- Remove old warnings/errors after fixing issues to verify the tab stays empty.
- Programmatically reset error state from an MCP workflow.

### update_node_transform
Adjust a node’s position, rotation, or scale from the editor.

**Parameters:**
- `node_path` – Path to the node (e.g. `"./Player"`).
- `position` (optional) – New position as `[x, y]`.
- `rotation` (optional) – Rotation in radians.
- `scale` (optional) – New scale as `[x, y]`.

**Example:**
```
@mcp godot-mcp run update_node_transform --node_path "./Player" --position [100, 200] --rotation 1.5 --scale [2, 2]
```

**Use Cases:**
- Precisely align UI elements or cameras.
- Reset transforms after scripted changes.
- Batch-move groups of nodes via successive calls.

## Resource Templates

Resource templates expose read-only endpoints via the MCP `read` verb:

- `godot://script/{path}` – Script content and inferred language.
- `godot://script/{path}/metadata` – Script metadata (class name, extends, methods, signals).
- `godot://scene/current` – Current scene structure (`include_properties`/`include_scripts` enabled).
- `godot://scene/tree` – Structure-only version of the scene tree.
- `godot://assets/{type}` – JSON representation of assets filtered by `images`, `audio`, `fonts`, `models`, `shaders`, `resources`, or `all`.
- `godot://debug/log` – Latest editor debug output.
- `godot://debugger/state` – Current debugger state and session information.
- `godot://debugger/breakpoints` – Active breakpoints across all scripts.
- `godot://debugger/call-stack/{sessionId?}` – Call stack for specific debug session (or active session).
- `godot://debugger/session/{sessionId}` – Detailed information about a specific debugger session.

> **Note:** To modify script content, continue using the `edit_script` command rather than a resource template.

## Using Commands with Claude

When working with Claude, you don't need to specify the exact command name or format. Instead, describe what you want to do in natural language, and Claude will use the appropriate command. For example:

```
Claude, can you create a new Label node under the UI node with the text "Score: 0"?
```

Claude will understand this request and use the `create_node` command with the appropriate parameters.

## Usage Examples

- **Scene review & augmentation**
  ```
  @mcp godot-mcp run get_editor_scene_structure --include_properties true --include_scripts true

  I want to add a health system to my game. Please analyze the current structure, add a HealthManager node, and generate a script with damage/heal logic.
  ```

- **Script analysis**
  ```
  @mcp godot-mcp read godot://script/res://scripts/player.gd

  Can you suggest optimisations to make the movement code more responsive?
  ```

- **Asset audit**
  ```
  @mcp godot-mcp run list_assets_by_type --type images

  These sprites are messy; propose a folder structure and renaming scheme.
  ```

- **Debug assistance**
  ```
  @mcp godot-mcp run get_debug_output

  I'm seeing a physics warning—help me interpret and fix it.
  ```
