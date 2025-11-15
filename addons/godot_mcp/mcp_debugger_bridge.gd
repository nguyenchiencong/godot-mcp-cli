@tool
class_name MCPDebuggerBridge
extends EditorDebuggerPlugin

# Signals for debugger events
signal breakpoint_hit(session_id: int, script_path: String, line: int, stack_info: Dictionary)
signal execution_paused(session_id: int, reason: String)
signal execution_resumed(session_id: int)
signal stack_frame_changed(session_id: int, frame_info: Dictionary)
signal breakpoint_set(session_id: int, script_path: String, line: int, success: bool)
signal breakpoint_removed(session_id: int, script_path: String, line: int, success: bool)

# Debugger state tracking
var _active_sessions: Dictionary = {}
var _breakpoints: Dictionary = {}
var _current_client_id: int = -1
var _websocket_server = null
var _session_breakpoints: Dictionary = {}  # Track breakpoints per session
var _session_stack_cache: Dictionary = {}

# Constants for message throttling
const MAX_STACK_FRAMES: int = 50
const EVENT_THROTTLE_MS: int = 100
var _last_event_time: int = 0
const STACK_CAPTURE_NAMES := ["stack", "call_stack", "callstack", "stack_dump"]
const DEBUGGER_CAPTURE_NAMES := ["mcp_debugger", "breakpoint", "debugger"]

func _init():
	_active_sessions.clear()
	_breakpoints.clear()
	_session_breakpoints.clear()
	_session_stack_cache.clear()

func set_websocket_server(server):
	_websocket_server = server

func set_client_id(client_id: int):
	_current_client_id = client_id

func _normalize_capture_name(value: String) -> String:
	return value.to_lower()

func _is_stack_capture_name(name: String) -> bool:
	return name in STACK_CAPTURE_NAMES

func _is_debugger_capture_name(name: String) -> bool:
	return name in DEBUGGER_CAPTURE_NAMES

func _has_capture(capture: String) -> bool:
	# We handle multiple captures to integrate with Godot's debugger system
	var capture_lc = _normalize_capture_name(capture)
	return _is_debugger_capture_name(capture_lc) or _is_stack_capture_name(capture_lc)

func _build_stack_capture_payload(data: Array) -> Dictionary:
	if not data.is_empty() and typeof(data[0]) == TYPE_DICTIONARY:
		return data[0]
	return {"stack": data}

func _capture(message: String, data: Array, session_id: int) -> bool:
	var normalized_session_id = _normalize_session_id(session_id)
	_trace("Debugger capture received: %s for session %s" % [message, normalized_session_id])

	var message_lc = _normalize_capture_name(message)
	if _is_stack_capture_name(message_lc):
		var payload := _build_stack_capture_payload(data)
		_handle_stack_dump(normalized_session_id, payload)
		return true

	# Handle different Godot debugger messages
	match message_lc:
		"breakpoint":
			_handle_native_breakpoint(normalized_session_id, data)
		"debugger":
			_handle_debugger_message(normalized_session_id, data)
		"mcp_debugger":
			_handle_mcp_debugger_message(normalized_session_id, data)
		_:
			return false

	return true

func _handle_native_breakpoint(session_id: int, data: Array) -> void:
	# Handle native Godot breakpoint events
	if data.size() > 0:
		var breakpoint_data = data[0]
		if typeof(breakpoint_data) == TYPE_DICTIONARY:
			var script_path = breakpoint_data.get("script_path", "")
			var line = breakpoint_data.get("line", -1)
			var reason = breakpoint_data.get("reason", "breakpoint_hit")

			_trace("Native breakpoint hit: %s:%d" % [script_path, line])

			# Update session state
			_ensure_session_state(session_id, true)
			_active_sessions[session_id]["paused"] = true
			_active_sessions[session_id]["current_script"] = script_path
			_active_sessions[session_id]["current_line"] = line

			# Get stack info
			var stack_info = _get_session_stack_info(session_id)

			# Send event to MCP client
			_handle_breakpoint_hit(session_id, {
				"script_path": script_path,
				"line": line,
				"stack_info": stack_info
			})

func _handle_debugger_message(session_id: int, data: Array) -> void:
	# Handle general debugger messages (pause, resume, etc.)
	if data.size() > 0:
		var message_data = data[0]
		if typeof(message_data) == TYPE_DICTIONARY:
			var event_type = message_data.get("type", "")
			match event_type:
				"paused":
					_handle_execution_paused(session_id, message_data)
				"resumed":
					_handle_execution_resumed(session_id)
				"stack_frame":
					_handle_stack_frame_changed(session_id, message_data)
				"stack_dump":
					_handle_stack_dump(session_id, message_data)

func _handle_mcp_debugger_message(session_id: int, data: Array) -> void:
	# Handle our custom MCP debugger messages
	if data.is_empty():
		return

	var event_data = data[0]
	if typeof(event_data) != TYPE_DICTIONARY:
		return

	var event_type = event_data.get("type", "")
	match event_type:
		"breakpoint_hit":
			_handle_breakpoint_hit(session_id, event_data)
		"execution_paused":
			_handle_execution_paused(session_id, event_data)
		"execution_resumed":
			_handle_execution_resumed(session_id)
		"stack_frame_changed":
			_handle_stack_frame_changed(session_id, event_data)
		_:
			_trace("Unknown MCP debugger event type: %s" % event_type)

func _setup_session(session_id: int) -> void:
	session_id = _normalize_session_id(session_id)
	_trace("Setting up debugger session %s" % session_id)

	var session = _get_session_instance(session_id)
	if session:
		# Diagnostic: Log available methods and properties
		_diagnose_session_capabilities(session)

		session.started.connect(_on_session_started.bind(session_id), CONNECT_DEFERRED)
		session.stopped.connect(_on_session_stopped.bind(session_id), CONNECT_DEFERRED)
		session.breaked.connect(_on_session_breaked.bind(session_id), CONNECT_DEFERRED)

		if session.is_active():
			_ensure_session_state(session_id, true)
			# Restore any existing breakpoints for this session
			_setup_session_breakpoints(session_id)

