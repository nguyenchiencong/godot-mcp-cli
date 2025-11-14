# Tool Testing Guide

This document walks through practical checks you can run to verify every MCP tool and resource template in the project. For each tool you will find:

- **Setup**: Any prerequisites before issuing the command.
- **Command**: The invocation to run from your MCP client.
- **Expected Outcome**: What a successful response should look like.

All examples assume:

- The Godot editor is open with the plugin enabled.
- The MCP server has been built (`cd server && npm run build`) and is reachable.
- Commands are executed via a client that exposes the `@mcp godot-mcp ...` syntax (adjust to your client of choice if necessary).

---

## Node Tools

### create_node
- **Setup**: Ensure a scene is open. No child named `TestNode`.
- **Command**:
  ```shell
  @mcp godot-mcp run create_node --parent_path "." --node_type "Node2D" --node_name "TestNode"
  ```
- **Expected Outcome**: Response similar to `Created Node2D node named "TestNode" at ./TestNode`. The node appears in the scene tree.

### list_nodes
- **Setup**: Run `create_node` above.
- **Command**:
  ```shell
  @mcp godot-mcp run list_nodes --parent_path "."
  ```
- **Expected Outcome**: Response lists `TestNode (Node2D) - ./TestNode`.

### update_node_property
- **Setup**: `TestNode` exists.
- **Command**:
  ```shell
  @mcp godot-mcp run update_node_property --node_path "./TestNode" --property "position" --value "[32, 64]"
  ```
- **Expected Outcome**: Confirmation showing the new value. In the editor, the node moves.

### get_node_properties
- **Command**:
  ```shell
  @mcp godot-mcp run get_node_properties --node_path "./TestNode"
  ```
- **Expected Outcome**: List of properties including `position: [32,64]`.

### delete_node
- **Command**:
  ```shell
  @mcp godot-mcp run delete_node --node_path "./TestNode"
  ```
- **Expected Outcome**: Confirmation message. The node disappears from the scene tree.

---

## Script Tools

### create_script
- **Command**:
  ```shell
  @mcp godot-mcp run create_script --script_path "res://scripts/example.gd" --content "extends Node\n\n"
  ```
- **Expected Outcome**: Script file is created on disk; Godot filesystem refreshes.

### get_script
- **Command**:
  ```shell
  @mcp godot-mcp run get_script --script_path "res://scripts/example.gd"
  ```
- **Expected Outcome**: Response includes the script content inside a fenced block.

### edit_script
- **Command**:
  ```shell
  @mcp godot-mcp run edit_script --script_path "res://scripts/example.gd" --content "extends Node\n\nfunc _ready():\n\tprint(\"Hello\")\n"
  ```
- **Expected Outcome**: Confirmation message; file contents update.

## Editor Tools

### execute_editor_script
- **Command**:
  ```shell
  @mcp godot-mcp run execute_editor_script --code "print(\"Executed from MCP\")"
  ```
- **Expected Outcome**: `"Script executed successfully"` plus the printed line in the output section.

---

## Project Tools

### run_project
- **Setup**: Project Settings must define a Main Scene (Project → Project Settings → Application → Run).
- **Command**:
  ```shell
  @mcp godot-mcp run run_project
  ```
- **Expected Outcome**: Confirmation mentioning the main scene path. The editor begins playing the project as if F5 was pressed.

### stop_running_project
- **Setup**: Start the project from the editor (press F5 or use `run_project`).
- **Command**:
  ```shell
  @mcp godot-mcp run stop_running_project
  ```
- **Expected Outcome**: Success message like `Stopped the running scene.` The play session terminates; if nothing was running the response mentions the editor was idle.

### run_current_scene
- **Setup**: Open and save a scene in the editor.
- **Command**:
  ```shell
  @mcp godot-mcp run run_current_scene
  ```
- **Expected Outcome**: Response lists the scene path and the editor starts playing that scene (same as pressing F6).

### run_specific_scene
- **Setup**: Note the resource path of a saved scene (e.g. `res://test_main_scene.tscn`).
- **Command**:
  ```shell
  @mcp godot-mcp run run_specific_scene --scene_path "res://test_main_scene.tscn"
  ```
- **Expected Outcome**: Confirmation showing the requested path. Godot launches that scene (same as pressing F6 with "Run Specific Scene").

---

## Scene Tools

