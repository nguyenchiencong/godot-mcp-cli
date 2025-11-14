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
		"get_editor_errors":
			_handle_get_editor_errors(client_id, params, command_id)
			return true
		"update_node_transform":
			_handle_update_node_transform(client_id, params, command_id)
			return true
		"evaluate_runtime":
			_handle_evaluate_runtime(client_id, params, command_id)
			return true
		"subscribe_debug_output":
			_handle_subscribe_debug_output(client_id, command_id)
			return true
		"unsubscribe_debug_output":
			_handle_unsubscribe_debug_output(client_id, command_id)
			return true
		"get_stack_trace_panel":
			_handle_get_stack_trace_panel(client_id, params, command_id)
			return true
		"get_stack_frames_panel":
			_handle_get_stack_frames_panel(client_id, params, command_id)
			return true
		"clear_debug_output":
			_handle_clear_debug_output(client_id, command_id)
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

func _get_debugger_bridge() -> MCPDebuggerBridge:
	if Engine.has_meta("MCPDebuggerBridge"):
		return Engine.get_meta("MCPDebuggerBridge") as MCPDebuggerBridge
	if Engine.has_meta("GodotMCPPlugin"):
		var plugin_instance = Engine.get_meta("GodotMCPPlugin")
		if plugin_instance and plugin_instance.has_method("get_debugger_bridge"):
			var bridge = plugin_instance.get_debugger_bridge()
			if bridge and bridge is MCPDebuggerBridge:
				return bridge
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

func _handle_evaluate_runtime(client_id: int, params: Dictionary, command_id: String) -> void:
	var runtime_bridge := _get_runtime_bridge()
	if runtime_bridge == null:
		_send_success(client_id, {
			"error": "Runtime debugger bridge not available. Ensure the project is running."
		}, command_id)
		return

	var expression := ""
	if params.has("expression"):
		expression = str(params.get("expression", ""))
	elif params.has("code"):
		expression = str(params.get("code", ""))

	if expression.strip_edges().is_empty():
		_send_error(client_id, "Expression cannot be empty", command_id)
		return

	var options: Dictionary = {}
	if params.has("context_path"):
		options["node_path"] = str(params.get("context_path"))
	elif params.has("node_path"):
		options["node_path"] = str(params.get("node_path"))

	if params.has("capture_prints"):
		options["capture_prints"] = _coerce_bool(params.get("capture_prints"), true)

	var timeout_ms := int(params.get("timeout_ms", MCPRuntimeDebuggerBridge.DEFAULT_EVAL_TIMEOUT_MS))
	if timeout_ms < 100:
		timeout_ms = 100
	elif timeout_ms > 5000:
		timeout_ms = 5000

	var request_info := runtime_bridge.evaluate_runtime_expression(expression, options)
	if request_info.has("error"):
		_send_success(client_id, request_info, command_id)
		return

	var session_id: int = request_info.get("session_id", -1)
	var request_id: int = request_info.get("request_id", -1)
	if session_id < 0 or request_id < 0:
		_send_success(client_id, { "error": "Failed to enqueue runtime evaluation request." }, command_id)
		return

	var scene_tree := get_tree()
	if scene_tree == null:
		_send_success(client_id, { "error": "Scene tree unavailable while waiting for runtime evaluation." }, command_id)
		return

	var deadline: int = Time.get_ticks_msec() + timeout_ms
	var response: Dictionary = {}

	while Time.get_ticks_msec() <= deadline:
		if runtime_bridge.has_eval_result(session_id, request_id):
			response = runtime_bridge.take_eval_result(session_id, request_id)
			break
		await scene_tree.process_frame

	if response.is_empty():
		response = {
			"error": "Timed out waiting for runtime evaluation result.",
			"hint": "Ensure the running project registers the mcp_eval debugger capture via EngineDebugger.register_message_capture."
		}
	elif not response.get("success", true) and not response.has("error"):
		response["error"] = "Runtime evaluation failed."

	_send_success(client_id, response, command_id)

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