func _normalize_session_id(value) -> Variant:
	var value_type := typeof(value)
	if value_type == TYPE_INT:
		return value
	if value_type == TYPE_FLOAT:
		return int(value)
	if value_type == TYPE_STRING:
		var text: String = value
		if text.is_valid_int():
			return int(text)
	return value

# Session tracking helpers
func _is_empty_session_request(value) -> bool:
	if value == null:
		return true
	var value_type := typeof(value)
	match value_type:
		TYPE_INT:
			return value < 0
		TYPE_FLOAT:
			return int(value) < 0
		TYPE_STRING:
			return String(value).strip_edges().is_empty()
		_:
			return false

func _collect_session_candidate_ids(requested_session_id) -> Array:
	var candidates: Array = []
	var use_active_sessions := _is_empty_session_request(requested_session_id)

	if not use_active_sessions:
		candidates.append(requested_session_id)

	if use_active_sessions:
		var active_ids = _get_active_session_ids()
		for session_id in active_ids:
			if session_id not in candidates:
				candidates.append(session_id)

	return candidates

func _find_tracked_session_key(session_id) -> Variant:
	if _active_sessions.has(session_id):
		return session_id
	var normalized_id = _normalize_session_id(session_id)
	if _active_sessions.has(normalized_id):
		return normalized_id
	for key in _active_sessions.keys():
		if _normalize_session_id(key) == normalized_id:
			return key
	return null

func _resolve_session_index(session_identifier) -> int:
	var normalized = _normalize_session_id(session_identifier)

	var sessions := get_sessions()
	for i in range(sessions.size()):
		var session = sessions[i]
		if session == null:
			continue

		var reported_id = session.get_session_id() if session.has_method("get_session_id") else i
		var reported_normalized = _normalize_session_id(reported_id)
		if reported_normalized == normalized:
			return i
		if typeof(normalized) == TYPE_STRING:
			var reported_text := str(reported_normalized)
			if reported_text == normalized:
				return i

	if typeof(normalized) == TYPE_INT and normalized >= 0 and normalized < sessions.size():
		return normalized

	return -1

func _get_session_instance(session_identifier):
	var session_index := _resolve_session_index(session_identifier)
	if session_index < 0:
		return null
	return get_session(session_index)

func _move_dict_key(target: Dictionary, old_key, new_key) -> void:
	if old_key == null or new_key == null or old_key == new_key:
		return
	if not target.has(old_key):
		return
	if target.has(new_key):
		target.erase(old_key)
		return
	target[new_key] = target[old_key]
	target.erase(old_key)

func _rekey_session_data(old_key, new_key) -> void:
	if old_key == null or new_key == null or old_key == new_key:
		return
	_move_dict_key(_active_sessions, old_key, new_key)
	_move_dict_key(_session_breakpoints, old_key, new_key)
	_move_dict_key(_session_stack_cache, old_key, new_key)

func _sync_tracked_session(session_id) -> bool:
	var normalized_id = _normalize_session_id(session_id)
	if _active_sessions.has(normalized_id):
		return true

	var existing_key = _find_tracked_session_key(normalized_id)
	if existing_key != null:
		_rekey_session_data(existing_key, normalized_id)
		return true

	# Refresh session tracking in case the debugger state changed
	_get_active_session_ids()
	existing_key = _find_tracked_session_key(normalized_id)
	if existing_key != null:
		_rekey_session_data(existing_key, normalized_id)
		return true

	return false

func _ensure_session_state(session_id, mark_active: bool = false) -> void:
	var normalized_id = _normalize_session_id(session_id)
	var tracked_key = _find_tracked_session_key(normalized_id)

	if tracked_key == null:
		_active_sessions[normalized_id] = {
			"active": mark_active,
			"paused": false,
			"current_script": "",
			"current_line": -1,
			"breakpoints": []
		}
	elif tracked_key != normalized_id:
		_rekey_session_data(tracked_key, normalized_id)

	if mark_active and _active_sessions.has(normalized_id):
		_active_sessions[normalized_id]["active"] = true

func _track_local_breakpoint(script_path: String, line: int) -> void:
	if not _breakpoints.has(script_path):
		_breakpoints[script_path] = []

	var script_breakpoints: Array = _breakpoints[script_path]
	if line not in script_breakpoints:
		script_breakpoints.append(line)

func _untrack_local_breakpoint(script_path: String, line: int) -> void:
	if not _breakpoints.has(script_path):
		return

	var script_breakpoints: Array = _breakpoints[script_path]
	script_breakpoints.erase(line)
	if script_breakpoints.is_empty():
		_breakpoints.erase(script_path)

func _ensure_session_breakpoint_storage(session_id) -> Dictionary:
	var normalized_id = _normalize_session_id(session_id)
	if not _session_breakpoints.has(normalized_id):
		_session_breakpoints[normalized_id] = {}

	return _session_breakpoints[normalized_id]

func _session_breakpoint_lines(session_id, script_path: String) -> Array:
	var storage = _ensure_session_breakpoint_storage(session_id)
	if not storage.has(script_path):
		storage[script_path] = []

	return storage[script_path]

func _get_primary_session_info() -> Dictionary:
	var active_sessions = _get_active_session_ids()
	if active_sessions.is_empty():
		return {}

	var session_id = active_sessions[0]
	var session = _get_session_instance(session_id)
	if not session or not session.is_active():
		return {"error": "Debugger session not active"}

	return {
		"id": session_id,
		"session": session
	}