### get_project_info
- **Command**:
  ```shell
  @mcp godot-mcp run get_project_info
  ```
- **Expected Outcome**: Project name, version, path, Godot version, optional current scene.

### get_editor_scene_structure
- **Command**:
  ```shell
  @mcp godot-mcp run get_editor_scene_structure --include_properties true --include_scripts true --max_depth 1
  ```
- **Expected Outcome**: Summary line plus a tree dump showing root and first-level children with selected properties/scripts.

### save_scene
- **Command**:
  ```shell
  @mcp godot-mcp run save_scene
  ```
- **Expected Outcome**: Confirmation that the current scene was saved (path reported).

---

## Asset Tools

### list_assets_by_type
- **Command**:
  ```shell
  @mcp godot-mcp run list_assets_by_type --type images
  ```
- **Expected Outcome**: Summary line followed by every matching asset path (no truncation).

### list_project_files
- **Command**:
  ```shell
  @mcp godot-mcp run list_project_files --extensions '[".tscn",".gd"]'
  ```
- **Expected Outcome**: Summary line plus complete list of matching files.

---

## Enhanced Tools

### get_debug_output
- **Command**:
  ```shell
  @mcp godot-mcp run get_debug_output
  ```
- **Expected Outcome**: Recent editor log output or a message noting that no output is available.

### get_editor_errors
- **Setup**: Trigger a script/runtime error (e.g., run a scene with a `push_error()` in `_ready()`) so the Errors tab has content, or proceed without setup to confirm an empty tab report.
- **Command**:
  ```shell
  @mcp godot-mcp run get_editor_errors
  ```
- **Expected Outcome**: Either the list of error lines plus capture diagnostics (control path, timestamp, etc.) or confirmation that the Errors tab is empty.

### get_stack_trace_panel
- **Setup**: Pause the debugger by inducing an error or hitting a breakpoint so the Stack Trace tab is populated.
- **Command**:
  ```shell
  @mcp godot-mcp run get_stack_trace_panel
  ```
- **Expected Outcome**: The response contains `stack_trace_panel.lines`, a `frames` array with parsed entries, and diagnostics describing which control was captured.

### get_stack_frames_panel
- **Setup**: Pause execution and (optionally) run `debugger_get_call_stack` so the debugger bridge cache contains frames.
- **Command**:
  ```shell
  @mcp godot-mcp run get_stack_frames_panel --refresh true
  ```
- **Expected Outcome**: Response includes a non-empty `frames` array. If empty, diagnostics explain why (e.g., cache not populated).

### clear_debug_output
- **Setup**: Generate a few lines in the Output panel (e.g., via `print()` or `push_warning()`), then run the command.
- **Command**:
  ```shell
  @mcp godot-mcp run clear_debug_output
  ```
- **Expected Outcome**: `cleared: true`, a non-empty `method` (such as `editor_log_clear`), and diagnostics confirming the timestamp/attempted strategies. Subsequent calls to `stream_debug_output` should report a reset frame.

### get_runtime_scene_structure
- **Setup**: Run the project (or attach the debugger) so that a runtime session is active.
- **Command**:
  ```shell
  @mcp godot-mcp run get_runtime_scene_structure --max_depth 1 --timeout_ms 1200
  ```
- **Expected Outcome**: Summary including the runtime scene path and root, followed by the live scene tree. If the project is not running, an informative error is returned.

---

## Resource Templates

### godot://script/{path}
- **Command**:
  ```shell
  @mcp godot-mcp read godot://script/res://scripts/example.gd
  ```
- **Expected Outcome**: Raw script content with metadata (path, language).

### godot://script/{path}/metadata
- **Command**:
  ```shell
  @mcp godot-mcp read godot://script/res://scripts/example.gd/metadata
  ```
- **Expected Outcome**: JSON payload summarising class name, extends, methods, signals, etc.

### godot://assets/{type}
- **Command**:
  ```shell
  @mcp godot-mcp read godot://assets/images
  ```
- **Expected Outcome**: JSON object containing `count`, `files`, and `organizedFiles`.

---

## Debugger Tools

### debugger_enable_events
- **Setup**: Ensure project is ready to run with debugging (F5).
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_enable_events
  ```
- **Expected Outcome**: Success message confirming events are enabled for the client.

### debugger_get_current_state
- **Setup**: No setup required.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_get_current_state
  ```