func _handle_get_editor_errors(client_id: int, _params: Dictionary, command_id: String) -> void:
	var snapshot := _capture_editor_errors_snapshot()
	var diagnostics := snapshot.get("diagnostics", {})
	if diagnostics.has("error"):
		_send_error(client_id, "Failed to read Errors tab: %s" % diagnostics["error"], command_id)
		return
	_send_success(client_id, snapshot, command_id)

func get_debug_output() -> Dictionary:
	var output := ""
	var publisher := _get_debug_output_publisher()
	var diagnostics: Dictionary = {}
	if publisher:
		output = publisher.get_full_log_text()

		if publisher.has_method("get_capture_diagnostics"):
			diagnostics = publisher.get_capture_diagnostics()
	else:
		# Fallback to remote debugger log if publisher unavailable.
		var source := "none"
		var detail := ""
		if Engine.has_singleton("EditorDebuggerNode"):
			var debugger = Engine.get_singleton("EditorDebuggerNode")
			if debugger and debugger.has_method("get_log"):
				output = debugger.get_log()
				source = "debugger_singleton"
				detail = "len=%d" % output.length()
		elif has_node("/root/EditorNode/DebuggerPanel"):
			var debugger_panel = get_node("/root/EditorNode/DebuggerPanel")
			if debugger_panel and debugger_panel.has_method("get_output"):
				output = debugger_panel.get_output()
				source = "debugger_panel"
				detail = "len=%d" % output.length()

		diagnostics = {
			"source": source,
			"detail": detail,
			"timestamp": Time.get_ticks_msec()
		}
	
	return {
		"output": output,
		"diagnostics": diagnostics
	}

func _handle_subscribe_debug_output(client_id: int, command_id: String) -> void:
	var publisher := _get_debug_output_publisher()
	if publisher == null:
		_send_error(client_id, "Debug output publisher unavailable.", command_id)
		return

	publisher.subscribe(client_id)
	_send_success(client_id, {
		"subscribed": true,
		"message": "Live debug output streaming enabled. Future log frames will be delivered asynchronously."
	}, command_id)

func _handle_unsubscribe_debug_output(client_id: int, command_id: String) -> void:
	var publisher := _get_debug_output_publisher()
	if publisher == null:
		_send_error(client_id, "Debug output publisher unavailable.", command_id)
		return

	publisher.unsubscribe(client_id)
	_send_success(client_id, {
		"subscribed": false,
		"message": "Live debug output streaming disabled for this client."
	}, command_id)

func _handle_get_stack_trace_panel(client_id: int, params: Dictionary, command_id: String) -> void:
	var publisher := _get_debug_output_publisher()
	var snapshot: Dictionary = {
		"text": "",
		"lines": [],
		"line_count": 0,
		"frames": [],
		"diagnostics": {
			"error": "debug_output_publisher_unavailable",
			"timestamp": Time.get_ticks_msec()
		}
	}

	if publisher and publisher.has_method("get_stack_trace_snapshot"):
		var snapshot_session := int(params.get("session_id", -1))
		snapshot = publisher.get_stack_trace_snapshot(snapshot_session)

	var snapshot_diagnostics := snapshot.get("diagnostics", {})
	if typeof(snapshot_diagnostics) != TYPE_DICTIONARY:
		snapshot_diagnostics = {}
		snapshot["diagnostics"] = snapshot_diagnostics

	var debugger_state := {}
	var requested_session := int(params.get("session_id", -1))
	var resolved_session_id := requested_session
	var debugger_error := ""
	var debugger_bridge := _get_debugger_bridge()

	if debugger_bridge:
		debugger_state = debugger_bridge.get_current_state()
		var active_sessions := debugger_state.get("active_sessions", [])
		if resolved_session_id < 0 and active_sessions is Array and not active_sessions.is_empty():
			resolved_session_id = debugger_state.get("current_session_id", -1)
			if resolved_session_id < 0:
				resolved_session_id = active_sessions[0]
		if resolved_session_id >= 0:
			var frames := []
			if snapshot.has("frames") and snapshot["frames"] is Array:
				frames = snapshot["frames"]
			var lines := []
			if snapshot.has("lines") and snapshot["lines"] is Array:
				lines = snapshot["lines"]
			var needs_stack := frames.is_empty()
			var needs_lines := lines.is_empty()
			if needs_stack or needs_lines:
				if debugger_bridge.has_method("get_cached_stack_info"):
					var fallback := debugger_bridge.get_cached_stack_info(resolved_session_id)
					var fallback_frames := fallback.get("frames", [])
					if fallback_frames is Array and not fallback_frames.is_empty():
						snapshot["frames"] = fallback_frames
						snapshot_diagnostics["fallback_source"] = "debugger_bridge"
						snapshot_diagnostics["fallback_frame_count"] = fallback.get("total_frames", fallback_frames.size())
						if needs_lines:
							var formatted_lines := _format_frames_as_lines(fallback_frames)
							snapshot["lines"] = formatted_lines
							if snapshot.get("text", "") == "":
								snapshot["text"] = "\n".join(formatted_lines)
					elif fallback.has("error"):
						snapshot_diagnostics["fallback_error"] = fallback["error"]
	else:
		debugger_error = "Debugger bridge unavailable"

	var response := {
		"stack_trace_panel": snapshot,
		"session_id": resolved_session_id,
		"debugger_state": debugger_state,
		"timestamp": Time.get_ticks_msec()
	}

	if not debugger_error.is_empty():
		response["call_stack_error"] = debugger_error

	_send_success(client_id, response, command_id)