func _with_primary_session(error_message: String, action: Callable) -> Dictionary:
	var info = _get_primary_session_info()
	if info.is_empty():
		return {"success": false, "message": error_message}

	if info.has("error"):
		return {"success": false, "message": info["error"]}

	return action.call(info["id"], info["session"])

func _active_session_objects() -> Array:
	var sessions: Array = []
	for session_id in _get_active_session_ids():
		var session = _get_session_instance(session_id)
		if session and session.is_active():
			sessions.append({
				"id": session_id,
				"session": session
			})

	return sessions

func _add_breakpoint_source(target: Dictionary, sources: Dictionary, source_name: String, breakpoint_map: Dictionary) -> void:
	if breakpoint_map.is_empty():
		return

	_merge_breakpoint_map(target, breakpoint_map)
	sources[source_name] = breakpoint_map

func _send_session_command(command: String, trace_label: String) -> Dictionary:
	return _with_primary_session("No active debugger session", func(session_id: int, session):
		if not session or not session.has_method("send_message"):
			return {"success": false, "message": "Debugger session not active"}

		session.send_message(command, [])
		_trace(trace_label)
		return {"success": true, "session_id": session_id}
	)

# Breakpoint management
func set_breakpoint(script_path: String, line: int) -> Dictionary:
	_track_local_breakpoint(script_path, line)

	return _with_primary_session(
		"No active debugger session. Start the project with debugging first.",
		func(session_id: int, session):
			var session_lines: Array = _session_breakpoint_lines(session_id, script_path)
			if line not in session_lines:
				session_lines.append(line)

			var success = _set_native_breakpoint(session, script_path, line)
			if success:
				breakpoint_set.emit(session_id, script_path, line, true)
				_trace("Breakpoint set successfully: %s:%d" % [script_path, line])

				return {
					"success": true,
					"session_id": session_id,
					"script_path": script_path,
					"line": line
				}

			return {
				"success": false,
				"message": "Failed to set breakpoint in Godot's debugger"
			}
	)


func remove_breakpoint(script_path: String, line: int) -> Dictionary:
	_untrack_local_breakpoint(script_path, line)

	return _with_primary_session("No active debugger session", func(session_id: int, session):
		if _session_breakpoints.has(session_id) and _session_breakpoints[session_id].has(script_path):
			_session_breakpoints[session_id][script_path].erase(line)
			if _session_breakpoints[session_id][script_path].is_empty():
				_session_breakpoints[session_id].erase(script_path)

		var success = _remove_native_breakpoint(session, script_path, line)
		if success:
			breakpoint_removed.emit(session_id, script_path, line, true)
			_trace("Breakpoint removed successfully: %s:%d" % [script_path, line])

			return {"success": true, "session_id": session_id}

		return {
			"success": false,
			"message": "Failed to remove breakpoint in Godot's debugger"
		}
	)


func get_breakpoints() -> Dictionary:
	var aggregated: Dictionary = {}
	var sources: Dictionary = {}

	_add_breakpoint_source(aggregated, sources, "mcp_tracked", _breakpoints.duplicate(true))
	_add_breakpoint_source(aggregated, sources, "session_tracked", _collect_tracked_session_breakpoints())
	_add_breakpoint_source(aggregated, sources, "session_reported", _collect_active_session_breakpoints())
	_add_breakpoint_source(aggregated, sources, "editor", _collect_editor_breakpoints())

	return {
		"breakpoints": aggregated,
		"sources": sources
	}

func clear_all_breakpoints() -> Dictionary:
	var old_breakpoints = _breakpoints.duplicate(true)
	var old_session_breakpoints = _session_breakpoints.duplicate(true)

	# Clear local tracking dictionaries
	_breakpoints.clear()
	_session_breakpoints.clear()

	# Actually remove breakpoints from Godot's debugger system
	var cleared_count = 0

	for session_info in _active_session_objects():
		var session_id: int = session_info["id"]
		var session = session_info["session"]

		# Clear breakpoints from this session using native methods
		if old_session_breakpoints.has(session_id):
			var session_bps = old_session_breakpoints[session_id]
			for script_path in session_bps:
				for line in session_bps[script_path]:
					var success = _remove_native_breakpoint(session, script_path, line)
					if success:
						cleared_count += 1
						_trace("Cleared breakpoint %s:%d from session %s" % [script_path, line, session_id])

		# Also try to clear any remaining breakpoints using direct methods
		_clear_all_native_breakpoints(session)

	return {
		"success": true,
		"cleared_breakpoints": old_breakpoints,
		"cleared_count": cleared_count
	}

# Execution control
func pause_execution() -> Dictionary:
	return _send_session_command("break", "Sent break command to debugger")

func resume_execution() -> Dictionary:
	return _send_session_command("continue", "Sent continue command to debugger")

func step_over() -> Dictionary:
	return _send_session_command("next", "Sent next (step over) command to debugger")

func step_into() -> Dictionary:
	return _send_session_command("step", "Sent step (step into) command to debugger")


# Call stack and inspection
func get_call_stack(session_id = null, timeout_ms: int = 750) -> Dictionary:
	var candidate_ids := _collect_session_candidate_ids(session_id)
	if candidate_ids.is_empty():
		return {
			"error": "session_not_found",
			"message": "No active debugger session available"
		}

	var last_error: Dictionary = {}
	for candidate in candidate_ids:
		var normalized_id = _normalize_session_id(candidate)
		if not _sync_tracked_session(normalized_id):
			if _resolve_session_index(normalized_id) < 0:
				last_error = {
					"error": "session_not_found",
					"session_id": normalized_id
				}
				continue
			_ensure_session_state(normalized_id, true)

		var session = _get_session_instance(normalized_id)
		if session == null or not session.is_active():
			last_error = {
				"error": "session_not_active",
				"session_id": normalized_id
			}
			continue

		var request_timestamp := Time.get_ticks_msec()
		session.send_message("get_stack_dump", [])

		var stack_info := await _wait_for_stack_dump(normalized_id, request_timestamp, timeout_ms)
		if stack_info.has("error"):
			last_error = stack_info
			continue

		return stack_info

	if last_error.is_empty():
		return {
			"error": "session_not_found",
			"message": "No debugger session responded"
		}
	return last_error

