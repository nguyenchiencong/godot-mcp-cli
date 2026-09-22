---
name: godot-scripting
description: Create, read, and edit GDScript files and shaders through the godot-mcp CLI, including parse diagnostics, editor-context script execution, and project guidance generation. Use when writing or fixing GDScript or .gdshader files, checking parse errors, running GDScript inside the editor, or generating AI project guidance.
---

# Godot Scripting

## Quick start

Create a script, then read it back:

```bash
godot-mcp create_script --script-path "res://scripts/player.gd" --content "extends CharacterBody2D"
godot-mcp get_script --script-path "res://scripts/player.gd"
```

`create_script` and `edit_script` return parse diagnostics automatically (a `diagnostics` field with one entry per error, each carrying `line` and `message`). Pass `--diagnostics false` to skip the diagnostics run for faster writes.

## GDScript style rules

- Never use the C-style ternary `cond ? a : b`; it is a parse error in GDScript. Use the Python-style form `a if cond else b`.
- No emoji anywhere (code, comments, docs).
- Descriptive names, small focused functions, early returns over deep nesting.

## Workflows

### Edit an existing script

```bash
godot-mcp get_script --script-path "res://scripts/player.gd"
godot-mcp edit_script --script-path "res://scripts/player.gd" --content "<new source>"
```

### Check parse errors explicitly

```bash
godot-mcp get_script_diagnostics --script-path "res://scripts/player.gd"
```

Returns `{exists, valid, error_count, errors[]}`; `valid` is true when the script parses cleanly.

### Author a shader

```bash
godot-mcp create_shader --script-path "res://shaders/outline.gdshader" --shader-type "canvas_item"
godot-mcp edit_shader --script-path "res://shaders/outline.gdshader" --content "<shader source>"
godot-mcp shader_get_compile_errors --script-path "res://shaders/outline.gdshader" --wait-ms 500
```

Shader authoring writes return editor compile diagnostics; `shader_get_compile_errors` re-reads errors retained by the editor logger.

### Run arbitrary GDScript in the editor

```bash
godot-mcp execute_editor_script --code "print(get_tree().current_scene.name)" --allow-unsafe true
```

Useful for batch operations the dedicated tools do not cover (groups, signals, project settings). This is explicitly unsafe: code runs on the editor main thread with project filesystem access, and a response deadline cannot preempt a blocked script.

### Read scripts as MCP resources

- `godot://script/{path}`: script content.
- `godot://script/{path}/metadata`: script metadata (class, extends, dependencies).

Use resources for read-only access; use `edit_script` / `create_script` for writes.

## Advanced features

### Runtime shader debugging

Runtime shader tools (uniform reads and tweaks, snapshots, hot reload, frame capture, debug-draw overlays) require the game running with F5; the live shader debugging loop lives in [godot-shader-debugging](../godot-shader-debugging/SKILL.md).

### Project guidance

```bash
godot-mcp generate_project_guidance --include-agents-md true
```

Scans the project and writes `res://addons/godot_mcp/ai/project_guide.md` (and `res://AGENTS.md` when requested; an existing AGENTS.md is never overwritten unless `--force true`).
