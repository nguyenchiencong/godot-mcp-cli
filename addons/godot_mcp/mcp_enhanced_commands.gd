@tool
class_name MCPEnhancedCommands
extends MCPBaseCommandProcessor

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"get_editor_scene_structure":
			_handle_get_editor_scene_structure(client_id, params, command_id)
			return true
		"get_runtime_scene_structure":
			_handle_get_runtime_scene_structure(client_id, params, command_id)
			return true
		"get_debug_output":
			_handle_get_debug_output(client_id, params, command_id)
			return true
		"update_node_transform":
			_handle_update_node_transform(client_id, params, command_id)
			return true
	
	# Command not handled by this processor
	return false

# Helper function to get EditorInterface
func _get_editor_interface():
	var plugin_instance = Engine.get_meta("GodotMCPPlugin") as EditorPlugin
	if plugin_instance:
		return plugin_instance.get_editor_interface()
	return null

func _get_runtime_bridge() -> MCPRuntimeDebuggerBridge:
	if Engine.has_meta("MCPRuntimeDebuggerBridge"):
		return Engine.get_meta("MCPRuntimeDebuggerBridge") as MCPRuntimeDebuggerBridge
	return null

# ---- Scene Structure Commands ----

func _handle_get_editor_scene_structure(client_id: int, params: Dictionary, command_id: String) -> void:
	var options = _build_scene_options(params, false, false)
	var result = _build_scene_structure_result(options)
	_send_success(client_id, result, command_id)

func _handle_get_runtime_scene_structure(client_id: int, params: Dictionary, command_id: String) -> void:
	var runtime_bridge := _get_runtime_bridge()
	if runtime_bridge == null:
		_send_success(client_id, { "error": "Runtime debugger bridge not available. Ensure the project is running." }, command_id)
		return
	
	var options = _build_scene_options(params, false, false)
	var timeout_ms = params.get("timeout_ms", MCPRuntimeDebuggerBridge.DEFAULT_TIMEOUT_MS)
	timeout_ms = int(timeout_ms)
	if timeout_ms < 100:
		timeout_ms = 100
	elif timeout_ms > 5000:
		timeout_ms = 5000
	
	var request_info = runtime_bridge.request_runtime_scene_snapshot()
	if request_info.has("error"):
		_send_success(client_id, request_info, command_id)
		return

	var session_id: int = request_info.get("session_id", -1)
	var baseline_version: int = request_info.get("baseline_version", 0)
	var scene_tree := get_tree()
	if scene_tree == null:
		_send_success(client_id, { "error": "Scene tree unavailable for runtime polling." }, command_id)
		return

	var deadline: int = Time.get_ticks_msec() + timeout_ms
	var snapshot: Dictionary = {}

	while Time.get_ticks_msec() <= deadline:
		if runtime_bridge.has_new_runtime_snapshot(session_id, baseline_version):
			snapshot = runtime_bridge.build_runtime_snapshot(session_id, options)
			if not snapshot.is_empty():
				break
		
		await scene_tree.process_frame

	if snapshot.is_empty():
		snapshot = {
			"error": "Timed out waiting for runtime scene data.",
			"hint": "Ensure the remote debugger supports scene tree capture; try opening the Remote Scene tab in Godot or enabling EngineDebugger.set_capture('scene', true) inside the running project."
		}

	_send_success(client_id, snapshot, command_id)

func _build_scene_structure_result(options: Dictionary) -> Dictionary:
	var editor_interface = _get_editor_interface()
	if not editor_interface:
		return { "error": "Could not access EditorInterface" }
	
	var root = editor_interface.get_edited_scene_root()
	if not root:
		return { "error": "No scene is currently being edited" }
	
	var scene_path = ""
	
	if "scene_file_path" in root:
		scene_path = root.scene_file_path
		if typeof(scene_path) != TYPE_STRING:
			scene_path = str(scene_path)
	
	if scene_path.is_empty():
		scene_path = "Unsaved Scene"
	
	return {
		"scene_path": scene_path,
		"path": scene_path,
		"root_node_type": root.get_class(),
		"root_node_name": root.name,
		"structure": _build_node_info(root, options, 0)
	}

func _build_scene_options(params: Dictionary, include_properties_default: bool, include_scripts_default: bool) -> Dictionary:
	var include_properties = include_properties_default
	if params.has("include_properties"):
		include_properties = _coerce_bool(params.get("include_properties"), include_properties_default)
	
	var include_scripts = include_scripts_default
	if params.has("include_scripts"):
		include_scripts = _coerce_bool(params.get("include_scripts"), include_scripts_default)
	
	var max_depth = -1
	if params.has("max_depth"):
		max_depth = int(params.get("max_depth"))
	
	return {
		"include_properties": include_properties,
		"include_scripts": include_scripts,
		"max_depth": max_depth
	}