func get_cached_stack_info(session_id) -> Dictionary:
	var normalized_id = _normalize_session_id(session_id)
	if typeof(normalized_id) == TYPE_INT and normalized_id < 0:
		return {"error": "invalid_session"}
	if _session_stack_cache.has(normalized_id):
		return _session_stack_cache[normalized_id].duplicate(true)
	var stack_info := _update_session_stack_cache(normalized_id)
	if stack_info.has("error"):
		return stack_info
	return stack_info.duplicate(true)

func get_current_state() -> Dictionary:
	var active_sessions = _get_active_session_ids()
	var diagnostics := _collect_session_diagnostics(active_sessions)
	if active_sessions.is_empty():
		return {
			"active_sessions": [],
			"total_breakpoints": 0,
			"debugger_active": false,
			"diagnostics": diagnostics
		}

	var session_id = active_sessions[0]
	var state = _active_sessions.get(session_id, {})

	return {
		"active_sessions": active_sessions,
		"current_session_id": session_id,
		"total_breakpoints": _count_total_breakpoints(),
		"debugger_active": true,
		"paused": state.get("paused", false),
		"current_script": state.get("current_script", ""),
		"current_line": state.get("current_line", -1),
		"breakpoints": _breakpoints.duplicate(true),
		"diagnostics": diagnostics
	}

# Private methods
# All handlers below assume session_id has already been normalized.
func _handle_breakpoint_hit(session_id: int, event_data: Dictionary) -> void:
	var script_path = event_data.get("script_path", "")
	var line = event_data.get("line", -1)
	var stack_info = event_data.get("stack_info", {})
	var sanitized_stack := _update_session_stack_cache(session_id, stack_info)

	# Update session state
	_ensure_session_state(session_id, true)
	_active_sessions[session_id]["paused"] = true
	_active_sessions[session_id]["current_script"] = script_path
	_active_sessions[session_id]["current_line"] = line
	_session_stack_cache[session_id] = sanitized_stack.duplicate(true)

	# Throttle events if needed
	if not _should_send_event():
		return

	# Send to MCP client
	_send_debugger_event("breakpoint_hit", {
		"session_id": session_id,
		"script_path": script_path,
		"line": line,
		"stack_info": sanitized_stack
	})

	breakpoint_hit.emit(session_id, script_path, line, stack_info)

func _handle_execution_paused(session_id: int, event_data: Dictionary) -> void:
	var reason = event_data.get("reason", "unknown")

	_ensure_session_state(session_id, true)
	_active_sessions[session_id]["paused"] = true
	_update_session_stack_cache(session_id)

	if not _should_send_event():
		return

	_send_debugger_event("execution_paused", {
		"session_id": session_id,
		"reason": reason
	})

	execution_paused.emit(session_id, reason)

func _handle_execution_resumed(session_id: int) -> void:
	_ensure_session_state(session_id, true)
	_active_sessions[session_id]["paused"] = false
	_active_sessions[session_id]["current_script"] = ""
	_active_sessions[session_id]["current_line"] = -1
	_session_stack_cache.erase(session_id)

	if not _should_send_event():
		return

	_send_debugger_event("execution_resumed", {
		"session_id": session_id
	})

	execution_resumed.emit(session_id)

func _handle_stack_frame_changed(session_id: int, event_data: Dictionary) -> void:
	var frame_info = event_data.get("frame_info", {})

	if not _should_send_event():
		return

	_send_debugger_event("stack_frame_changed", {
		"session_id": session_id,
		"frame_info": frame_info
	})

	stack_frame_changed.emit(session_id, frame_info)

func _handle_stack_dump(session_id: int, event_data: Dictionary) -> void:
	var raw_frames = event_data.get("stack", event_data.get("frames", event_data.get("dump", [])))
	var structured_frames: Array = []

	if raw_frames is Array:
		for frame in raw_frames:
			if typeof(frame) == TYPE_DICTIONARY:
				structured_frames.append(frame.duplicate(true))
			elif frame is Array and frame.size() >= 3:
				var script_path = String(frame[0])
				var line_number = int(frame[1])
				var function_name = String(frame[2])
				structured_frames.append({
					"script": script_path,
					"file": script_path,
					"line": line_number,
					"function": function_name
				})
			else:
				structured_frames.append({"raw": frame})

	var stack_info := {
		"frames": structured_frames,
		"total_frames": structured_frames.size(),
		"current_frame": event_data.get("current_frame", 0)
	}

	if event_data.has("current_script"):
		stack_info["current_script"] = event_data["current_script"]
	if event_data.has("current_line"):
		stack_info["current_line"] = event_data["current_line"]

	_update_session_stack_cache(session_id, stack_info)

func _send_debugger_event(event_type: String, data: Dictionary) -> void:
	if _websocket_server and _current_client_id >= 0:
		var response = {
			"status": "event",
			"type": "debugger_event",
			"event": event_type,
			"data": data,
			"timestamp": Time.get_ticks_msec()
		}

		_websocket_server.send_response(_current_client_id, response)
		_trace("Sent debugger event: %s" % event_type)

func _should_send_event() -> bool:
	var current_time = Time.get_ticks_msec()
	if current_time - _last_event_time < EVENT_THROTTLE_MS:
		return false

	_last_event_time = current_time
	return true

