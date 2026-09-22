@tool
class_name MCPProjectCommands
extends MCPBaseCommandProcessor

const DEFAULT_PAGE_LIMIT := 200
const MAX_PAGE_LIMIT := 1000
const MAX_SCAN_ENTRIES := 100000

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"get_project_info":
			_get_project_info(client_id, params, command_id)
			return true
		"list_project_files":
			_list_project_files(client_id, params, command_id)
			return true
		"get_project_structure":
			_get_project_structure(client_id, params, command_id)
			return true
		"get_project_settings":
			_get_project_settings(client_id, params, command_id)
			return true
		"list_project_resources":
			_list_project_resources(client_id, params, command_id)
			return true
		"run_project":
			_run_project(client_id, params, command_id)
			return true
		"stop_running_project":
			_stop_running_project(client_id, params, command_id)
			return true
		"run_current_scene":
			_run_current_scene(client_id, params, command_id)
			return true
		"run_specific_scene":
			_run_specific_scene(client_id, params, command_id)
			return true
		"generate_project_guidance":
			_generate_project_guidance(client_id, params, command_id)
			return true
	return false  # Command not handled

# Walks the project tree in DFS order (directories are reported before recursing).
# options:
#   "skip_dirs":    Array[String] of directory names to skip entirely (default []).
#   "extensions":   Array[String]; when non-empty, only files whose NAME ends with one
#                   of these extensions are reported (empty = all files).
#   "include_dirs": bool; when true, directories are reported too.
#   "max_entries":  int; stop the whole walk once a further matching file appears
#                   after this many counted files (0 = uncapped). The shared scan
#                   counter is stored back into options["scan_counter"] so callers
#                   can read "truncated" after the walk returns.
# on_entry.call(entry_path, file_name, is_dir, extension) where entry_path is the full
# "res://..." path ("res://dir/" for directories) and extension excludes the dot.
# Returns false when dir_path could not be opened; failed subdirectory opens are skipped.
func _walk_project_tree(dir_path: String, on_entry: Callable, options: Dictionary) -> bool:
	var dir = DirAccess.open(dir_path)
	if not dir:
		return false

	var skip_dirs: Array = options.get("skip_dirs", [])
	var extensions: Array = options.get("extensions", [])
	var include_dirs: bool = options.get("include_dirs", false)
	var max_entries: int = int(options.get("max_entries", 0))
	var scan_counter: Dictionary = {}
	if max_entries > 0:
		# Shared across recursion (same options dictionary) and readable by the
		# caller after the top-level walk returns.
		scan_counter = options.get("scan_counter", {})
		if scan_counter.is_empty():
			scan_counter = { "count": 0, "truncated": false }
			options["scan_counter"] = scan_counter

	dir.list_dir_begin()
	var file_name = dir.get_next()

	while file_name != "":
		if max_entries > 0 and bool(scan_counter.get("truncated", false)):
			break
		if dir.current_is_dir():
			if file_name in skip_dirs:
				file_name = dir.get_next()
				continue
			if include_dirs:
				on_entry.call(dir_path + file_name + "/", file_name, true, "")
			_walk_project_tree(dir_path + file_name + "/", on_entry, options)
		else:
			var has_valid_extension = extensions.is_empty()
			for ext in extensions:
				if file_name.ends_with(ext):
					has_valid_extension = true
					break
			if has_valid_extension:
				if max_entries > 0:
					if int(scan_counter.get("count", 0)) >= max_entries:
						# Cap reached and another matching file exists: stop the
						# walk entirely (not just this appending) and surface it.
						scan_counter["truncated"] = true
						break
					scan_counter["count"] = int(scan_counter.get("count", 0)) + 1
				on_entry.call(dir_path + file_name, file_name, false, file_name.get_extension())

		file_name = dir.get_next()

	dir.list_dir_end()
	return true