func _handle_get_stack_frames_panel(client_id: int, params: Dictionary, command_id: String) -> void:
	var publisher := _get_debug_output_publisher()
	var snapshot: Dictionary = {
		"text": "",
		"lines": [],
		"line_count": 0,
		"frames": [],
		"diagnostics": {
			"error": "debug_output_publisher_unavailable",
			"timestamp": Time.get_ticks_msec()
		}
	}

	if publisher and publisher.has_method("get_stack_frames_snapshot"):
		var snapshot_session := int(params.get("session_id", -1))
		snapshot = publisher.get_stack_frames_snapshot(snapshot_session)

	var snapshot_diagnostics := snapshot.get("diagnostics", {})
	if typeof(snapshot_diagnostics) != TYPE_DICTIONARY:
		snapshot_diagnostics = {}
		snapshot["diagnostics"] = snapshot_diagnostics

	var debugger_state := {}
	var requested_session := int(params.get("session_id", -1))
	var resolved_session_id := requested_session
	var debugger_error := ""
	var debugger_bridge := _get_debugger_bridge()

	var refresh_requested := bool(params.get("refresh", false))
	if debugger_bridge:
		debugger_state = debugger_bridge.get_current_state()
		var active_sessions := debugger_state.get("active_sessions", [])
		if resolved_session_id < 0 and active_sessions is Array and not active_sessions.is_empty():
			resolved_session_id = debugger_state.get("current_session_id", -1)
			if resolved_session_id < 0:
				resolved_session_id = active_sessions[0]
		if resolved_session_id >= 0:
			var frames := []
			if snapshot.has("frames") and snapshot["frames"] is Array:
				frames = snapshot["frames"]
			var needs_stack := frames.is_empty()
			var needs_enrichment := _frames_need_enrichment(frames)
			var existing_lines := []
			if snapshot.has("lines") and snapshot["lines"] is Array:
				existing_lines = snapshot["lines"]
			var needs_lines := existing_lines.is_empty()
			var require_debugger_frames := refresh_requested or needs_stack or needs_lines or needs_enrichment
			if require_debugger_frames and debugger_bridge.has_method("get_cached_stack_info"):
				var debugger_snapshot := await _fetch_debugger_stack_frames(debugger_bridge, resolved_session_id, refresh_requested)
				var fallback_frames := debugger_snapshot.get("frames", [])
				if fallback_frames is Array and not fallback_frames.is_empty():
					snapshot["frames"] = fallback_frames
					snapshot_diagnostics["fallback_source"] = "debugger_bridge"
					snapshot_diagnostics["fallback_frame_count"] = debugger_snapshot.get("total_frames", fallback_frames.size())
					if needs_lines or snapshot.get("lines", []).is_empty():
						var formatted_lines := _format_stack_frames_panel_lines(fallback_frames)
						if not formatted_lines.is_empty():
							snapshot["lines"] = formatted_lines
							snapshot["line_count"] = formatted_lines.size()
							if snapshot.get("text", "") == "":
								snapshot["text"] = "\n".join(formatted_lines)
					needs_stack = false
					needs_enrichment = false
					needs_lines = false
				elif debugger_snapshot.has("error"):
					snapshot_diagnostics["fallback_error"] = debugger_snapshot["error"]
			if needs_lines and snapshot.get("text", "") != "":
				var fallback_lines := String(snapshot["text"]).split("\n", false)
				if not fallback_lines.is_empty():
					snapshot["lines"] = fallback_lines
					snapshot["line_count"] = fallback_lines.size()
			if needs_stack and not snapshot.has("frames"):
				snapshot["frames"] = []
	else:
		debugger_error = "Debugger bridge unavailable"

	var snapshot_frames := []
	if snapshot.has("frames") and snapshot["frames"] is Array:
		snapshot_frames = snapshot["frames"]
	if snapshot_frames is Array and not snapshot_frames.is_empty():
		var formatted_frame_lines := _format_stack_frames_panel_lines(snapshot_frames)
		if not formatted_frame_lines.is_empty():
			snapshot["lines"] = formatted_frame_lines
			snapshot["line_count"] = formatted_frame_lines.size()
			snapshot["text"] = "\n".join(formatted_frame_lines)

	var response := {
		"stack_frames_panel": snapshot,
		"session_id": resolved_session_id,
		"debugger_state": debugger_state,
		"timestamp": Time.get_ticks_msec()
	}

	if not debugger_error.is_empty():
		response["stack_frames_error"] = debugger_error

	_send_success(client_id, response, command_id)

