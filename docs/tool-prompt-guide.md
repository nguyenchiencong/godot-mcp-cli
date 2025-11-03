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
| `create_resource` | Create a Godot resource file with preset properties. | `resource_type` (string), `resource_path` (string), `properties` (optional dict) | “Create a `StyleBoxFlat` at `res://ui/button_style.tres` with `bg_color` set to `#2f6fff`.” |

---

## Editor Tools

| Tool | Purpose | Parameters | Example Prompt |
|------|---------|------------|----------------|
| `execute_editor_script` | Run arbitrary GDScript inside the editor context. | `code` (string) | “Find all nodes in the `Enemies` group and print their names.” |

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
| `update_node_transform` | Adjust a node's transform (position/rotation/scale). | `node_path` (string), `position` (optional array), `rotation` (optional number), `scale` (optional array) | "Move `./Camera` to `[512, 256]` and set rotation to `0.5`." |
| `stream_debug_output` | Start (`action="start"`) or stop (`"stop"`) live streaming of the editor Output panel (lines arrive as `[Godot Debug] ...`). | `action` (optional string, `"start"` or `"stop"`) | "Subscribe to the debug stream so new Output lines appear live; I'll stop it afterwards." |

---

### Tips for Prompting

- Always specify absolute node paths (e.g. `./Player`) when referring to scene nodes.
- Use resource templates (`godot://script/{path}`, `godot://assets/{type}`) for read-only data; use commands (e.g., `edit_script`) for writes.
- Combine tool calls in natural language:
  > “List image assets, pick one, then attach it to `./UI/Logo` by editing the UI script accordingly.”

Keep this guide handy while constructing system or user prompts so the LLM knows exactly which tools are available and how to use them. 
