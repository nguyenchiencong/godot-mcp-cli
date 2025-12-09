@tool
class_name MCPRuntimeDebuggerBridge
extends EditorDebuggerPlugin

signal scene_tree_updated(session_id: int)
signal runtime_eval_completed(session_id: int, request_id: int)
signal input_result_received(session_id: int, request_id: int)

const CAPTURE_SCENE := "scene"
const VIEW_HAS_VISIBLE_METHOD := 1 << 1
const VIEW_VISIBLE := 1 << 2
const VIEW_VISIBLE_IN_TREE := 1 << 3
const DEFAULT_TIMEOUT_MS := 800
const DEFAULT_EVAL_TIMEOUT_MS := 800
const SCENE_CAPTURE_NAMES := ["scene", "limboai"]
const EVAL_CAPTURE_NAME := "mcp_eval"
const INPUT_CAPTURE_NAME := "mcp_input"

var _sessions: Dictionary = {}
var _next_eval_request_id: int = 1

func _init() -> void:
	_sessions.clear()
	_next_eval_request_id = 1

func _setup_session(session_id: int) -> void:
	_trace("setup_session %s" % session_id)
	_ensure_session(session_id)
	var session := get_session(session_id)
	if session:
		session.started.connect(_on_session_started.bind(session_id), CONNECT_DEFERRED)
		session.stopped.connect(_on_session_stopped.bind(session_id), CONNECT_DEFERRED)
		session.breaked.connect(_on_session_breaked.bind(session_id), CONNECT_DEFERRED)
		if session.is_active():
			var state: Dictionary = _sessions[session_id]
			state["active"] = true
			_sessions[session_id] = state
			_trace("session %s already active" % session_id)

func _has_capture(capture: String) -> bool:
	for prefix in SCENE_CAPTURE_NAMES:
		if capture == prefix or capture.begins_with(prefix + ":"):
			return true
	if capture == INPUT_CAPTURE_NAME or capture.begins_with(INPUT_CAPTURE_NAME + ":"):
		return true
	return false

func _capture(message: String, data: Array, session_id: int) -> bool:
	_trace("capture %s session=%s payload_len=%s" % [message, session_id, data.size()])
	var normalized := _normalize_capture_name(message)
	if normalized == "scene:scene_tree":
		if data.size() == 0 or data.size() % 6 != 0:
			_trace("discarding malformed scene_tree payload (size=%s)" % data.size())
			return false
		_trace("storing scene tree for session %s (size=%s)" % [session_id, data.size()])
		_store_scene_tree(session_id, data)
		return true
	elif normalized == "%s:result" % EVAL_CAPTURE_NAME:
		_trace("received runtime eval result for session %s" % session_id)
		_store_eval_result(session_id, data)
		return true
	elif normalized == "%s:result" % INPUT_CAPTURE_NAME:
		_trace("received input result for session %s" % session_id)
		_store_input_result(session_id, data)
		return true
	return false

func request_runtime_scene_snapshot() -> Dictionary:
	var active_sessions := _get_active_session_ids()
	_trace("active sessions: %s" % active_sessions)
	if active_sessions.is_empty():
		return { "error": "No active runtime session. Start the project or attach the debugger first." }
	var session_id: int = active_sessions[0]
	_ensure_session(session_id)

	var state: Dictionary = _sessions[session_id]
	var baseline_version: int = state.get("tree_version", 0)
	_request_scene_tree(session_id)

	return {
		"session_id": session_id,
		"baseline_version": baseline_version
	}

func has_new_runtime_snapshot(session_id: int, baseline_version: int) -> bool:
	if not _sessions.has(session_id):
		return false
	var state: Dictionary = _sessions[session_id]
	return state.get("tree_version", 0) > baseline_version and state.get("tree")

func build_runtime_snapshot(session_id: int, options: Dictionary = {}) -> Dictionary:
	if not _sessions.has(session_id):
		return {}
	var state: Dictionary = _sessions[session_id]
	if not state.get("tree"):
		return {}
	return _build_response(state["tree"], options)