func _fetch_debugger_stack_frames(debugger_bridge: MCPDebuggerBridge, session_id: int, refresh_requested: bool) -> Dictionary:
	if debugger_bridge == null or session_id < 0:
		return {}
	var result := {}
	if refresh_requested:
		result = await debugger_bridge.get_call_stack(session_id)
		if typeof(result) == TYPE_DICTIONARY and result.get("frames", []).size() > 0:
			return result

	result = debugger_bridge.get_cached_stack_info(session_id)
	var frames := result.get("frames", [])
	if frames is Array and not frames.is_empty():
		return result

	var refreshed_result = await debugger_bridge.get_call_stack(session_id)
	if typeof(refreshed_result) == TYPE_DICTIONARY and refreshed_result.get("frames", []).is_empty() == false:
		return refreshed_result

	var log_frames := _build_frames_from_debug_output()
	if not log_frames.is_empty():
		return log_frames

	return result

func _frames_need_enrichment(frames: Array) -> bool:
	if frames.is_empty():
		return false
	for frame in frames:
		if typeof(frame) != TYPE_DICTIONARY:
			continue
		var script := ""
		if frame.has("script") and frame["script"] is String:
			script = frame["script"]
		elif frame.has("file") and frame["file"] is String:
			script = frame["file"]
		var line := -1
		if frame.has("line") and frame["line"] is int:
			line = frame["line"]
		if script == "" or line < 0:
			return true
	return false

func _handle_clear_debug_output(client_id: int, command_id: String) -> void:
	var publisher := _get_debug_output_publisher()
	if publisher == null or not publisher.has_method("clear_log_output"):
		_send_error(client_id, "Cannot clear Output panel because the debug output publisher is unavailable.", command_id)
		return

	var result := publisher.clear_log_output()
	if not result.has("message"):
		if result.get("cleared", false):
			result["message"] = "Debug Output panel cleared."
		else:
			result["message"] = "Debug Output panel could not be cleared automatically."

	_send_success(client_id, result, command_id)

func _get_debug_output_publisher() -> MCPDebugOutputPublisher:
	if Engine.has_meta("MCPDebugOutputPublisher"):
		var publisher = Engine.get_meta("MCPDebugOutputPublisher")
		if publisher and publisher is MCPDebugOutputPublisher:
			return publisher
	return null