func _get_project_info(client_id: int, _params: Dictionary, command_id: String) -> void:
	var project_name = ProjectSettings.get_setting("application/config/name", "Untitled Project")
	var project_version = ProjectSettings.get_setting("application/config/version", "1.0.0")
	var project_path = ProjectSettings.globalize_path("res://")
	
	# Get Godot version info and structure it as expected by the server
	var version_info = Engine.get_version_info()
	print("Raw Godot version info: ", version_info)
	
	# Create structured version object with the expected properties
	var structured_version = {
		"major": version_info.get("major", 0),
		"minor": version_info.get("minor", 0),
		"patch": version_info.get("patch", 0)
	}
	
	_send_success(client_id, {
		"project_name": project_name,
		"project_version": project_version,
		"project_path": project_path,
		"godot_version": structured_version,
		"current_scene": get_tree().edited_scene_root.scene_file_path if get_tree().edited_scene_root else ""
	}, command_id)

func _list_project_files(client_id: int, params: Dictionary, command_id: String) -> void:
	var extensions = params.get("extensions", [])
	var files = []
	var walk_options = {"extensions": extensions, "max_entries": MAX_SCAN_ENTRIES}
	if not _walk_project_tree("res://", _on_project_file_entry.bind(files), walk_options):
		return _send_error(client_id, "Failed to open res:// directory", command_id)
	files.sort()
	var scan_truncated = bool(walk_options.get("scan_counter", {}).get("truncated", false))
	var page := _page_entries(files, params, scan_truncated)
	_send_success(client_id, page, command_id)

func _on_project_file_entry(entry_path: String, _file_name: String, _is_dir: bool, _extension: String, files: Array) -> void:
	if files.size() < MAX_SCAN_ENTRIES:
		files.append(entry_path)

func _page_entries(entries: Array, params: Dictionary, scan_truncated: bool = false) -> Dictionary:
	var offset := max(0, int(params.get("offset", 0)))
	var limit := clamp(int(params.get("limit", DEFAULT_PAGE_LIMIT)), 1, MAX_PAGE_LIMIT)
	var end := min(offset + limit, entries.size())
	var page: Array = entries.slice(offset, end)
	return {
		"files": page,
		"offset": offset,
		"limit": limit,
		"returned_count": page.size(),
		"total_count": entries.size(),
		"truncated": end < entries.size(),
		"scan_truncated": scan_truncated,
		"next_offset": end if end < entries.size() else null
	}

func _get_project_structure(client_id: int, params: Dictionary, command_id: String) -> void:
	var structure = {
		"directories": [],
		"file_counts": {},
		"total_files": 0
	}
	
	if not _walk_project_tree("res://", _on_structure_entry.bind(structure), {"include_dirs": true}):
		return _send_error(client_id, "Failed to open res:// directory", command_id)
	
	_send_success(client_id, structure, command_id)

func _on_structure_entry(entry_path: String, _file_name: String, is_dir: bool, extension: String, structure: Dictionary) -> void:
	if is_dir:
		structure["directories"].append(entry_path)
	else:
		structure["total_files"] += 1
		if extension in structure["file_counts"]:
			structure["file_counts"][extension] += 1
		else:
			structure["file_counts"][extension] = 1

func _get_project_settings(client_id: int, params: Dictionary, command_id: String) -> void:
	# Get relevant project settings
	var settings = {
		"project_name": ProjectSettings.get_setting("application/config/name", "Untitled Project"),
		"project_version": ProjectSettings.get_setting("application/config/version", "1.0.0"),
		"display": {
			"width": ProjectSettings.get_setting("display/window/size/viewport_width", 1024),
			"height": ProjectSettings.get_setting("display/window/size/viewport_height", 600),
			"mode": ProjectSettings.get_setting("display/window/size/mode", 0),
			"resizable": ProjectSettings.get_setting("display/window/size/resizable", true)
		},
		"physics": {
			"2d": {
				"default_gravity": ProjectSettings.get_setting("physics/2d/default_gravity", 980)
			},
			"3d": {
				"default_gravity": ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
			}
		},
		"rendering": {
			"quality": {
				"msaa": ProjectSettings.get_setting("rendering/anti_aliasing/quality/msaa_2d", 0)
			}
		},
		"input_map": {}
	}
	
	# Get input mappings
	var input_map = ProjectSettings.get_setting("input")
	if input_map:
		settings["input_map"] = input_map
	
	_send_success(client_id, settings, command_id)