func _sanitize_stack_info(stack_info: Dictionary) -> Dictionary:
	# Limit stack frames to prevent overwhelming the client
	var frames = stack_info.get("frames", [])
	if frames.size() > MAX_STACK_FRAMES:
		stack_info["frames"] = frames.slice(0, MAX_STACK_FRAMES)
		stack_info["truncated"] = true
		stack_info["total_frames"] = frames.size()

	return stack_info

func _update_session_stack_cache(session_id, stack_info = null) -> Dictionary:
	session_id = _normalize_session_id(session_id)
	var info: Dictionary
	if typeof(stack_info) == TYPE_DICTIONARY:
		info = stack_info.duplicate(true)
	else:
		info = _get_session_stack_info(session_id)
	if typeof(info) != TYPE_DICTIONARY:
		info = {}
	if info.has("error"):
		return info
	var sanitized := _sanitize_stack_info(info)
	sanitized["timestamp"] = Time.get_ticks_msec()
	sanitized["session_id"] = session_id
	_session_stack_cache[session_id] = sanitized.duplicate(true)
	return sanitized

func _wait_for_stack_dump(session_id, request_timestamp: int, timeout_ms: int) -> Dictionary:
	session_id = _normalize_session_id(session_id)
	var cached := _duplicate_stack_cache(session_id)
	if _stack_info_ready(cached, request_timestamp):
		return cached

	var loop := Engine.get_main_loop()
	if loop == null or not (loop is SceneTree):
		return {
			"error": "stack_dump_unavailable",
			"session_id": session_id,
			"message": "Editor tree unavailable while waiting for stack dump."
		}
	var tree: SceneTree = loop

	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() <= deadline:
		await tree.process_frame
		cached = _duplicate_stack_cache(session_id)
		if _stack_info_ready(cached, request_timestamp):
			return cached

	if not cached.is_empty():
		if cached.get("frames", []).is_empty():
			var fallback := _build_frames_from_debug_output()
			if not fallback.is_empty():
				fallback["timestamp"] = Time.get_ticks_msec()
				fallback["session_id"] = session_id
				fallback["warning"] = "stack_dump_timeout"
				_session_stack_cache[session_id] = fallback.duplicate(true)
				return fallback
		return cached

	var fallback_result := _build_frames_from_debug_output()
	if not fallback_result.is_empty():
		fallback_result["timestamp"] = Time.get_ticks_msec()
		fallback_result["session_id"] = session_id
		fallback_result["warning"] = "stack_dump_timeout"
		_session_stack_cache[session_id] = fallback_result.duplicate(true)
		return fallback_result

	return {
		"error": "stack_dump_timeout",
		"session_id": session_id,
		"message": "Timed out waiting for debugger stack dump."
	}

func _duplicate_stack_cache(session_id) -> Dictionary:
	session_id = _normalize_session_id(session_id)
	if not _session_stack_cache.has(session_id):
		return {}
	var cached = _session_stack_cache[session_id]
	if typeof(cached) != TYPE_DICTIONARY:
		return {}
	return cached.duplicate(true)

func _stack_info_ready(info: Dictionary, request_timestamp: int) -> bool:
	if info.is_empty():
		return false
	if info.has("error"):
		return true
	if not info.has("frames"):
		return false
	var frames = info.get("frames", [])
	if typeof(frames) != TYPE_ARRAY:
		return false
	var info_timestamp := int(info.get("timestamp", 0))
	if info_timestamp < request_timestamp:
		return false
	return true

func _count_total_breakpoints() -> int:
	var count = 0
	for script_breakpoints in _breakpoints.values():
		count += script_breakpoints.size()
	return count

func _collect_session_diagnostics(active_sessions: Array) -> Dictionary:
	var diagnostics := {
		"active_session_ids": active_sessions.duplicate(),
		"tracked_sessions": _active_sessions.keys(),
		"godot_session_objects": [],
		"godot_session_count": 0
	}

	var sessions := get_sessions()
	diagnostics["godot_session_count"] = sessions.size()

	for i in range(sessions.size()):
		var session = sessions[i]
		if not session:
			continue

		var session_id := i
		if session.has_method("get_session_id"):
			session_id = session.get_session_id()

		var session_info := {
			"id": session_id,
			"has_session": true,
			"active": session.has_method("is_active") and session.is_active(),
			"breaked": session.has_method("is_breaked") and session.is_breaked()
		}
		diagnostics["godot_session_objects"].append(session_info)
	return diagnostics

func _collect_tracked_session_breakpoints() -> Dictionary:
	var collected: Dictionary = {}

	for session_id in _session_breakpoints.keys():
		var session_breakpoints = _session_breakpoints[session_id]
		if typeof(session_breakpoints) != TYPE_DICTIONARY:
			continue
		_merge_breakpoint_map(collected, session_breakpoints)

	return collected

func _collect_active_session_breakpoints() -> Dictionary:
	var collected: Dictionary = {}
	var sessions := get_sessions()

	for i in range(sessions.size()):
		var session = sessions[i]
		if not session or not session.has_method("is_active") or not session.is_active():
			continue

		var session_breakpoints = null

		if session.has_method("get_breakpoints"):
			session_breakpoints = session.get_breakpoints()
		elif "breakpoints" in session and session.breakpoints and session.breakpoints.has_method("get_breakpoints"):
			session_breakpoints = session.breakpoints.get_breakpoints()

		if session_breakpoints != null:
			var normalized := _convert_breakpoint_payload(session_breakpoints)
			if not normalized.is_empty():
				_merge_breakpoint_map(collected, normalized)

	return collected

func _collect_editor_breakpoints() -> Dictionary:
	if not Engine.has_singleton("EditorInterface"):
		return {}

	var editor_interface = Engine.get_singleton("EditorInterface")
	if not editor_interface or not editor_interface.has_method("get_script_editor"):
		return {}

	var script_editor = editor_interface.get_script_editor()
	if not script_editor or not script_editor.has_method("get_breakpoints"):
		return {}

	var editor_breakpoints = script_editor.get_breakpoints()
	var normalized := _convert_breakpoint_payload(editor_breakpoints)

	return normalized

