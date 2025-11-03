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

## Cleanup Suggestions

- Delete temporary nodes or scripts created during testing to keep the project tidy.
- If you created new assets or scenes solely for testing, remove or revert them as appropriate.