func _list_project_resources(client_id: int, params: Dictionary, command_id: String) -> void:
	var resources = {
		"scenes": [],
		"scripts": [],
		"textures": [],
		"audio": [],
		"models": [],
		"resources": []
	}
	
	if not _walk_project_tree("res://", _on_resource_entry.bind(resources), {}):
		return _send_error(client_id, "Failed to open res:// directory", command_id)
	
	# Resources are grouped for compatibility; each group is independently
	# paged to avoid returning an unbounded inventory in one response.
	var offset := max(0, int(params.get("offset", 0)))
	var limit := clamp(int(params.get("limit", DEFAULT_PAGE_LIMIT)), 1, MAX_PAGE_LIMIT)
	var paging := {}
	for category in resources.keys():
		var entries: Array = resources[category]
		entries.sort()
		var end := min(offset + limit, entries.size())
		resources[category] = entries.slice(offset, end)
		paging[category] = {"offset": offset, "limit": limit, "returned_count": resources[category].size(), "total_count": entries.size(), "truncated": end < entries.size(), "next_offset": end if end < entries.size() else null}
	resources["pagination"] = paging
	_send_success(client_id, resources, command_id)

func _on_resource_entry(entry_path: String, file_name: String, _is_dir: bool, _extension: String, resources: Dictionary) -> void:
	# Categorize by extension
	if file_name.ends_with(".tscn") or file_name.ends_with(".scn"):
		resources["scenes"].append(entry_path)
	elif file_name.ends_with(".gd") or file_name.ends_with(".cs"):
		resources["scripts"].append(entry_path)
	elif file_name.ends_with(".png") or file_name.ends_with(".jpg") or file_name.ends_with(".jpeg"):
		resources["textures"].append(entry_path)
	elif file_name.ends_with(".wav") or file_name.ends_with(".ogg") or file_name.ends_with(".mp3"):
		resources["audio"].append(entry_path)
	elif file_name.ends_with(".obj") or file_name.ends_with(".glb") or file_name.ends_with(".gltf"):
		resources["models"].append(entry_path)
	elif file_name.ends_with(".tres") or file_name.ends_with(".res"):
		resources["resources"].append(entry_path)

func _run_project(client_id: int, _params: Dictionary, command_id: String) -> void:
	var editor_interface = _get_editor_interface()
	if not editor_interface:
		return _send_error(client_id, "Editor interface not available", command_id)
	
	var main_scene: String = ProjectSettings.get_setting("application/run/main_scene", "")
	if main_scene.is_empty():
		return _send_error(client_id, "No main scene configured in project settings", command_id)
	
	editor_interface.play_main_scene()
	_send_success(client_id, {
		"status": "running",
		"scene_path": main_scene
	}, command_id)

func _stop_running_project(client_id: int, _params: Dictionary, command_id: String) -> void:
	var editor_interface = _get_editor_interface()
	if not editor_interface:
		return _send_error(client_id, "Editor interface not available", command_id)
	
	if not editor_interface.is_playing_scene():
		return _send_success(client_id, {
			"status": "idle",
			"message": "Editor is not currently running a scene"
		}, command_id)
	
	editor_interface.stop_playing_scene()
	_send_success(client_id, {
		"status": "stopped"
	}, command_id)

func _run_current_scene(client_id: int, _params: Dictionary, command_id: String) -> void:
	var editor_interface = _get_editor_interface()
	if not editor_interface:
		return _send_error(client_id, "Editor interface not available", command_id)
	
	var scene_root = editor_interface.get_edited_scene_root()
	if not scene_root:
		return _send_error(client_id, "No scene is currently open in the editor", command_id)
	
	var scene_path: String = scene_root.scene_file_path
	if scene_path.is_empty():
		return _send_error(client_id, "Current scene must be saved before it can be run", command_id)
	
	editor_interface.play_current_scene()
	_send_success(client_id, {
		"status": "running",
		"scene_path": scene_path
	}, command_id)

