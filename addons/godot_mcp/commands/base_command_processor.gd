@tool
class_name MCPBaseCommandProcessor
extends Node

# Signal emitted when a command has completed processing
signal command_completed(client_id, command_type, result, command_id)

# Reference to the server - passed by the command handler
var _websocket_server = null

# Must be implemented by subclasses
func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	push_error("BaseCommandProcessor.process_command called directly")
	return false

# Helper functions common to all command processors
func _send_success(client_id: int, result: Dictionary, command_id: String) -> void:
	var response = {
		"status": "success",
		"result": result
	}
	
	if not command_id.is_empty():
		response["commandId"] = command_id
	
	# Emit the signal for local processing (useful for testing)
	command_completed.emit(client_id, "success", result, command_id)
	
	# Send to websocket if available
	if _websocket_server:
		_websocket_server.send_response(client_id, response)

func _send_error(client_id: int, message: String, command_id: String) -> void:
	var response = {
		"status": "error",
		"message": message
	}
	
	if not command_id.is_empty():
		response["commandId"] = command_id
	
	# Emit the signal for local processing (useful for testing)
	var error_result = {"error": message}
	command_completed.emit(client_id, "error", error_result, command_id)
	
	# Send to websocket if available
	if _websocket_server:
		_websocket_server.send_response(client_id, response)
	print("Error: %s" % message)

# Common utility methods
func _get_editor_node(path: String) -> Node:
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		print("GodotMCPPlugin not found in Engine metadata")
		return null
		
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if not edited_scene_root:
		print("No edited scene found")
		return null

	var normalized_path = _normalize_node_path(path)
	if normalized_path.is_empty():
		return edited_scene_root

	var node = edited_scene_root.get_node_or_null(normalized_path)
	if node:
		return node

	var root_name = edited_scene_root.name
	if normalized_path == root_name:
		return edited_scene_root

	var root_prefix = root_name + "/"
	if normalized_path.begins_with(root_prefix):
		var trimmed_path = normalized_path.substr(root_prefix.length())
		if trimmed_path.is_empty():
			return edited_scene_root
		node = edited_scene_root.get_node_or_null(trimmed_path)
		if node:
			return node

	return null

# Enhanced version of _get_editor_node to improve node path resolution
func _get_editor_node_enhanced(path: String) -> Node:
	# First try the standard method
	var node = _get_editor_node(path)
	if node:
		return node
		
	# If not found, try additional resolution methods
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		return null
		
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if not edited_scene_root:
		return null
	
	var normalized_path = _normalize_node_path(path)
	if normalized_path.is_empty():
		return edited_scene_root

	var lower_path = normalized_path.to_lower()
	var root_name_lower = edited_scene_root.name.to_lower()

	if lower_path == root_name_lower:
		return edited_scene_root

	var parts = normalized_path.split("/")
	if parts.size() > 1 and parts[0].to_lower() == root_name_lower:
		var sub_path = ""
		for i in range(1, parts.size()):
			if i > 1:
				sub_path += "/"
			sub_path += parts[i]
		
		if sub_path.is_empty():
			return edited_scene_root
		
		var node_with_root_prefix = edited_scene_root.get_node_or_null(sub_path)
		if node_with_root_prefix:
			return node_with_root_prefix
		
		normalized_path = sub_path
		lower_path = normalized_path.to_lower()
	
	if normalized_path.find("/") == -1:
		for child in edited_scene_root.get_children():
			if child.name.to_lower() == lower_path:
				return child
	
	return null

# Helper function to mark a scene as modified
func _mark_scene_modified() -> void:
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin:
		print("GodotMCPPlugin not found in Engine metadata")
		return
	
	var editor_interface = plugin.get_editor_interface()
	var edited_scene_root = editor_interface.get_edited_scene_root()
	
	if edited_scene_root:
		# This internally marks the scene as modified in the editor
		editor_interface.mark_scene_as_unsaved()

# Helper function to access the EditorUndoRedoManager
func _get_undo_redo():
	var plugin = Engine.get_meta("GodotMCPPlugin")
	if not plugin or not plugin.has_method("get_undo_redo"):
		print("Cannot access UndoRedo from plugin")
		return null
		
	return plugin.get_undo_redo()

# Helper function to parse property values from string to proper Godot types
func _parse_property_value(value):
	# Only try to parse strings that look like they could be Godot types
	if typeof(value) == TYPE_STRING and (
		value.begins_with("Vector") or 
		value.begins_with("Transform") or 
		value.begins_with("Rect") or 
		value.begins_with("Color") or
		value.begins_with("Quat") or
		value.begins_with("Basis") or
		value.begins_with("Plane") or
		value.begins_with("AABB") or
		value.begins_with("Projection") or
		value.begins_with("Callable") or
		value.begins_with("Signal") or
		value.begins_with("PackedVector") or
		value.begins_with("PackedString") or
		value.begins_with("PackedFloat") or
		value.begins_with("PackedInt") or
		value.begins_with("PackedColor") or
		value.begins_with("PackedByteArray") or
		value.begins_with("Dictionary") or
		value.begins_with("Array")
	):
		var expression = Expression.new()
		var error = expression.parse(value, [])
		
		if error == OK:
			var result = expression.execute([], null, true)
			if not expression.has_execute_failed():
				print("Successfully parsed %s as %s" % [value, result])
				return result
			else:
				print("Failed to execute expression for: %s" % value)
		else:
				print("Failed to parse expression: %s (Error: %d)" % [value, error])
	
	# Otherwise, return value as is
	return value

func _normalize_node_path(path: String) -> String:
	var normalized = path.strip_edges()
	if normalized.is_empty() or normalized == "." or normalized == "/root":
		return ""
	
	while normalized.begins_with("/root/"):
		normalized = normalized.substr(6)
	
	while normalized.begins_with("./"):
		normalized = normalized.substr(2)
	
	if normalized.begins_with("/"):
		normalized = normalized.substr(1)
	
	if normalized.begins_with("."):
		normalized = normalized.substr(1)
	
	return normalized.strip_edges()
