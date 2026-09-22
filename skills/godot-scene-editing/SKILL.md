---
name: godot-scene-editing
description: Inspect, create, edit, and validate Godot scenes and nodes through the godot-mcp CLI, covering scene structure dumps, node lifecycle, property and transform edits, and visual scene capture. Use when building or modifying scenes, adding or removing nodes, reading or setting node properties, validating scene structure, or capturing what a scene looks like.
---

# Godot Scene Editing

## Quick start

Read the current scene tree, then edit a node:

```bash
godot-mcp get_editor_scene_structure --include-properties true --max-depth 2
godot-mcp update_node_property --node-path "./World/Enemy" --property "position" --value "[100,200]"
```

## Node path conventions

- Editor scene nodes use absolute paths starting with `./`: `./World/Enemy`, `./UI/ScoreLabel`. The scene root is `"."`.
- Scripts, scenes, and resources use `res://` paths: `res://scenes/main.tscn`.
- Runtime tools (running game) use `/root/...` paths: `/root/TestMainScene/Player`.

## Workflows

### Inspect tree, inspect node, edit, validate

1. See the hierarchy:

   ```bash
   godot-mcp get_editor_scene_structure --include-scripts true
   ```

2. Read one node's properties:

   ```bash
   godot-mcp get_node_properties --node-path "./Player"
   ```

3. Edit a property or transform:

   ```bash
   godot-mcp update_node_property --node-path "./Player" --property "modulate" --value "[1,0,0,1]"
   godot-mcp update_node_transform --node-path "./Player" --position "[512,256]" --rotation 0.5 --scale "[2,2]"
   ```

4. Validate the scene and check configuration warnings:

   ```bash
   godot-mcp validate_scene --scene-path "res://scenes/main.tscn"
   godot-mcp get_node_warnings
   ```

### Build a new scene from scratch

```bash
godot-mcp create_scene --path "res://scenes/shop.tscn" --root-node-type "Control"
godot-mcp open_scene --path "res://scenes/shop.tscn"
godot-mcp create_node --parent-path "." --node-type "Label" --node-name "Title"
godot-mcp update_node_property --node-path "./Title" --property "text" --value "Shop"
godot-mcp save_scene
```

### See what a scene looks like

```bash
godot-mcp capture_scene --scene-path "res://scenes/main.tscn" --width 1280 --height 720
```

Capture returns a PNG image plus a text summary. Without `--scene-path`, the scene open in the editor is captured. By default Godot writes the PNG to `user://mcp_captures/` and the server reads it back; pass `--return-base64 true` only when the image must travel over the WebSocket. Captures above 4,000,000 pixels are refused unless `--allow-large true`.

## Advanced features

- `get_current_scene`: summary of the active scene. `get_project_info`: project metadata plus current scene path.
- `delete_node --node-path "./World/Enemy"`: remove a node. `delete_scene --path "res://scenes/old.tscn"`: remove a scene file.
- `save_scene --path "res://scenes/level_02.tscn"`: save the current scene under a new path.
- `create_resource --resource-type "StyleBoxFlat" --resource-path "res://ui/button_style.tres" --properties '{"bg_color":"#2f6fff"}'`: create reusable resources (styles, materials, curves).
- `validate_scene` issues use severity/category/message with categories `load`, `instantiate`, `duplicate_name`, `missing_resource`, and `cyclic_dependency`. Pass `--check-instantiate false` to skip the slower tree-build check.
- `list_nodes --parent-path "./UI"`: list direct children only.
- Multi-step edits (up to 25 tool calls in order): `batch_operations` with `--operations '[{"tool":"create_node","arguments":{...}}]'`. `--dry-run` validates schemas only; execution is non-atomic with no rollback — any failed or invalid operation fails the call with the embedded report.
