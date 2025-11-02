# Enhanced Features Guide

This guide details the enhanced features added to the Godot MCP system, allowing for even more powerful interactions between Claude AI and the Godot game engine.

## Table of Contents

- [Overview](#overview)
- [Complete Scene Tree Access](#complete-scene-tree-access)
- [Dynamic Script Resources](#dynamic-script-resources)
- [Node Transform Tools](#node-transform-tools)
- [Asset Management](#asset-management)
- [Debug Output Access](#debug-output-access)
- [Usage Examples](#usage-examples)

## Overview

The enhanced Godot MCP implementation adds several powerful capabilities beyond the basic MCP functionality:

1. Full scene tree visibility with hierarchical node structure
2. Direct access to any script by path
3. Streamlined node transform operations
4. Asset organization and querying
5. Debug and console output access

These features make the integration between Claude and Godot more seamless and powerful, enabling more complex AI-assisted game development workflows.

## Complete Scene Tree Access

The `get_full_scene_tree` command provides a complete hierarchical representation of your entire scene.

### Command Details

```typescript
// Command: get_full_scene_tree
// Parameters: None
```

### Usage

```
@mcp godot-mcp run get_full_scene_tree
```

### Response

The command returns a nested structure of all nodes in the scene, including:
- Node names and types
- Node paths
- Key properties
- Script attachments
- Child relationships

### Example Use Cases

- Analyze scene structure and organization
- Find specific nodes by type or name
- Understand parent-child relationships
- Get a comprehensive overview of scene complexity

## Dynamic Script Resources

Access any script in your project directly by path, making it easy to read and modify GDScript files throughout your project.

### Resource Endpoints

- `godot://script/{path}` - Read any script by path
- `godot://script/{path}/write` - Write to any script by path

### Usage

```
@mcp godot-mcp read godot://script/res://scripts/player.gd
```

```
@mcp godot-mcp write godot://script/res://scripts/player.gd
```

### Example Use Cases

- Read and analyze scripts from anywhere in your project
- Modify scripts directly through Claude
- Compare different scripts for consistency
- Implement cross-script functionality

## Node Transform Tools

Easily update position, rotation, and scale of nodes with a single command.

### Command Details

```typescript
// Command: update_node_transform
// Parameters:
//   node_path: Path to the node to update
//   position: (Optional) New position as [x, y]
//   rotation: (Optional) New rotation in radians
//   scale: (Optional) New scale as [x, y]
```

### Usage

```
@mcp godot-mcp run update_node_transform --node_path "./Player" --position [100, 200] --rotation 1.5 --scale [2, 2]
```

### Example Use Cases

- Precise positioning of UI elements
- Setting up initial scene layouts
- Adjusting camera views
- Fine-tuning object placement

## Asset Management

Query and organize project assets by type, making it easier to manage game resources.

### Command Details

```typescript
// Command: list_assets_by_type
// Parameters:
//   type: Asset type to list ("images", "audio", "fonts", "models", "shaders", "resources", "all")
```

### Usage

```
@mcp godot-mcp run list_assets_by_type --type images
```

### Response

Returns a structured overview of all assets of the specified type, including:
- File paths
- Organized directory structure
- File counts by type
- Nested organization for easy navigation

### Example Use Cases

- Project organization and cleanup
- Resource auditing
- Finding unused assets
- Planning asset pipelines

## Debug Output Access

Access Godot's debug output directly, allowing Claude to analyze runtime behavior.

### Command Details

```typescript
// Command: get_debug_output
// Parameters: None
```

### Usage

```
@mcp godot-mcp run get_debug_output
```

### Example Use Cases

- Debugging runtime issues
- Analyzing log patterns
- Monitoring performance
- Identifying error sources

## Usage Examples

### Example 1: Setting Up a Complete Scene

```
@mcp godot-mcp run get_full_scene_tree

I want to add a health system to my game. Please first analyze my scene structure, then add a health manager node to the scene, and help me create a script with damage and healing functions using the standard script tools.
```

Claude can:
1. Analyze the full scene tree
2. Create a new Node named "HealthManager"
3. Create a new script file with basic health management logic
4. Attach the script to the new node

### Example 2: Script Analysis and Improvement

```
@mcp godot-mcp read godot://script/res://scripts/player.gd

Can you review this player script and suggest optimizations and improvements? Please focus on making the movement feel more responsive.
```

Claude can:
1. Read and analyze the player script
2. Identify areas for improvement
3. Suggest specific code changes
4. Explain the reasoning behind each suggestion

### Example 3: Asset Organization

```
@mcp godot-mcp run list_assets_by_type --type images

My project's images seem disorganized. Can you suggest a better folder structure and naming convention for these assets?
```

Claude can:
1. Analyze the current asset structure
2. Identify patterns and inconsistencies
3. Suggest a cleaner organizational structure
4. Recommend naming conventions and folder hierarchies

### Example 4: Debugging Help

```
@mcp godot-mcp run get_debug_output

I'm seeing unexpected behavior when my player collides with enemies. Can you analyze the debug output and help identify the issue?
```

Claude can:
1. Review the debug logs
2. Identify suspicious patterns or error messages
3. Suggest potential causes
4. Recommend specific fixes