- **Expected Outcome**: Current debugger state showing active sessions, breakpoints, execution status.

### debugger_set_breakpoint
- **Setup**: Have a script file available (e.g., the test_debugger.gd script).
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_set_breakpoint --script_path "res://test_debugger.gd" --line 42
  ```
- **Expected Outcome**: Success message confirming breakpoint is set.

### debugger_get_breakpoints
- **Setup**: Set at least one breakpoint using the command above.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_get_breakpoints
  ```
- **Expected Outcome**: List of all currently set breakpoints organized by script.

### debugger_pause_execution
- **Setup**: Project must be running with debugging enabled (F5).
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_pause_execution
  ```
- **Expected Outcome**: Success message confirming execution is paused.

### debugger_resume_execution
- **Setup**: Project must be paused (either at breakpoint or manually paused).
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_resume_execution
  ```
- **Expected Outcome**: Success message confirming execution has resumed.

### debugger_step_over
- **Setup**: Project must be paused at a breakpoint.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_step_over
  ```
- **Expected Outcome**: Success message confirming step over execution.

### debugger_step_into
- **Setup**: Project must be paused at a breakpoint.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_step_into
  ```
- **Expected Outcome**: Success message confirming step into execution.

### debugger_get_call_stack
- **Setup**: Project must be paused at a breakpoint.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_get_call_stack
  ```
- **Expected Outcome**: Call stack information showing current execution frames.

### debugger_clear_all_breakpoints
- **Setup**: Have some breakpoints set.
- **Command**:
  ```shell
  @mcp godot-mcp run debugger_clear_all_breakpoints
  ```
- **Expected Outcome**: Success message confirming all breakpoints are cleared.

---

## Debugger Resource Templates

### godot://debugger/state
- **Setup**: No setup required.
- **Command**:
  ```shell
  @mcp godot-mcp read godot://debugger/state
  ```
- **Expected Outcome**: JSON with current debugger state, sessions, and execution status.

### godot://debugger/breakpoints
- **Setup**: Set at least one breakpoint.
- **Command**:
  ```shell
  @mcp godot-mcp read godot://debugger/breakpoints
  ```
- **Expected Outcome**: JSON listing all active breakpoints across scripts.

### godot://debugger/call-stack
- **Setup**: Project must be paused at a breakpoint.
- **Command**:
  ```shell
  @mcp godot-mcp read godot://debugger/call-stack
  ```
- **Expected Outcome**: JSON with current call stack information.

---

## Complete Debugger Testing Workflow

For comprehensive debugger testing, follow this workflow:

1. **Enable Events**:
   ```shell
   @mcp godot-mcp run debugger_enable_events
   ```

2. **Check Initial State**:
   ```shell
   @mcp godot-mcp run debugger_get_current_state
   ```

3. **Open Test Scene**:
   ```shell
   @mcp godot-mcp run open_scene --scene_path "res://test_main_scene.tscn"
   ```

4. **Set Test Breakpoints**:
   ```shell
   @mcp godot-mcp run debugger_set_breakpoint --script_path "res://test_debugger.gd" --line 42
   ```

5. **Verify Breakpoints**:
   ```shell
   @mcp godot-mcp run debugger_get_breakpoints
   ```

6. **Run Project with Debugging**:
   - Press **F5** in Godot Editor
   - Wait for automatic breakpoint triggers (every ~60 frames)

7. **Test Execution Control**:
   ```shell
   @mcp godot-mcp run debugger_pause_execution
   @mcp godot-mcp run debugger_step_over
   @mcp godot-mcp run debugger_step_into
   @mcp godot-mcp run debugger_resume_execution
   ```

8. **Inspect State**:
   ```shell
   @mcp godot-mcp read godot://debugger/state
   @mcp godot-mcp run debugger_get_call_stack
   ```

9. **Cleanup**:
   ```shell
   @mcp godot-mcp run debugger_clear_all_breakpoints
   ```

For detailed debugging scenarios and troubleshooting, see [TESTING_DEBUGGER.md](../TESTING_DEBUGGER.md).

---

## Cleanup Suggestions

- Delete temporary nodes or scripts created during testing to keep the project tidy.
- Clear all breakpoints after testing to avoid interference with normal development.
- If you created new assets or scenes solely for testing, remove or revert them as appropriate.
