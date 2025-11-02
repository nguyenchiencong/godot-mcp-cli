# Godot MCP Command Reference

This document provides a reference for the commands available through the Godot MCP integration.

## Table of Contents

- [Node Tools](#node-tools)
- [Script Tools](#script-tools)
- [Editor Tools](#editor-tools)
- [Scene Tools](#scene-tools)
- [Asset Tools](#asset-tools)
- [Enhanced Tools](#enhanced-tools)
- [Using Commands with Claude](#using-commands-with-claude)

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

### create_script_template
Generate a GDScript template with common boilerplate.

**Parameters:**
- `class_name` (optional) - Optional class name for the script
- `extends_type` - Base class that this script extends (default: "Node")
- `include_ready` - Whether to include the _ready() function (default: true)
- `include_process` - Whether to include the _process() function (default: false)
- `include_input` - Whether to include the _input() function (default: false)
- `include_physics` - Whether to include the _physics_process() function (default: false)

**Example:**
```
Create a script template for a KinematicBody2D with process and input functions.
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

## Enhanced Tools

### get_editor_scene_structure
Return the current scene hierarchy with optional detail flags.

**Parameters:**
- `include_properties` (optional, default `false`) - Include editor-visible properties such as position/rotation
- `include_scripts` (optional, default `false`) - Include attached script metadata
- `max_depth` (optional) - Limit traversal depth (`0` = only root)

**Example:**
```
Dump the entire scene tree including properties so I can review the layout.
```

### get_debug_output
Fetch the Godot editor's debug console output.

**Parameters:** None

**Example:**
```
Show me the latest debug logs from the editor.
```

## Using Commands with Claude

When working with Claude, you don't need to specify the exact command name or format. Instead, describe what you want to do in natural language, and Claude will use the appropriate command. For example:

```
Claude, can you create a new Label node under the UI node with the text "Score: 0"?
```

Claude will understand this request and use the `create_node` command with the appropriate parameters.