func _run_specific_scene(client_id: int, params: Dictionary, command_id: String) -> void:
	var editor_interface = _get_editor_interface()
	if not editor_interface:
		return _send_error(client_id, "Editor interface not available", command_id)
	
	var scene_path: String = params.get("scene_path", "")
	if scene_path.is_empty():
		return _send_error(client_id, "scene_path parameter is required", command_id)
	
	if not ResourceLoader.exists(scene_path):
		return _send_error(client_id, "Scene does not exist: %s" % scene_path, command_id)
	
	editor_interface.play_custom_scene(scene_path)
	_send_success(client_id, {
		"status": "running",
		"scene_path": scene_path
	}, command_id)

func _get_editor_interface():
	if not Engine.has_meta("GodotMCPPlugin"):
		return null
	
	var plugin = Engine.get_meta("GodotMCPPlugin") as EditorPlugin
	if not plugin:
		return null
	
	return plugin.get_editor_interface()

func _generate_project_guidance(client_id: int, params: Dictionary, command_id: String) -> void:
	var include_agents_md: bool = (params.get("include_agents_md", false) == true)
	var force: bool = (params.get("force", false) == true)

	# Gather project facts
	var project_name: String = ProjectSettings.get_setting("application/config/name", "Untitled Project")
	var main_scene: String = ProjectSettings.get_setting("application/run/main_scene", "")
	var features = ProjectSettings.get_setting("application/config/features", [])
	if features.is_empty():
		features = ProjectSettings.get_setting("features", [])
	var renderer: String = ProjectSettings.get_setting("rendering/renderer/rendering_method", "")
	var version_info: Dictionary = Engine.get_version_info()
	var godot_version: String = str(version_info.get("string", ""))

	var autoloads: Array = _collect_autoloads()
	var input_actions: Array = _collect_input_actions()
	var inventory: Dictionary = _collect_scene_inventory(autoloads)
	var scenes: Array = inventory["scenes"]
	var key_scripts: Array = inventory["key_scripts"]

	# Write the full project guide first
	var guide_path: String = "res://addons/godot_mcp/ai/project_guide.md"
	var ai_dir: String = ProjectSettings.globalize_path("res://addons/godot_mcp/ai")
	if not DirAccess.dir_exists_absolute(ai_dir):
		var dir_error = DirAccess.make_dir_recursive_absolute(ai_dir)
		if dir_error != OK:
			return _send_error(client_id, "Failed to create guide directory: %s (Error code: %d)" % [ai_dir, dir_error], command_id)

	var guide_content: String = _build_project_guide(project_name, main_scene, godot_version, features, renderer, autoloads, input_actions, scenes, key_scripts)
	var guide_write_error = _write_text_file(guide_path, guide_content)
	if guide_write_error != OK:
		return _send_error(client_id, "Failed to write project guide file: %s (Error code: %d)" % [guide_path, guide_write_error], command_id)

	var written_paths: Array = [guide_path]
	var agents_md_path: String = "res://AGENTS.md"
	var action: String = "skipped"

	if include_agents_md:
		var agents_content: String = ""
		var agents_action: String = "created"

		if FileAccess.file_exists(agents_md_path):
			if force:
				agents_action = "replaced"
				agents_content = _build_agents_md(project_name, guide_path, autoloads, input_actions, scenes)
			else:
				# Safety: never clobber an existing AGENTS.md unless force is requested
				agents_action = "appended"
				var existing_file = FileAccess.open(agents_md_path, FileAccess.READ)
				if existing_file:
					agents_content = existing_file.get_as_text()
					existing_file = null  # Close the file
				agents_content += "\n\n" + _build_agents_guide_body(project_name, guide_path, autoloads, input_actions, scenes)
		else:
			agents_content = _build_agents_md(project_name, guide_path, autoloads, input_actions, scenes)

		var agents_write_error = _write_text_file(agents_md_path, agents_content)
		if agents_write_error != OK:
			return _send_error(client_id, "Failed to write AGENTS.md file: %s (Error code: %d)" % [agents_md_path, agents_write_error], command_id)

		written_paths.append(agents_md_path)
		action = agents_action

	_send_success(client_id, {
		"written_paths": written_paths,
		"scene_count": scenes.size(),
		"autoload_count": autoloads.size(),
		"input_action_count": input_actions.size(),
		"guide_path": guide_path,
		"agents_md_path": agents_md_path if include_agents_md else "",
		"action": action
	}, command_id)