func _coerce_bool(value, default: bool) -> bool:
	if typeof(value) == TYPE_BOOL:
		return value
	if typeof(value) == TYPE_STRING:
		var lowered = value.to_lower()
		if lowered == "true":
			return true
		if lowered == "false":
			return false
	return bool(value) if value != null else default

func _build_node_info(node: Node, options: Dictionary, depth: int) -> Dictionary:
	var info = {
		"name": node.name,
		"type": node.get_class(),
		"path": node.get_path(),
		"children": []
	}
	
	if options.get("include_properties", false):
		var properties = {}
		if node.has_method("get_property_list"):
			var props = node.get_property_list()
			for prop in props:
				if prop.usage & PROPERTY_USAGE_EDITOR and not (prop.usage & PROPERTY_USAGE_CATEGORY):
					if prop.name in ["position", "rotation", "scale", "text", "visible"]:
						properties[prop.name] = node.get(prop.name)
		if properties.size() > 0:
			info["properties"] = properties
	
	if options.get("include_scripts", false):
		var script = node.get_script()
		if script:
			var script_path = ""
			var class_name_str = ""
			
			if typeof(script) == TYPE_OBJECT:
				if script.has_method("get_path") or "resource_path" in script:
					script_path = script.resource_path if "resource_path" in script else ""
				
				if script.has_method("get_instance_base_type"):
					class_name_str = script.get_instance_base_type()
			
			info["script"] = {
				"path": script_path,
				"class_name": class_name_str
			}
	
	var max_depth = options.get("max_depth", -1)
	if max_depth >= 0 and depth >= max_depth:
		return info
	
	for child in node.get_children():
		info["children"].append(_build_node_info(child, options, depth + 1))
	
	return info

# ---- Debug Output Commands ----

func _handle_get_debug_output(client_id: int, _params: Dictionary, command_id: String) -> void:
	var result = get_debug_output()
	
	_send_success(client_id, result, command_id)

func get_debug_output() -> Dictionary:
	var output = ""
	
	# For Godot 4.x
	if Engine.has_singleton("EditorDebuggerNode"):
		var debugger = Engine.get_singleton("EditorDebuggerNode")
		if debugger and debugger.has_method("get_log"):
			output = debugger.get_log()
	# For Godot 3.x fallback
	elif has_node("/root/EditorNode/DebuggerPanel"):
		var debugger = get_node("/root/EditorNode/DebuggerPanel")
		if debugger and debugger.has_method("get_output"):
			output = debugger.get_output()
	
	return {
		"output": output
	}

# ---- Node Transform Commands ----

func _handle_update_node_transform(client_id: int, params: Dictionary, command_id: String) -> void:
	var node_path = params.get("node_path", "")
	var position = params.get("position", null)
	var rotation = params.get("rotation", null)
	var scale = params.get("scale", null)
	
	var result = update_node_transform(node_path, position, rotation, scale)
	
	_send_success(client_id, result, command_id)

func update_node_transform(node_path: String, position, rotation, scale) -> Dictionary:
	var editor_interface = _get_editor_interface()
	
	if not editor_interface:
		return { "error": "Could not access EditorInterface" }
	
	var scene_root = editor_interface.get_edited_scene_root()
	
	if not scene_root:
		return { "error": "No scene open" }
	
	var node = scene_root.get_node_or_null(node_path)
	if not node:
		return { "error": "Node not found" }
	
	# Update all specified properties
	if position != null and node.has_method("set_position"):
		if position is Array and position.size() >= 2:
			node.set_position(Vector2(position[0], position[1]))
		elif typeof(position) == TYPE_DICTIONARY and "x" in position and "y" in position:
			node.set_position(Vector2(position.x, position.y))
	
	if rotation != null and node.has_method("set_rotation"):
		node.set_rotation(rotation)
	
	if scale != null and node.has_method("set_scale"):
		if scale is Array and scale.size() >= 2:
			node.set_scale(Vector2(scale[0], scale[1]))
		elif typeof(scale) == TYPE_DICTIONARY and "x" in scale and "y" in scale:
			node.set_scale(Vector2(scale.x, scale.y))
	
	# Mark the scene as modified
	editor_interface.mark_scene_as_unsaved()
	
	return {
		"success": true,
		"node_path": node_path,
		"updated": {
			"position": position != null,
			"rotation": rotation != null,
			"scale": scale != null
		}
	}