func evaluate_runtime_expression(expression: String, options: Dictionary = {}) -> Dictionary:
	var trimmed := expression.strip_edges()
	if trimmed.is_empty():
		return { "error": "Expression cannot be empty." }

	var active_sessions := _get_active_session_ids()
	if active_sessions.is_empty():
		return { "error": "No active runtime session. Start the project or attach the debugger first." }

	var session_id: int = active_sessions[0]
	_ensure_session(session_id)
	var session := get_session(session_id)
	if session == null or not session.is_active():
		return { "error": "Runtime debugger session is not active." }

	var request_id: int = _next_eval_request_id
	_next_eval_request_id += 1

	var payload := Array()
	payload.append(request_id)
	payload.append(trimmed)
	if typeof(options) == TYPE_DICTIONARY:
		payload.append(options.duplicate(true))
	else:
		payload.append({})

	_trace("sending runtime eval request %s to session %s" % [request_id, session_id])
	session.send_message("%s:evaluate" % EVAL_CAPTURE_NAME, payload)

	return {
		"session_id": session_id,
		"request_id": request_id
	}

func has_eval_result(session_id: int, request_id: int) -> bool:
	if not _sessions.has(session_id):
		return false
	var state: Dictionary = _sessions[session_id]
	var results: Dictionary = state.get("eval_results", {})
	return results.has(request_id)

func take_eval_result(session_id: int, request_id: int) -> Dictionary:
	if not _sessions.has(session_id):
		return {}
	var state: Dictionary = _sessions[session_id]
	var results: Dictionary = state.get("eval_results", {})
	if not results.has(request_id):
		return {}
	var payload: Variant = results[request_id]
	results.erase(request_id)
	state["eval_results"] = results
	_sessions[session_id] = state

	var response := {}
	if typeof(payload) == TYPE_DICTIONARY:
		response = payload.duplicate(true)
		if response.has("_received_at"):
			response.erase("_received_at")
	return response

func _get_active_session_ids() -> Array:
	var result: Array = []
	var sessions := get_sessions()
	_trace("get_sessions count=%s" % sessions.size())
	for i in range(sessions.size()):
		var session = sessions[i]
		if session and session.has_method("is_active") and session.is_active():
			_ensure_session(i)
			result.append(i)
	return result

func _request_scene_tree(session_id: int) -> void:
	var session := get_session(session_id)
	_trace("request_scene_tree session=%s session=%s" % [session_id, session])
	if session and session.is_active():
		var payload := Array()
		payload.push_back("")
		payload.push_back(Array())
		for prefix in SCENE_CAPTURE_NAMES:
			payload[0] = "%s:scene_tree" % prefix
			session.send_message("request_message", payload)
		var state: Dictionary = _sessions.get(session_id, {})
		state["last_request_time"] = Time.get_ticks_msec()
		_sessions[session_id] = state
	else:
		_trace("session inactive, cannot request scene tree")

func _store_scene_tree(session_id: int, payload: Array) -> void:
	if payload.is_empty():
		return
	var parsed := _parse_remote_tree(payload)
	if parsed.is_empty():
		return

	var state: Dictionary = _sessions.get(session_id, {})
	state["tree"] = parsed
	state["tree_version"] = state.get("tree_version", 0) + 1
	state["last_update"] = Time.get_ticks_msec()
	_sessions[session_id] = state

	scene_tree_updated.emit(session_id)

