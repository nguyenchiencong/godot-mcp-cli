extends Node
## Runtime input handler for MCP input simulation.
## This script runs inside the game (not the editor) and handles input injection
## via the debugger message system.

const CAPTURE_NAME := "mcp_input"

var _pending_drags: Dictionary = {}

func _ready() -> void:
	# Only register in running game, not in editor
	if Engine.is_editor_hint():
		return
	
	if not EngineDebugger.is_active():
		print("[MCP Input Handler] Debugger not active, input simulation unavailable")
		return
	
	EngineDebugger.register_message_capture(CAPTURE_NAME, _on_capture)
	print("[MCP Input Handler] Input simulation ready")


func _on_capture(message: String, data: Array) -> bool:
	var action := message.substr(CAPTURE_NAME.length() + 1) if message.begins_with(CAPTURE_NAME + ":") else message
	
	match action:
		"action_press":
			return _handle_action_press(data)
		"action_release":
			return _handle_action_release(data)
		"action_tap":
			return _handle_action_tap(data)
		"mouse_click":
			return _handle_mouse_click(data)
		"mouse_move":
			return _handle_mouse_move(data)
		"drag":
			return _handle_drag(data)
		"key_press":
			return _handle_key_press(data)
		"input_sequence":
			return _handle_input_sequence(data)
		"get_input_actions":
			return _handle_get_input_actions(data)
	
	return false