func _convert_breakpoint_payload(payload) -> Dictionary:
	var result: Dictionary = {}
	if payload == null:
		return result

	match typeof(payload):
		TYPE_DICTIONARY:
			for script_path in payload.keys():
				var line_values = payload[script_path]
				var normalized_lines := _normalize_breakpoint_lines(line_values)
				if normalized_lines.is_empty():
					continue
				result[script_path] = normalized_lines
		TYPE_ARRAY, TYPE_PACKED_STRING_ARRAY:
			for entry in payload:
				var parsed := _parse_breakpoint_entry(entry)
				if parsed.is_empty():
					continue
				var script_path: String = parsed.get("script_path", "")
				var line: int = parsed.get("line", -1)
				if script_path.is_empty() or line < 0:
					continue
				if not result.has(script_path):
					result[script_path] = []
				var lines: Array = result[script_path]
				if line not in lines:
					lines.append(line)
					lines.sort()
		_:
			if typeof(payload) == TYPE_STRING:
				var parsed := _parse_breakpoint_entry(payload)
				if parsed.is_empty():
					return result
				result[parsed["script_path"]] = [parsed["line"]]

	return result

func _parse_breakpoint_entry(entry) -> Dictionary:
	if typeof(entry) == TYPE_DICTIONARY:
		var script_path := ""
		if entry.has("script_path"):
			script_path = str(entry["script_path"])
		elif entry.has("source"):
			script_path = str(entry["source"])
		elif entry.has("script"):
			script_path = str(entry["script"])

		var line := -1
		if entry.has("line"):
			line = _parse_line_value(entry["line"])
		elif entry.has("line_number"):
			line = _parse_line_value(entry["line_number"])

		if script_path.is_empty() or line < 0:
			return {}

		return {
			"script_path": script_path,
			"line": line
		}

	if typeof(entry) == TYPE_ARRAY:
		if entry.size() >= 2:
			var script_path_entry = entry[0]
			var line_entry = entry[1]
			var script_path_value := str(script_path_entry)
			var line_value := _parse_line_value(line_entry)
			if not script_path_value.is_empty() and line_value >= 0:
				return {
					"script_path": script_path_value,
					"line": line_value
				}
		return {}

	if typeof(entry) == TYPE_STRING:
		return _parse_breakpoint_string(entry)

	if typeof(entry) == TYPE_INT:
		return {}

	return {}

func _parse_breakpoint_string(entry: String) -> Dictionary:
	var separator_index := entry.rfind(":")
	if separator_index == -1:
		return {}

	var script_path := entry.substr(0, separator_index).strip_edges()
	var line_str := entry.substr(separator_index + 1, entry.length()).strip_edges()

	if script_path.is_empty() or not line_str.is_valid_int():
		return {}

	return {
		"script_path": script_path,
		"line": int(line_str)
	}

func _parse_line_value(value) -> int:
	if value == null:
		return -1

	match typeof(value):
		TYPE_INT:
			return value
		TYPE_FLOAT:
			return int(value)
		TYPE_STRING, TYPE_STRING_NAME:
			var text_value := str(value)
			if text_value.is_valid_int():
				return int(text_value)
			return -1
		_:
			var text_value := str(value)
			if text_value.is_valid_int():
				return int(text_value)
			return -1

func _normalize_breakpoint_lines(line_values) -> Array:
	var result: Array = []

	if line_values == null:
		return result

	match typeof(line_values):
		TYPE_ARRAY:
			for value in line_values:
				var parsed_line := _parse_line_value(value)
				if parsed_line >= 0 and parsed_line not in result:
					result.append(parsed_line)
		TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY:
			for value in line_values:
				var parsed_line := _parse_line_value(value)
				if parsed_line >= 0 and parsed_line not in result:
					result.append(parsed_line)
		TYPE_INT:
			if line_values >= 0:
				result.append(line_values)
		TYPE_STRING, TYPE_STRING_NAME:
			var parsed_line := _parse_line_value(line_values)
			if parsed_line >= 0 and parsed_line not in result:
				result.append(parsed_line)
		_:
			if typeof(line_values) == TYPE_DICTIONARY:
				for key in line_values.keys():
					var parsed_line := _parse_line_value(line_values[key])
					if parsed_line >= 0 and parsed_line not in result:
						result.append(parsed_line)

	result.sort()
	return result

func _merge_breakpoint_map(target: Dictionary, source: Dictionary) -> void:
	for script_path in source.keys():
		var source_lines = source[script_path]
		var normalized_lines := _normalize_breakpoint_lines(source_lines)
		if normalized_lines.is_empty():
			continue

		if not target.has(script_path):
			target[script_path] = []

		var target_lines: Array = target[script_path]
		for line in normalized_lines:
			if line not in target_lines:
				target_lines.append(line)

		target_lines.sort()
		target[script_path] = target_lines

func _get_active_session_ids() -> Array:
	var result: Array = []
	var sessions := get_sessions()

	for i in range(sessions.size()):
		var session = sessions[i]
		if not session:
			continue

		var session_id_value := i
		if session.has_method("get_session_id"):
			session_id_value = session.get_session_id()

		var session_id = _normalize_session_id(session_id_value)

		var session_active: bool = session.has_method("is_active") and session.is_active()
		var session_breaked: bool = session.has_method("is_breaked") and session.is_breaked()

		if session_active or session_breaked:
			_ensure_session_state(session_id, true)
			if session_breaked:
				_active_sessions[session_id]["paused"] = true
			if session_id not in result:
				result.append(session_id)

	# Fallback to tracked sessions when Godot doesn't report them via get_sessions().
	for session_key in _active_sessions.keys():
		var session_id = _normalize_session_id(session_key)
		var state: Dictionary = _active_sessions[session_key]
		if state.get("active", false) or state.get("paused", false):
			if session_id not in result:
				result.append(session_id)

	return result