func _capture_editor_errors_snapshot() -> Dictionary:
	var publisher := _get_debug_output_publisher()
	if publisher and publisher.has_method("get_errors_panel_snapshot"):
		return publisher.get_errors_panel_snapshot()

	var diagnostics := {
		"timestamp": Time.get_ticks_msec()
	}

	if not Engine.is_editor_hint():
		diagnostics["error"] = "editor_only"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	var search_roots: Array = []
	var editor_node = Engine.get_singleton("EditorNode") if Engine.has_singleton("EditorNode") else null
	if editor_node:
		if editor_node.has_method("get_log"):
			var editor_log = editor_node.call("get_log")
			if is_instance_valid(editor_log):
				search_roots.append(editor_log)
		search_roots.append(editor_node)

	var plugin = Engine.get_meta("GodotMCPPlugin") if Engine.has_meta("GodotMCPPlugin") else null
	if plugin and plugin is EditorPlugin:
		var editor_interface = plugin.get_editor_interface()
		if editor_interface and editor_interface.has_method("get_base_control"):
			var base_control = editor_interface.call("get_base_control")
			if is_instance_valid(base_control):
				search_roots.append(base_control)

	var scene_tree := get_tree()
	if scene_tree:
		var tree_root := scene_tree.get_root()
		if is_instance_valid(tree_root):
			search_roots.append(tree_root)

	var aggregated_summary: Array = []
	var tab_info := {}
	for root in search_roots:
		tab_info = _find_errors_tab_in_editor_log(root)
		var summary := String(tab_info.get("summary", ""))
		if not summary.is_empty():
			aggregated_summary.append(summary)
		if tab_info.has("control"):
			break
	if aggregated_summary.size() > 0:
		diagnostics["search_summary"] = " | ".join(aggregated_summary)
	else:
		diagnostics["search_summary"] = ""

	if tab_info.is_empty() or not tab_info.has("control"):
		diagnostics["error"] = "errors_tab_not_found"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	var tab_control: Control = tab_info.get("control")
	if not is_instance_valid(tab_control):
		diagnostics["error"] = "tab_control_invalid"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	diagnostics["tab_title"] = tab_info.get("tab_title", "")
	if tab_control.is_inside_tree():
		diagnostics["control_path"] = String(tab_control.get_path())
	else:
		diagnostics["control_path"] = ""

	var lines: Array = []
	var text := ""
	var tree := _locate_descendant_tree(tab_control)
	if tree:
		if tree.is_inside_tree():
			diagnostics["tree_path"] = String(tree.get_path())
		lines = _collect_tree_lines(tree)
		text = "\n".join(lines)
	else:
		text = _extract_text_from_control_local(tab_control)
		if not text.is_empty():
			lines = text.split("\n", false)

	return {
		"text": text,
		"lines": lines,
		"line_count": lines.size(),
		"diagnostics": diagnostics
	}

func _find_errors_tab_in_editor_log(root: Node) -> Dictionary:
	var queue: Array = []
	var summary: Array = []
	if is_instance_valid(root):
		queue.append(root)
	else:
		return {}

	var visited := 0
	while queue.size() > 0:
		var candidate = queue.pop_front()
		if not is_instance_valid(candidate):
			continue
		visited += 1

		if candidate is TabContainer:
			var tab_container: TabContainer = candidate
			var tab_count: int = tab_container.get_tab_count() if tab_container.has_method("get_tab_count") else tab_container.get_child_count()
			for i in range(tab_count):
				var title := ""
				if tab_container.has_method("get_tab_title"):
					title = String(tab_container.get_tab_title(i))
				var title_lower := title.to_lower()
				if title_lower.find("error") != -1:
					var tab_control: Control = null
					if tab_container.has_method("get_tab_control"):
						tab_control = tab_container.get_tab_control(i)
					if not is_instance_valid(tab_control) and i < tab_container.get_child_count():
						var child = tab_container.get_child(i)
						if child is Control:
							tab_control = child

					if is_instance_valid(tab_control):
						tab_control = _unwrap_single_child_control(tab_control)
						summary.append("tab_found=%s" % title)
						summary.append("visited=%d" % visited)
						return {
							"control": tab_control,
							"tab_title": title,
							"summary": "; ".join(summary)
						}
		for child in candidate.get_children():
			if child is Node:
				queue.append(child)

	return {"summary": "; ".join(summary)}