func _handle_action_press(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var action_name := str(data[1])
	var strength := float(data[2]) if data.size() > 2 else 1.0
	
	if not InputMap.has_action(action_name):
		_send_result(request_id, {
			"success": false,
			"error": "Unknown action: %s" % action_name
		})
		return true
	
	Input.action_press(action_name, strength)
	_send_result(request_id, {
		"success": true,
		"action": action_name,
		"type": "press",
		"strength": strength
	})
	return true


func _handle_action_release(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var action_name := str(data[1])
	
	if not InputMap.has_action(action_name):
		_send_result(request_id, {
			"success": false,
			"error": "Unknown action: %s" % action_name
		})
		return true
	
	Input.action_release(action_name)
	_send_result(request_id, {
		"success": true,
		"action": action_name,
		"type": "release"
	})
	return true


func _handle_action_tap(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var action_name := str(data[1])
	var duration_ms := int(data[2]) if data.size() > 2 else 100
	
	if not InputMap.has_action(action_name):
		_send_result(request_id, {
			"success": false,
			"error": "Unknown action: %s" % action_name
		})
		return true
	
	# Execute tap asynchronously
	_execute_tap(request_id, action_name, duration_ms)
	return true


func _execute_tap(request_id: int, action_name: String, duration_ms: int) -> void:
	Input.action_press(action_name)
	var tree := get_tree()
	if tree:
		await tree.create_timer(float(duration_ms) / 1000.0).timeout
	Input.action_release(action_name)
	
	_send_result(request_id, {
		"success": true,
		"action": action_name,
		"type": "tap",
		"duration_ms": duration_ms
	})


func _handle_mouse_click(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var options := data[1] as Dictionary if typeof(data[1]) == TYPE_DICTIONARY else {}
	
	var position := Vector2(
		float(options.get("x", 0)),
		float(options.get("y", 0))
	)
	var button := int(options.get("button", MOUSE_BUTTON_LEFT))
	var double_click := bool(options.get("double_click", false))
	
	# Execute click asynchronously
	_execute_mouse_click(request_id, position, button, double_click)
	return true


func _execute_mouse_click(request_id: int, position: Vector2, button: int, double_click: bool) -> void:
	var event := InputEventMouseButton.new()
	event.position = position
	event.global_position = position
	event.button_index = button
	event.pressed = true
	event.double_click = double_click
	
	Input.parse_input_event(event)
	
	# Release after a frame
	var tree := get_tree()
	if tree:
		await tree.process_frame
	
	event = InputEventMouseButton.new()
	event.position = position
	event.global_position = position
	event.button_index = button
	event.pressed = false
	Input.parse_input_event(event)
	
	_send_result(request_id, {
		"success": true,
		"type": "mouse_click",
		"position": [position.x, position.y],
		"button": button,
		"double_click": double_click
	})


func _handle_mouse_move(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var options := data[1] as Dictionary if typeof(data[1]) == TYPE_DICTIONARY else {}
	
	var position := Vector2(
		float(options.get("x", 0)),
		float(options.get("y", 0))
	)
	
	var event := InputEventMouseMotion.new()
	event.position = position
	event.global_position = position
	Input.parse_input_event(event)
	
	# Also warp mouse to ensure cursor position updates
	Input.warp_mouse(position)
	
	_send_result(request_id, {
		"success": true,
		"type": "mouse_move",
		"position": [position.x, position.y]
	})
	return true


func _handle_drag(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var options := data[1] as Dictionary if typeof(data[1]) == TYPE_DICTIONARY else {}
	
	var start := Vector2(
		float(options.get("start_x", 0)),
		float(options.get("start_y", 0))
	)
	var end_pos := Vector2(
		float(options.get("end_x", 0)),
		float(options.get("end_y", 0))
	)
	var duration_ms := int(options.get("duration_ms", 200))
	var steps := int(options.get("steps", 10))
	var button := int(options.get("button", MOUSE_BUTTON_LEFT))
	
	# Execute drag asynchronously
	_execute_drag(request_id, start, end_pos, duration_ms, steps, button)
	return true


func _execute_drag(request_id: int, start: Vector2, end_pos: Vector2, duration_ms: int, steps: int, button: int) -> void:
	var duration := float(duration_ms) / 1000.0
	var step_delay := duration / float(steps)
	var tree := get_tree()
	
	# Move to start position first
	Input.warp_mouse(start)
	if tree:
		await tree.process_frame
	
	# Press at start position
	var press_event := InputEventMouseButton.new()
	press_event.position = start
	press_event.global_position = start
	press_event.button_index = button
	press_event.pressed = true
	Input.parse_input_event(press_event)
	
	# Move in interpolated steps
	var prev_pos := start
	for i in range(steps):
		var t := float(i + 1) / float(steps)
		var pos := start.lerp(end_pos, t)
		
		var motion := InputEventMouseMotion.new()
		motion.position = pos
		motion.global_position = pos
		motion.relative = pos - prev_pos
		Input.parse_input_event(motion)
		Input.warp_mouse(pos)
		
		prev_pos = pos
		if tree:
			await tree.create_timer(step_delay).timeout
	
	# Release at end position
	var release_event := InputEventMouseButton.new()
	release_event.position = end_pos
	release_event.global_position = end_pos
	release_event.button_index = button
	release_event.pressed = false
	Input.parse_input_event(release_event)
	
	_send_result(request_id, {
		"success": true,
		"type": "drag",
		"start": [start.x, start.y],
		"end": [end_pos.x, end_pos.y],
		"duration_ms": duration_ms,
		"steps": steps
	})


func _handle_key_press(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var options := data[1] as Dictionary if typeof(data[1]) == TYPE_DICTIONARY else {}
	
	var key_string := str(options.get("key", ""))
	var duration_ms := int(options.get("duration_ms", 100))
	var modifiers := options.get("modifiers", {}) as Dictionary
	
	# Convert key string to keycode
	var keycode := _string_to_keycode(key_string)
	if keycode == KEY_NONE:
		_send_result(request_id, {
			"success": false,
			"error": "Unknown key: %s" % key_string
		})
		return true
	
	# Execute key press asynchronously
	_execute_key_press(request_id, keycode, key_string, duration_ms, modifiers)
	return true


func _execute_key_press(request_id: int, keycode: int, key_string: String, duration_ms: int, modifiers: Dictionary) -> void:
	var event := InputEventKey.new()
	event.keycode = keycode
	event.physical_keycode = keycode
	event.pressed = true
	event.shift_pressed = bool(modifiers.get("shift", false))
	event.ctrl_pressed = bool(modifiers.get("ctrl", false))
	event.alt_pressed = bool(modifiers.get("alt", false))
	event.meta_pressed = bool(modifiers.get("meta", false))
	
	Input.parse_input_event(event)
	
	var tree := get_tree()
	if tree:
		await tree.create_timer(float(duration_ms) / 1000.0).timeout
	
	event = InputEventKey.new()
	event.keycode = keycode
	event.physical_keycode = keycode
	event.pressed = false
	event.shift_pressed = bool(modifiers.get("shift", false))
	event.ctrl_pressed = bool(modifiers.get("ctrl", false))
	event.alt_pressed = bool(modifiers.get("alt", false))
	event.meta_pressed = bool(modifiers.get("meta", false))
	
	Input.parse_input_event(event)
	
	_send_result(request_id, {
		"success": true,
		"type": "key_press",
		"key": key_string,
		"duration_ms": duration_ms
	})


func _handle_input_sequence(data: Array) -> bool:
	if data.size() < 2:
		return false
	
	var request_id := int(data[0])
	var sequence := data[1] as Array if typeof(data[1]) == TYPE_ARRAY else []
	
	# Execute sequence asynchronously
	_execute_input_sequence(request_id, sequence)
	return true


func _execute_input_sequence(request_id: int, sequence: Array) -> void:
	var results := []
	var errors := []
	var tree := get_tree()
	
	for step in sequence:
		if typeof(step) != TYPE_DICTIONARY:
			continue
		
		var step_dict := step as Dictionary
		var step_type := str(step_dict.get("type", ""))
		var step_result := {}
		
		match step_type:
			"press":
				var action := str(step_dict.get("action", ""))
				var strength := float(step_dict.get("strength", 1.0))
				if InputMap.has_action(action):
					Input.action_press(action, strength)
					step_result = { "type": "press", "action": action, "success": true }
				else:
					step_result = { "type": "press", "action": action, "success": false, "error": "Unknown action" }
					errors.append("Unknown action: %s" % action)
			
			"release":
				var action := str(step_dict.get("action", ""))
				if InputMap.has_action(action):
					Input.action_release(action)
					step_result = { "type": "release", "action": action, "success": true }
				else:
					step_result = { "type": "release", "action": action, "success": false, "error": "Unknown action" }
					errors.append("Unknown action: %s" % action)
			
			"tap":
				var action := str(step_dict.get("action", ""))
				var duration := float(step_dict.get("duration_ms", 100)) / 1000.0
				if InputMap.has_action(action):
					Input.action_press(action)
					if tree:
						await tree.create_timer(duration).timeout
					Input.action_release(action)
					step_result = { "type": "tap", "action": action, "success": true }
				else:
					step_result = { "type": "tap", "action": action, "success": false, "error": "Unknown action" }
					errors.append("Unknown action: %s" % action)
			
			"wait":
				var duration := float(step_dict.get("duration_ms", 100)) / 1000.0
				if tree:
					await tree.create_timer(duration).timeout
				step_result = { "type": "wait", "duration_ms": step_dict.get("duration_ms", 100), "success": true }
			
			"click":
				var pos := Vector2(
					float(step_dict.get("x", 0)),
					float(step_dict.get("y", 0))
				)
				var btn := int(step_dict.get("button", MOUSE_BUTTON_LEFT))
				
				var click_event := InputEventMouseButton.new()
				click_event.position = pos
				click_event.global_position = pos
				click_event.button_index = btn
				click_event.pressed = true
				Input.parse_input_event(click_event)
				
				if tree:
					await tree.process_frame
				
				click_event = InputEventMouseButton.new()
				click_event.position = pos
				click_event.global_position = pos
				click_event.button_index = btn
				click_event.pressed = false
				Input.parse_input_event(click_event)
				
				step_result = { "type": "click", "position": [pos.x, pos.y], "success": true }
			
			_:
				step_result = { "type": step_type, "success": false, "error": "Unknown step type" }
				errors.append("Unknown step type: %s" % step_type)
		
		results.append(step_result)
	
	_send_result(request_id, {
		"success": errors.is_empty(),
		"type": "sequence",
		"steps_executed": results.size(),
		"results": results,
		"errors": errors
	})


func _handle_get_input_actions(data: Array) -> bool:
	var request_id := int(data[0]) if data.size() > 0 else 0
	
	var actions := InputMap.get_actions()
	var action_list := []
	
	for action in actions:
		var action_name := str(action)
		# Skip built-in UI actions if they start with "ui_" for cleaner output
		var events := InputMap.action_get_events(action_name)
		var event_strings := []
		
		for event in events:
			if event is InputEventKey:
				event_strings.append("Key: %s" % OS.get_keycode_string(event.keycode))
			elif event is InputEventMouseButton:
				event_strings.append("Mouse: Button %d" % event.button_index)
			elif event is InputEventJoypadButton:
				event_strings.append("Joypad: Button %d" % event.button_index)
			elif event is InputEventJoypadMotion:
				event_strings.append("Joypad: Axis %d" % event.axis)
		
		action_list.append({
			"name": action_name,
			"events": event_strings,
			"deadzone": InputMap.action_get_deadzone(action_name)
		})
	
	_send_result(request_id, {
		"success": true,
		"type": "input_actions",
		"actions": action_list,
		"count": action_list.size()
	})
	return true


func _string_to_keycode(key_string: String) -> int:
	var upper := key_string.to_upper()
	
	# Common key mappings
	var key_map := {
		"SPACE": KEY_SPACE,
		"ENTER": KEY_ENTER,
		"RETURN": KEY_ENTER,
		"ESCAPE": KEY_ESCAPE,
		"ESC": KEY_ESCAPE,
		"TAB": KEY_TAB,
		"BACKSPACE": KEY_BACKSPACE,
		"DELETE": KEY_DELETE,
		"INSERT": KEY_INSERT,
		"HOME": KEY_HOME,
		"END": KEY_END,
		"PAGEUP": KEY_PAGEUP,
		"PAGEDOWN": KEY_PAGEDOWN,
		"UP": KEY_UP,
		"DOWN": KEY_DOWN,
		"LEFT": KEY_LEFT,
		"RIGHT": KEY_RIGHT,
		"SHIFT": KEY_SHIFT,
		"CTRL": KEY_CTRL,
		"CONTROL": KEY_CTRL,
		"ALT": KEY_ALT,
		"F1": KEY_F1,
		"F2": KEY_F2,
		"F3": KEY_F3,
		"F4": KEY_F4,
		"F5": KEY_F5,
		"F6": KEY_F6,
		"F7": KEY_F7,
		"F8": KEY_F8,
		"F9": KEY_F9,
		"F10": KEY_F10,
		"F11": KEY_F11,
		"F12": KEY_F12,
	}
	
	if key_map.has(upper):
		return key_map[upper]
	
	# Single character keys (A-Z, 0-9)
	if upper.length() == 1:
		var code := upper.unicode_at(0)
		if code >= 65 and code <= 90:  # A-Z
			return code
		if code >= 48 and code <= 57:  # 0-9
			return code
	
	return KEY_NONE


func _send_result(request_id: int, result: Dictionary) -> void:
	result["request_id"] = request_id
	EngineDebugger.send_message("%s:result" % CAPTURE_NAME, [result])