func _collect_autoloads() -> Array:
	var autoloads: Array = []
	var property_list: Array = ProjectSettings.get_property_list()
	for property in property_list:
		var property_name: String = str(property.get("name", ""))
		if not property_name.begins_with("autoload/"):
			continue
		var autoload_name: String = property_name.substr("autoload/".length())
		var autoload_value: String = str(ProjectSettings.get_setting(property_name, ""))
		if autoload_value.begins_with("*"):
			autoload_value = autoload_value.substr(1)
		autoloads.append({
			"name": autoload_name,
			"path": autoload_value
		})
	return autoloads

func _collect_input_actions() -> Array:
	var actions: Array = []
	var property_list: Array = ProjectSettings.get_property_list()
	for property in property_list:
		var property_name: String = str(property.get("name", ""))
		if not property_name.begins_with("input/"):
			continue
		var action_name: String = property_name.substr("input/".length())
		if action_name.is_empty() or action_name.begins_with("ui_"):
			continue
		actions.append(action_name)
	actions.sort()
	return actions

func _collect_scene_inventory(autoloads: Array) -> Dictionary:
	var scenes: Array = []
	var key_scripts: Array = []
	var autoload_script_paths: Array = []
	for autoload in autoloads:
		autoload_script_paths.append(autoload["path"])

	_walk_project_tree("res://", _on_guidance_entry.bind(scenes, key_scripts, autoload_script_paths), {"skip_dirs": ["addons", ".godot", ".git"]})

	return {
		"scenes": scenes,
		"key_scripts": key_scripts
	}

func _on_guidance_entry(entry_path: String, file_name: String, _is_dir: bool, _extension: String, scenes: Array, key_scripts: Array, autoload_script_paths: Array) -> void:
	if file_name.ends_with(".tscn") or file_name.ends_with(".scn"):
		scenes.append(entry_path)
	elif file_name.ends_with(".gd"):
		if autoload_script_paths.has(entry_path) or _is_key_script(entry_path):
			key_scripts.append(entry_path)
	elif file_name.ends_with(".cs"):
		key_scripts.append(entry_path)

func _is_key_script(path: String) -> bool:
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		return false
	var head: String = file.get_buffer(8192).get_string_from_utf8()
	file = null  # Close the file
	return head.contains("class_name ") or head.contains("@tool")

func _write_text_file(path: String, content: String) -> int:
	var file = FileAccess.open(path, FileAccess.WRITE)
	if not file:
		return FileAccess.get_open_error()
	file.store_string(content)
	file = null  # Close the file
	return OK