func _on_session_started(session_id: int) -> void:
	session_id = _normalize_session_id(session_id)
	_ensure_session_state(session_id, true)
	_trace("Debugger session %s started" % session_id)
	# Restore any existing breakpoints for this session
	_setup_session_breakpoints(session_id)

func _on_session_stopped(session_id: int) -> void:
	session_id = _normalize_session_id(session_id)
	_ensure_session_state(session_id)
	_active_sessions[session_id]["active"] = false
	_active_sessions[session_id]["paused"] = false
	_session_stack_cache.erase(session_id)
	_trace("Debugger session %s stopped" % session_id)

func _on_session_breaked(can_debug: bool, session_id: int) -> void:
	session_id = _normalize_session_id(session_id)
	_ensure_session_state(session_id)
	_active_sessions[session_id]["paused"] = can_debug
	_trace("Debugger session %s breaked, can_debug=%s" % [session_id, can_debug])

# Native breakpoint integration
func _set_native_breakpoint(session: EditorDebuggerSession, script_path: String, line: int) -> bool:
	# Try different approaches to set breakpoints in Godot's debugger system

	# Method 1: Try to use the session's breakpoint methods directly
	if session and session.has_method("breakpoints"):
		var breakpoints = session.breakpoints
		if breakpoints.has_method("set_line_breakpoint"):
			# This might be the correct method for setting breakpoints
			breakpoints.set_line_breakpoint(script_path, line)
			_trace("Set breakpoint using session.breakpoints.set_line_breakpoint: %s:%d" % [script_path, line])
			return true
		elif breakpoints.has_method("add_breakpoint"):
			breakpoints.add_breakpoint(script_path, line)
			_trace("Set breakpoint using session.breakpoints.add_breakpoint: %s:%d" % [script_path, line])
			return true

	# Method 2: Try direct session methods
	if session and session.has_method("set_breakpoint"):
		# Try different parameter formats for set_breakpoint
		# Based on error, Godot expects exactly 3 arguments with String first
		var attempts = [
			[script_path, line, true],   # script_path, line, enabled (most likely correct)
			[script_path, line, 1],      # script_path, line, enabled (as int)
		]

		for attempt in attempts:
			# Use callv to safely call with parameter array
			var result = session.callv("set_breakpoint", attempt)
			_trace("Set breakpoint using session.set_breakpoint with params %s: %s:%d" % [attempt, script_path, line])
			return true

	# Method 3: Try standard Godot debugger protocol
	if session and session.has_method("send_message"):
		# Try different message formats that Godot might understand
		# Using the format from DEBUGGER_FIX_GUIDE.md
		var attempts = [
			["breakpoint:insert", [{"script_path": script_path, "line": line, "enabled": true}]],
			["breakpoint:insert", [{"source": script_path, "line": line, "enabled": true}]],
			["breakpoint:set", [{"script": script_path, "line": line, "enabled": true}]],
			["debugger:breakpoint", [{"script_path": script_path, "line": line, "enabled": true}]]
		]

		for attempt in attempts:
			session.send_message(attempt[0], attempt[1])
			_trace("Attempted breakpoint set with format %s: %s:%d" % [attempt[0], script_path, line])

		return true

	return false

func _clear_all_native_breakpoints(session: EditorDebuggerSession) -> void:
	_trace("Attempting to clear all native breakpoints from session")

	# Method 1: Try to access and clear breakpoints through the session object
	if session and session.has_method("get_breakpoints"):
		var current_breakpoints = session.get_breakpoints()
		_trace("Current breakpoints from session before clear: %s" % current_breakpoints)

		if current_breakpoints and current_breakpoints is Dictionary:
			# Try to clear using session methods
			if session.has_method("clear_breakpoints"):
				session.clear_breakpoints()
				_trace("Called session.clear_breakpoints()")
			elif session.get("breakpoints") and session.breakpoints.has_method("clear"):
				session.breakpoints.clear()
				_trace("Called session.breakpoints.clear()")

	# Method 2: Try different clear message formats
	if session and session.has_method("send_message"):
		var clear_attempts = [
			["breakpoint:clear_all", []],
			["breakpoint:clear", []],
			["debugger:clear_breakpoints", []],
			["debugger:breakpoints_clear", []]
		]

		for attempt in clear_attempts:
			session.send_message(attempt[0], attempt[1])
			_trace("Sent clear breakpoints message: %s" % attempt[0])