func _store_eval_result(session_id: int, payload: Array) -> void:
	_ensure_session(session_id)
	if payload.is_empty():
		_trace("runtime eval payload empty")
		return

	var entry: Variant = payload[0]
	if typeof(entry) != TYPE_DICTIONARY:
		_trace("runtime eval payload not dictionary")
		return

	var result_dict: Dictionary = entry.duplicate(true)
	var request_id := int(result_dict.get("request_id", -1))
	if request_id < 0:
		_trace("runtime eval payload missing request_id")
		return

	if result_dict.has("output"):
		var raw_output = result_dict["output"]
		var normalized_output: Array = []
		if typeof(raw_output) == TYPE_ARRAY:
			for item in raw_output:
				normalized_output.append(str(item))
		elif typeof(raw_output) == TYPE_PACKED_STRING_ARRAY:
			for item in raw_output:
				normalized_output.append(str(item))
		elif raw_output == null:
			pass
		else:
			normalized_output.append(str(raw_output))
		result_dict["output"] = normalized_output
	else:
		result_dict["output"] = []

	result_dict["_received_at"] = Time.get_ticks_msec()

	var state: Dictionary = _sessions.get(session_id, {})
	var results: Dictionary = state.get("eval_results", {})
	results[request_id] = result_dict
	state["eval_results"] = results
	_sessions[session_id] = state

	runtime_eval_completed.emit(session_id, request_id)

func _parse_remote_tree(flat_data: Array) -> Dictionary:
	if flat_data.size() % 6 != 0:
		return {}

	var nodes: Array = []
	var index := 0
	while index < flat_data.size():
		var node := {
			"child_count": int(flat_data[index]),
			"name": str(flat_data[index + 1]),
			"type": str(flat_data[index + 2]),
			"object_id": int(flat_data[index + 3]),
			"scene_file_path": str(flat_data[index + 4]),
			"view_flags": int(flat_data[index + 5]),
			"children": []
		}
		nodes.append(node)
		index += 6
	if nodes.is_empty():
		return {}

	var stack: Array = []
	var root: Dictionary = nodes[0]
	root["_remaining"] = root["child_count"]
	stack.append(root)

	for i in range(1, nodes.size()):
		var current: Dictionary = nodes[i]
		current["_remaining"] = current["child_count"]
		while not stack.is_empty() and stack.back()["_remaining"] <= 0:
			stack.pop_back()
		if stack.is_empty():
			# Malformed stream; abort to avoid inconsistent data.
			return {}
		var parent: Dictionary = stack.back()
		parent["children"].append(current)
		parent["_remaining"] -= 1
		if current["_remaining"] > 0:
			stack.append(current)

	while not stack.is_empty():
		stack.pop_back()

	_cleanup_internal_keys(root)
	_assign_paths(root, "")
	return root

func _cleanup_internal_keys(node: Dictionary) -> void:
	node.erase("_remaining")
	for child in node["children"]:
		_cleanup_internal_keys(child)

func _assign_paths(node: Dictionary, parent_path: String) -> void:
	var name: String = node.get("name", "")
	var current_path := ""
	if parent_path.is_empty():
		current_path = "/root/%s" % name
	else:
		current_path = "%s/%s" % [parent_path, name]
	node["path"] = current_path

	var view_flags: int = node.get("view_flags", 0)
	node["visibility"] = {
		"has_visible_method": bool(view_flags & VIEW_HAS_VISIBLE_METHOD),
		"visible": bool(view_flags & VIEW_VISIBLE),
		"visible_in_tree": bool(view_flags & VIEW_VISIBLE_IN_TREE)
	}

	for child in node["children"]:
		_assign_paths(child, current_path)

func _build_response(root: Dictionary, options: Dictionary) -> Dictionary:
	var max_depth: int = options.get("max_depth", -1)
	var include_props := options.get("include_properties", false)
	var include_scripts := options.get("include_scripts", false)

	var response := {
		"scene_path": root.get("scene_file_path", ""),
		"root_node_name": root.get("name", ""),
		"root_node_type": root.get("type", ""),
		"runtime": true,
		"structure": _project_node(root, 0, max_depth)
	}

	if include_props:
		response["warning_properties"] = "Runtime inspection does not expose live properties yet."
	if include_scripts:
		response["warning_scripts"] = "Runtime inspection does not expose script metadata yet."

	return response

func _project_node(node: Dictionary, depth: int, max_depth: int) -> Dictionary:
	var projected := {
		"name": node.get("name", ""),
		"type": node.get("type", ""),
		"path": node.get("path", ""),
		"object_id": node.get("object_id", 0),
		"scene_file_path": node.get("scene_file_path", ""),
		"visibility": node.get("visibility", {}),
		"children": []
	}

	if max_depth >= 0 and depth >= max_depth:
		return projected

	for child in node["children"]:
		projected["children"].append(_project_node(child, depth + 1, max_depth))

	return projected