func _build_project_guide(project_name: String, main_scene: String, godot_version: String, features, renderer: String, autoloads: Array, input_actions: Array, scenes: Array, key_scripts: Array) -> String:
	var lines: Array = []
	lines.append("# Project Guide: %s" % project_name)
	lines.append("")
	lines.append("Auto-generated by the Godot MCP `generate_project_guidance` command. Regenerate this file whenever the project structure changes.")
	lines.append("")
	lines.append("## Project Overview")
	lines.append("")
	lines.append("- **Application name:** %s" % project_name)
	lines.append("- **Main scene:** %s" % (main_scene if not main_scene.is_empty() else "Not configured"))
	lines.append("- **Godot version:** %s" % godot_version)
	lines.append("- **Renderer:** %s" % (renderer if not renderer.is_empty() else "Not configured"))
	lines.append("- **Feature tags:** %s" % (", ".join(features) if features.size() > 0 else "None"))
	lines.append("")
	lines.append("## Autoloads")
	lines.append("")
	if autoloads.is_empty():
		lines.append("No autoloads configured.")
	else:
		lines.append("| Name | Path |")
		lines.append("| --- | --- |")
		for autoload in autoloads:
			lines.append("| %s | %s |" % [autoload["name"], autoload["path"]])
	lines.append("")
	lines.append("## Input Actions")
	lines.append("")
	if input_actions.is_empty():
		lines.append("No custom input actions defined (built-in ui_ actions are available but not listed).")
	else:
		for action_name in input_actions:
			lines.append("- %s" % action_name)
	lines.append("")
	lines.append("## Scenes")
	lines.append("")
	if scenes.is_empty():
		lines.append("No scenes found in the project.")
	else:
		for scene_path in scenes:
			lines.append("- %s" % scene_path)
	lines.append("")
	lines.append("## Key Scripts")
	lines.append("")
	lines.append("Scripts that are globally referenced (class_name, @tool, autoload) or written in C#.")
	lines.append("")
	if key_scripts.is_empty():
		lines.append("No key scripts found.")
	else:
		for script_path in key_scripts:
			lines.append("- %s" % script_path)
	lines.append("")
	lines.append("## Notes for AI Agents")
	lines.append("")
	lines.append("- Do not guess the project structure. Read this guide and the referenced files before creating, moving, or editing scenes and scripts.")
	lines.append("- The main scene is `%s`. Run it to see the application entry point." % (main_scene if not main_scene.is_empty() else "not configured"))
	lines.append("- Autoloads are loaded globally at startup; reference them by name instead of instancing them.")
	lines.append("- Only project-defined input actions are listed; built-in ui_ actions are still available.")
	lines.append("- Prefer loading scenes with ResourceLoader and instancing them with `instantiate()`.")
	lines.append("- Follow the project code style: descriptive names, no emoji, and Python-style conditional expressions in GDScript (no C-style ternary).")
	lines.append("- Regenerate this guide with the `generate_project_guidance` command after significant project changes.")
	return "\n".join(lines) + "\n"

func _build_agents_guide_body(project_name: String, guide_path: String, autoloads: Array, input_actions: Array, scenes: Array) -> String:
	var relative_guide: String = guide_path.trim_prefix("res://")
	var lines: Array = []
	lines.append("## Godot MCP Project Guide (auto-generated)")
	lines.append("")
	lines.append("This section is maintained by the Godot MCP `generate_project_guidance` command. Do not edit it by hand; regenerate it to refresh the contents.")
	lines.append("")
	lines.append("Read the full project guide at [%s](%s)." % [relative_guide, relative_guide])
	lines.append("")
	lines.append("### Project Summary")
	lines.append("")
	lines.append("- **Application:** %s" % project_name)
	lines.append("- **Scene count:** %d" % scenes.size())
	lines.append("- **Autoload count:** %d" % autoloads.size())
	lines.append("- **Input action count:** %d" % input_actions.size())
	lines.append("")
	lines.append("### Notes for AI Agents")
	lines.append("")
	lines.append("- Read the full project guide before guessing at the project structure.")
	lines.append("- Autoloads are available globally; reference them by name.")
	lines.append("- Regenerate this guidance with the `generate_project_guidance` command when the project changes.")
	return "\n".join(lines)

func _build_agents_md(project_name: String, guide_path: String, autoloads: Array, input_actions: Array, scenes: Array) -> String:
	var lines: Array = []
	lines.append("# %s" % project_name)
	lines.append("")
	lines.append("> Project guidance auto-generated by the Godot MCP `generate_project_guidance` command.")
	lines.append("")
	lines.append(_build_agents_guide_body(project_name, guide_path, autoloads, input_actions, scenes))
	return "\n".join(lines) + "\n"
