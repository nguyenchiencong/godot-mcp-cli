@tool
class_name MCPInputCommands
extends MCPBaseCommandProcessor

## Command processor for input simulation in running games.
## Sends input commands through the debugger bridge to the runtime input handler.

const INPUT_CAPTURE_NAME := "mcp_input"
const DEFAULT_TIMEOUT_MS := 2000

var _next_request_id: int = 1
var _pending_requests: Dictionary = {}

func _get_runtime_bridge() -> MCPRuntimeDebuggerBridge:
	if Engine.has_meta("MCPRuntimeDebuggerBridge"):
		return Engine.get_meta("MCPRuntimeDebuggerBridge") as MCPRuntimeDebuggerBridge
	return null


func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"simulate_action_press":
			_handle_action_press(client_id, params, command_id)
			return true
		"simulate_action_release":
			_handle_action_release(client_id, params, command_id)
			return true
		"simulate_action_tap":
			_handle_action_tap(client_id, params, command_id)
			return true
		"simulate_mouse_click":
			_handle_mouse_click(client_id, params, command_id)
			return true
		"simulate_mouse_move":
			_handle_mouse_move(client_id, params, command_id)
			return true
		"simulate_drag":
			_handle_drag(client_id, params, command_id)
			return true
		"simulate_key_press":
			_handle_key_press(client_id, params, command_id)
			return true
		"simulate_input_sequence":
			_handle_input_sequence(client_id, params, command_id)
			return true
		"get_input_actions":
			_handle_get_input_actions(client_id, params, command_id)
			return true
	
	return false


func _handle_action_press(client_id: int, params: Dictionary, command_id: String) -> void:
	var action := str(params.get("action", ""))
	if action.is_empty():
		_send_error(client_id, "Action name is required", command_id)
		return
	
	var strength := float(params.get("strength", 1.0))
	
	var result := await _send_input_command("action_press", [action, strength])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_action_release(client_id: int, params: Dictionary, command_id: String) -> void:
	var action := str(params.get("action", ""))
	if action.is_empty():
		_send_error(client_id, "Action name is required", command_id)
		return
	
	var result := await _send_input_command("action_release", [action])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_action_tap(client_id: int, params: Dictionary, command_id: String) -> void:
	var action := str(params.get("action", ""))
	if action.is_empty():
		_send_error(client_id, "Action name is required", command_id)
		return
	
	var duration_ms := int(params.get("duration_ms", 100))
	
	var result := await _send_input_command("action_tap", [action, duration_ms])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_mouse_click(client_id: int, params: Dictionary, command_id: String) -> void:
	var x := float(params.get("x", 0))
	var y := float(params.get("y", 0))
	var button_str := str(params.get("button", "left")).to_lower()
	var double_click := bool(params.get("double_click", false))
	
	var button := MOUSE_BUTTON_LEFT
	match button_str:
		"right":
			button = MOUSE_BUTTON_RIGHT
		"middle":
			button = MOUSE_BUTTON_MIDDLE
	
	var options := {
		"x": x,
		"y": y,
		"button": button,
		"double_click": double_click
	}
	
	var result := await _send_input_command("mouse_click", [options])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_mouse_move(client_id: int, params: Dictionary, command_id: String) -> void:
	var x := float(params.get("x", 0))
	var y := float(params.get("y", 0))
	
	var options := {
		"x": x,
		"y": y
	}
	
	var result := await _send_input_command("mouse_move", [options])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_drag(client_id: int, params: Dictionary, command_id: String) -> void:
	var start_x := float(params.get("start_x", 0))
	var start_y := float(params.get("start_y", 0))
	var end_x := float(params.get("end_x", 0))
	var end_y := float(params.get("end_y", 0))
	var duration_ms := int(params.get("duration_ms", 200))
	var steps := int(params.get("steps", 10))
	
	var button_str := str(params.get("button", "left")).to_lower()
	var button := MOUSE_BUTTON_LEFT
	match button_str:
		"right":
			button = MOUSE_BUTTON_RIGHT
		"middle":
			button = MOUSE_BUTTON_MIDDLE
	
	var options := {
		"start_x": start_x,
		"start_y": start_y,
		"end_x": end_x,
		"end_y": end_y,
		"duration_ms": duration_ms,
		"steps": steps,
		"button": button
	}
	
	# Drag operations can take longer, adjust timeout
	var timeout := duration_ms + 1000
	
	var result := await _send_input_command("drag", [options], timeout)
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_key_press(client_id: int, params: Dictionary, command_id: String) -> void:
	var key := str(params.get("key", ""))
	if key.is_empty():
		_send_error(client_id, "Key is required", command_id)
		return
	
	var duration_ms := int(params.get("duration_ms", 100))
	var modifiers := params.get("modifiers", {})
	if typeof(modifiers) != TYPE_DICTIONARY:
		modifiers = {}
	
	var options := {
		"key": key,
		"duration_ms": duration_ms,
		"modifiers": modifiers
	}
	
	var result := await _send_input_command("key_press", [options])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_input_sequence(client_id: int, params: Dictionary, command_id: String) -> void:
	var sequence := params.get("sequence", [])
	if typeof(sequence) != TYPE_ARRAY:
		_send_error(client_id, "Sequence must be an array", command_id)
		return
	
	if sequence.is_empty():
		_send_error(client_id, "Sequence cannot be empty", command_id)
		return
	
	# Calculate timeout based on sequence length and potential wait times
	var total_wait := 0
	for step in sequence:
		if typeof(step) == TYPE_DICTIONARY:
			total_wait += int(step.get("duration_ms", 100))
	var timeout := total_wait + 2000
	
	var result := await _send_input_command("input_sequence", [sequence], timeout)
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _handle_get_input_actions(client_id: int, _params: Dictionary, command_id: String) -> void:
	var result := await _send_input_command("get_input_actions", [])
	if result.has("error"):
		_send_error(client_id, result["error"], command_id)
	else:
		_send_success(client_id, result, command_id)