func _ensure_session(session_id: int) -> void:
	if not _sessions.has(session_id):
		_sessions[session_id] = {
			"tree": null,
			"tree_version": 0,
			"last_update": 0,
			"active": false,
			"eval_results": {},
			"input_results": {}
		}

func _on_session_started(session_id: int) -> void:
	_ensure_session(session_id)
	var state: Dictionary = _sessions[session_id]
	state["active"] = true
	_sessions[session_id] = state
	_trace("session %s started" % session_id)

func _on_session_stopped(session_id: int) -> void:
	_ensure_session(session_id)
	var state: Dictionary = _sessions[session_id]
	state["active"] = false
	_sessions[session_id] = state
	_trace("session %s stopped" % session_id)

func _on_session_breaked(can_debug: bool, session_id: int) -> void:
	_ensure_session(session_id)
	var state: Dictionary = _sessions[session_id]
	state["can_debug"] = can_debug
	_sessions[session_id] = state
	_trace("session %s breaked can_debug=%s" % [session_id, can_debug])

func _normalize_capture_name(message: String) -> String:
	for prefix in SCENE_CAPTURE_NAMES:
		var needle := "%s:" % prefix
		if message.begins_with(needle):
			var suffix := message.substr(needle.length())
			if suffix == "scene_tree":
				return "scene:scene_tree"
			return "%s:%s" % [prefix, suffix]
	if message.begins_with("%s:" % EVAL_CAPTURE_NAME):
		var eval_suffix := message.substr(EVAL_CAPTURE_NAME.length() + 1)
		return "%s:%s" % [EVAL_CAPTURE_NAME, eval_suffix]
	if message.begins_with("%s:" % INPUT_CAPTURE_NAME):
		var input_suffix := message.substr(INPUT_CAPTURE_NAME.length() + 1)
		return "%s:%s" % [INPUT_CAPTURE_NAME, input_suffix]
	if message.ends_with(":scene_tree"):
		return "scene:scene_tree"
	return message

func _trace(text: String) -> void:
	if OS.is_stdout_verbose():
		print("[RuntimeBridge] %s" % text)

# Input simulation result handling

func _store_input_result(session_id: int, payload: Array) -> void:
	_ensure_session(session_id)
	if payload.is_empty():
		_trace("input result payload empty")
		return
	
	var entry: Variant = payload[0]
	if typeof(entry) != TYPE_DICTIONARY:
		_trace("input result payload not dictionary")
		return
	
	var result_dict: Dictionary = entry.duplicate(true)
	var request_id := int(result_dict.get("request_id", -1))
	if request_id < 0:
		_trace("input result payload missing request_id")
		return
	
	result_dict["_received_at"] = Time.get_ticks_msec()
	
	var state: Dictionary = _sessions.get(session_id, {})
	var results: Dictionary = state.get("input_results", {})
	results[request_id] = result_dict
	state["input_results"] = results
	_sessions[session_id] = state
	
	input_result_received.emit(session_id, request_id)


func has_input_result(session_id: int, request_id: int) -> bool:
	if not _sessions.has(session_id):
		return false
	var state: Dictionary = _sessions[session_id]
	var results: Dictionary = state.get("input_results", {})
	return results.has(request_id)


func take_input_result(session_id: int, request_id: int) -> Dictionary:
	if not _sessions.has(session_id):
		return {}
	var state: Dictionary = _sessions[session_id]
	var results: Dictionary = state.get("input_results", {})
	if not results.has(request_id):
		return {}
	var payload: Variant = results[request_id]
	results.erase(request_id)
	state["input_results"] = results
	_sessions[session_id] = state
	
	var response := {}
	if typeof(payload) == TYPE_DICTIONARY:
		response = payload.duplicate(true)
		if response.has("_received_at"):
			response.erase("_received_at")
	return response