func _remove_native_breakpoint(session: EditorDebuggerSession, script_path: String, line: int) -> bool:
	# Try different approaches to remove breakpoints in Godot's debugger system
	_trace("Attempting to remove breakpoint at %s:%d" % [script_path, line])

	# Method 1: Try the direct message approach with "breakpoint:remove" first (most reliable)
	if session and session.has_method("send_message"):
		# Try different message formats that Godot might understand for removal
		var attempts = [
			["breakpoint:remove", [{"source": script_path, "line": line}]],
			["breakpoint:remove", [{"script_path": script_path, "line": line}]],
			["breakpoint:remove", [{"script": script_path, "line": line}]],
			["debugger:breakpoint_remove", [{"script_path": script_path, "line": line}]]
		]

		for attempt in attempts:
			session.send_message(attempt[0], attempt[1])
			_trace("Sent breakpoint removal message %s for %s:%d" % [attempt[0], script_path, line])

	# Method 2: Try to use the session's breakpoint methods directly
	if session and session.has_method("set_breakpoint"):
		# Some versions of Godot might support setting breakpoints with enabled=false to remove them
		var attempts = [
			[script_path, line, false],   # script_path, line, enabled=false
			[script_path, line, 0],      # script_path, line, enabled=0
		]

		for attempt in attempts:
			var result = session.callv("set_breakpoint", attempt)
			_trace("Attempted removal using set_breakpoint with params %s: %s:%d" % [attempt, script_path, line])

	# Method 3: Try using the breakpoints object if it exists
	if session and session.get("breakpoints"):
		var breakpoints = session.breakpoints
		_trace("Accessing session.breakpoints property: %s" % breakpoints)

		if breakpoints:
			# Try to get current breakpoints and rebuild without the target line
			var current_breakpoints = session.get_breakpoints()
			_trace("Current breakpoints from session: %s" % current_breakpoints)

			if current_breakpoints and current_breakpoints is Dictionary:
				if current_breakpoints.has(script_path):
					var script_bps = current_breakpoints[script_path]
					if script_bps is Array:
						# Remove the target line if it exists
						var new_bps = []
						var found_and_removed = false
						for bp_line in script_bps:
							if bp_line != line:
								new_bps.append(bp_line)
							else:
								found_and_removed = true

						if found_and_removed:
							# Update the breakpoints array
							current_breakpoints[script_path] = new_bps
							_trace("Removed line %d from breakpoints for %s, new list: %s" % [line, script_path, new_bps])

							# Try to clear and re-set all breakpoints
							if breakpoints.has_method("clear"):
								breakpoints.clear()
								_trace("Cleared all breakpoints, will re-add")

								# Re-add all remaining breakpoints
								for sp in current_breakpoints:
									var bps = current_breakpoints[sp]
									if bps is Array:
										for bp_line in bps:
											_set_native_breakpoint(session, sp, bp_line)
								return true

	# Method 4: Last resort - try to access EditorInterface and modify breakpoints directly
	if Engine.has_singleton("EditorInterface"):
		var editor_interface = Engine.get_singleton("EditorInterface")
		if editor_interface and editor_interface.has_method("get_script_editor"):
			var script_editor = editor_interface.get_script_editor()
			if script_editor and script_editor.has_method("get_current_script"):
				# Try to find and remove the breakpoint through the script editor
				_trace("Attempting to remove breakpoint through script editor interface")
				# This is a fallback method and may not work in all Godot versions

	_trace("All breakpoint removal methods attempted for %s:%d" % [script_path, line])
	return true  # Return true to indicate we attempted removal

func _get_session_stack_info(session_id) -> Dictionary:
	session_id = _normalize_session_id(session_id)
	var session = _get_session_instance(session_id)
	if not session or not session.is_active():
		return {"frames": [], "total_frames": 0}

	# Try to get stack info from the session
	var stack_frames := []

	# Method 1: Try to get stack via send_message and wait for response
	if session.has_method("send_message"):
		session.send_message("get_stack_dump", [])

		# Note: This is async - we'll need to handle the response in the capture method
		# For now, return basic info
		var current_script = _active_sessions.get(session_id, {}).get("current_script", "")
		var current_line = _active_sessions.get(session_id, {}).get("current_line", -1)

		if not current_script.is_empty() and current_line >= 0:
			var frame_info := {
				"script": current_script,
				"line": current_line,
				"function": "_process",
				"file": current_script
			}
			stack_frames.append(frame_info)

	return {
		"frames": stack_frames,
		"total_frames": stack_frames.size(),
		"current_frame": 0
	}

func _setup_session_breakpoints(session_id) -> void:
	session_id = _normalize_session_id(session_id)
	# When a new session starts, set up all existing breakpoints for it
	if not _session_breakpoints.has(session_id):
		return

	var session = _get_session_instance(session_id)
	if not session or not session.is_active():
		return

	var session_bps = _session_breakpoints[session_id]
	for script_path in session_bps:
		for line in session_bps[script_path]:
			_set_native_breakpoint(session, script_path, line)
			_trace("Restored breakpoint %s:%d for session %s" % [script_path, line, session_id])

func _diagnose_session_capabilities(session: EditorDebuggerSession) -> void:
	_trace("=== EditorDebuggerSession Capabilities ===")
	_trace("Session type: %s" % session.get_class())
	_trace("Session active: %s" % session.is_active())

	# List all available methods
	var methods = session.get_method_list()
	_trace("Available methods:")
	for method in methods:
		_trace("  - %s" % method.name)

	# Check for breakpoint-related properties
	if session.has_method("get_property_list"):
		var props = session.get_property_list()
		_trace("Available properties:")
		for prop in props:
			if prop is Dictionary and prop.has("name"):
				var prop_name = prop["name"]
				if "breakpoint" in prop_name.to_lower() or "debug" in prop_name.to_lower():
					_trace("  - %s: %s" % [prop_name, prop.get("type", "unknown")])

	# Try to access breakpoints property if it exists
	if "breakpoints" in session:
		var breakpoints = session.breakpoints
		_trace("Breakpoints property type: %s" % breakpoints.get_class())
		if breakpoints.has_method("get_method_list"):
			var bp_methods = breakpoints.get_method_list()
			_trace("Breakpoints methods:")
			for method in bp_methods:
				_trace("  - %s" % method.name)

	_trace("=== End Capabilities ===")

func _trace(text: String) -> void:
	if OS.is_stdout_verbose():
		print("[MCPDebugger] %s" % text)

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
	var publisher = _get_debug_output_publisher()
	if publisher == null or not publisher.has_method("get_full_log_text"):
		return []
	var text = publisher.get_full_log_text()
	if text.is_empty():
		return []
	var lines = text.split("\n", false)
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

func _get_debug_output_publisher():
	if Engine.has_meta("MCPDebugOutputPublisher"):
		return Engine.get_meta("MCPDebugOutputPublisher")
	return null