func _unwrap_single_child_control(control: Control) -> Control:
	if not is_instance_valid(control):
		return control

	var current := control
	var safety := 0
	while safety < 5 and current.get_child_count() == 1:
		var child = current.get_child(0)
		if child is Control:
			current = child
			safety += 1
		else:
			break

	if current.get_child_count() > 1:
		for child in current.get_children():
			if child is Control and (_is_text_display_control_local(child)):
				return child

	return current

func _locate_descendant_tree(root: Node, max_nodes: int = 8192) -> Tree:
	if not is_instance_valid(root):
		return null
	var queue: Array = [root]
	var visited := 0
	while queue.size() > 0 and visited < max_nodes:
		var candidate = queue.pop_front()
		visited += 1
		if not is_instance_valid(candidate):
			continue
		if candidate is Tree:
			return candidate
		for child in candidate.get_children():
			if child is Node:
				queue.append(child)
	return null

func _collect_tree_lines(tree: Tree) -> Array:
	var lines: Array = []
	if not is_instance_valid(tree):
		return lines
	var root := tree.get_root()
	if not root:
		return lines
	var item := root.get_first_child()
	var column_count: int = tree.columns
	while item:
		_collect_tree_item_lines(item, lines, 0, column_count)
		item = item.get_next()
	return lines

func _collect_tree_item_lines(item: TreeItem, lines: Array, depth: int, column_count: int) -> void:
	if not is_instance_valid(item):
		return

	var parts: Array = []
	if item.has_meta("_is_warning"):
		parts.append("[warning]")
	elif item.has_meta("_is_error"):
		parts.append("[error]")

	var primary := item.get_text(0)
	if not primary.is_empty():
		parts.append(primary)

	for col in range(1, column_count):
		var extra := item.get_text(col)
		if not extra.is_empty():
			parts.append(extra)

	if parts.size() > 0:
		var prefix := _make_indent_local(depth)
		lines.append(prefix + " ".join(parts))

	var child := item.get_first_child()
	while child:
		_collect_tree_item_lines(child, lines, depth + 1, column_count)
		child = child.get_next()

func _is_text_display_control_local(control: Control) -> bool:
	if not is_instance_valid(control):
		return false
	return control.is_class("TextEdit") or control.is_class("CodeEdit") or control.is_class("RichTextLabel")

func _extract_text_from_control_local(control: Object) -> String:
	if not is_instance_valid(control):
		return ""

	if control.has_method("get_parsed_text"):
		return String(control.call("get_parsed_text"))
	if control.has_method("get_text"):
		return String(control.call("get_text"))
	if control.has_method("get_full_text"):
		return String(control.call("get_full_text"))
	if control.has_method("get_line_count") and control.has_method("get_line"):
		var lines: Array = []
		var count := int(control.call("get_line_count"))
		for i in range(count):
			lines.append(String(control.call("get_line", i)))
		return "\n".join(lines)
	return ""

func _make_indent_local(depth: int) -> String:
	if depth <= 0:
		return ""
	var spaces := depth * 2
	var builder := ""
	for i in range(spaces):
		builder += " "
	return builder

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

func _format_frames_as_lines(frames: Array) -> Array:
	var lines: Array = []
	for i in range(frames.size()):
		var frame = frames[i]
		if typeof(frame) != TYPE_DICTIONARY:
			continue
		var index: int = i
		if frame.has("index") and frame["index"] is int:
			index = frame["index"]
		var script: String = ""
		if frame.has("script") and frame["script"] is String:
			script = frame["script"]
		elif frame.has("file") and frame["file"] is String:
			script = frame["file"]
		var line_num: int = -1
		if frame.has("line") and frame["line"] is int:
			line_num = frame["line"]
		var function_name: String = ""
		if frame.has("function") and frame["function"] is String:
			function_name = frame["function"]
		var location := ""
		if script is String and not script.is_empty():
			location = script
		if line_num is int and line_num >= 0:
			if location.is_empty():
				location = ":%d" % line_num
			else:
				location += ":%d" % line_num
		if location.is_empty():
			location = String(frame.get("location", "unknown location"))
		var fn_display := function_name if function_name is String and not function_name.is_empty() else "(anonymous)"
		lines.append("#%d %s — %s" % [index, fn_display, location])
	return lines