func _send_input_command(action: String, data: Array, timeout_ms: int = DEFAULT_TIMEOUT_MS) -> Dictionary:
	var runtime_bridge := _get_runtime_bridge()
	if runtime_bridge == null:
		return { "error": "Runtime debugger bridge not available. Ensure the project is running." }
	
	# Get active session
	var sessions := runtime_bridge.get_sessions()
	var active_session = null
	var session_id := -1
	
	for i in range(sessions.size()):
		var session = sessions[i]
		if session and session.has_method("is_active") and session.is_active():
			active_session = session
			session_id = i
			break
	
	if active_session == null:
		return { "error": "No active runtime session. Start the project with debugger attached." }
	
	# Generate request ID
	var request_id := _next_request_id
	_next_request_id += 1
	
	# Prepare payload - prepend request_id to data
	var payload := Array()
	payload.append(request_id)
	for item in data:
		payload.append(item)
	
	# Store pending request
	_pending_requests[request_id] = {
		"session_id": session_id,
		"action": action,
		"timestamp": Time.get_ticks_msec()
	}
	
	# Send message to runtime
	var message_name := "%s:%s" % [INPUT_CAPTURE_NAME, action]
	active_session.send_message(message_name, payload)
	
	# Wait for response with timeout
	var deadline := Time.get_ticks_msec() + timeout_ms
	var result: Dictionary = {}
	
	while Time.get_ticks_msec() < deadline:
		# Check if we have a result
		if _has_input_result(session_id, request_id):
			result = _take_input_result(session_id, request_id)
			break
		
		# Wait a frame
		if get_tree():
			await get_tree().process_frame
		else:
			break
	
	# Clean up pending request
	_pending_requests.erase(request_id)
	
	if result.is_empty():
		return { "error": "Input command timed out. Ensure the game has the MCP input handler autoload." }
	
	return result


func _has_input_result(session_id: int, request_id: int) -> bool:
	var runtime_bridge := _get_runtime_bridge()
	if runtime_bridge == null:
		return false
	
	# Check if runtime bridge has input results
	if runtime_bridge.has_method("has_input_result"):
		return runtime_bridge.has_input_result(session_id, request_id)
	
	# Fallback: check _sessions directly if accessible
	var sessions_dict = runtime_bridge.get("_sessions")
	if sessions_dict and sessions_dict.has(session_id):
		var state: Dictionary = sessions_dict[session_id]
		var input_results: Dictionary = state.get("input_results", {})
		return input_results.has(request_id)
	
	return false


func _take_input_result(session_id: int, request_id: int) -> Dictionary:
	var runtime_bridge := _get_runtime_bridge()
	if runtime_bridge == null:
		return {}
	
	# Check if runtime bridge has take method
	if runtime_bridge.has_method("take_input_result"):
		return runtime_bridge.take_input_result(session_id, request_id)
	
	# Fallback: access _sessions directly if accessible
	var sessions_dict = runtime_bridge.get("_sessions")
	if sessions_dict and sessions_dict.has(session_id):
		var state: Dictionary = sessions_dict[session_id]
		var input_results: Dictionary = state.get("input_results", {})
		if input_results.has(request_id):
			var result: Dictionary = input_results[request_id]
			input_results.erase(request_id)
			state["input_results"] = input_results
			sessions_dict[session_id] = state
			return result
	
	return {}