func _build_frames_from_debug_output() -> Dictionary:
	var frames := _parse_frames_from_debug_output()
	if frames.is_empty():
		return {}
	return {
		"frames": frames,
		"total_frames": frames.size(),
		"current_frame": 0,
		"source": "debug_output"
	}

func _parse_frames_from_debug_output() -> Array:
	var publisher := _get_debug_output_publisher()
	if publisher == null or not publisher.has_method("get_full_log_text"):
		return []
	var text := publisher.get_full_log_text()
	if text.is_empty():
		return []
	var lines := text.split("\n", false)
	var frame_lines: Array = []
	var collecting := false
	for i in range(lines.size() - 1, -1, -1):
		var line := String(lines[i]).strip_edges()
		if line.begins_with("Frame "):
			collecting = true
			frame_lines.push_front(line)
		elif collecting:
			break
	if frame_lines.is_empty():
		return []
	var frames := []
	for line in frame_lines:
		var frame_dict := _parse_print_stack_line(line)
		if not frame_dict.is_empty():
			frames.append(frame_dict)
	return frames

func _parse_print_stack_line(line: String) -> Dictionary:
	var trimmed := line.strip_edges()
	if not trimmed.begins_with("Frame "):
		return {}
	var dash_index := trimmed.find(" - ")
	if dash_index == -1:
		return {}
	var index_text := trimmed.substr(6, dash_index - 6).strip_edges()
	var index_value := 0
	if index_text.is_valid_int():
		index_value = int(index_text)
	var rest := trimmed.substr(dash_index + 3).strip_edges()
	var func_name := ""
	var location := rest
	var at_index := rest.find("@")
	if at_index != -1:
		location = rest.substr(0, at_index).strip_edges()
		func_name = rest.substr(at_index + 1).strip_edges()
		if func_name.ends_with("()"):
			func_name = func_name.substr(0, func_name.length() - 2)
	var script_path := ""
	var line_number := -1
	var colon_index := location.rfind(":")
	if colon_index != -1:
		var line_text := location.substr(colon_index + 1).strip_edges()
		if line_text.is_valid_int():
			line_number = int(line_text)
		script_path = location.substr(0, colon_index).strip_edges()
	else:
		script_path = location
	return {
		"index": index_value,
		"function": func_name,
		"script": script_path,
		"file": script_path,
		"line": line_number,
		"location": location
	}

func _format_stack_frames_panel_lines(frames: Array) -> Array:
	var lines: Array = []
	for i in range(frames.size()):
		var frame = frames[i]
		if typeof(frame) != TYPE_DICTIONARY:
			continue
		var index_value := i
		if frame.has("index"):
			var raw_index = frame["index"]
			if typeof(raw_index) == TYPE_INT:
				index_value = raw_index
			elif typeof(raw_index) == TYPE_STRING:
				var index_text := String(raw_index).strip_edges()
				if index_text.is_valid_int():
					index_value = int(index_text)
		var script_path := ""
		if frame.has("script") and typeof(frame["script"]) == TYPE_STRING:
			script_path = frame["script"]
		elif frame.has("file") and typeof(frame["file"]) == TYPE_STRING:
			script_path = frame["file"]
		var line_number := -1
		if frame.has("line") and typeof(frame["line"]) == TYPE_INT:
			line_number = frame["line"]
		var location := ""
		if not script_path.is_empty():
			location = script_path
			if line_number >= 0:
				location += ":%d" % line_number
		else:
			location = String(frame.get("location", ""))
		if location.is_empty():
			location = "<unknown>"
		var function_name := ""
		if frame.has("function") and typeof(frame["function"]) == TYPE_STRING:
			function_name = frame["function"]
		if function_name.is_empty():
			function_name = "(anonymous)"
		lines.append("%d - %s - at function: %s" % [index_value, location, function_name])
	return lines
