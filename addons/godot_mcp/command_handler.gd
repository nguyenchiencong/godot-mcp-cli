@tool
class_name MCPCommandHandler
extends Node

var _websocket_server
var _command_processors = []

func _ready():
	print("Command handler initializing...")
	await get_tree().process_frame
	_websocket_server = get_parent()
	print("WebSocket server reference set: ", _websocket_server)
	
	# Initialize command processors
	_initialize_command_processors()
	
	print("Command handler initialized and ready to process commands")

func _initialize_command_processors():
	# Create and add all required command processors
	var node_commands = MCPNodeCommands.new()
	var script_commands = MCPScriptCommands.new()
	var scene_commands = MCPSceneCommands.new()
	var project_commands = MCPProjectCommands.new()
	var editor_commands = MCPEditorCommands.new()
	var editor_script_commands = MCPEditorScriptCommands.new()
	var debugger_commands = MCPDebuggerCommands.new()
	var input_commands = MCPInputCommands.new()
	
	# Set server reference for all processors
	node_commands._websocket_server = _websocket_server
	script_commands._websocket_server = _websocket_server
	scene_commands._websocket_server = _websocket_server
	project_commands._websocket_server = _websocket_server
	editor_commands._websocket_server = _websocket_server
	editor_script_commands._websocket_server = _websocket_server
	debugger_commands._websocket_server = _websocket_server
	input_commands._websocket_server = _websocket_server
	
	# Add them to our processor list
	_command_processors.append(node_commands)
	_command_processors.append(script_commands)
	_command_processors.append(scene_commands)
	_command_processors.append(project_commands)
	_command_processors.append(editor_commands)
	_command_processors.append(editor_script_commands)
	_command_processors.append(debugger_commands)
	_command_processors.append(input_commands)
	
	# Try to load optional command classes
	var script_resource_commands = _try_load_optional_command("res://addons/godot_mcp/mcp_script_resource_commands.gd")
	var enhanced_commands = _try_load_optional_command("res://addons/godot_mcp/mcp_enhanced_commands.gd")
	var asset_commands = _try_load_optional_command("res://addons/godot_mcp/mcp_asset_commands.gd")
	
	# Add required processors as children for proper lifecycle management
	add_child(node_commands)
	add_child(script_commands)
	add_child(scene_commands)
	add_child(project_commands)
	add_child(editor_commands)
	add_child(editor_script_commands)
	add_child(debugger_commands)
	add_child(input_commands)
	
	print("Command processors initialized:")
	print("- Node Commands")
	print("- Script Commands")
	print("- Scene Commands")
	print("- Project Commands")
	print("- Editor Commands")
	print("- Editor Script Commands")
	print("- Debugger Commands")
	print("- Input Commands")
	
	if script_resource_commands:
		print("- Script Resource Commands")
	if enhanced_commands:
		print("- Enhanced Commands")
	if asset_commands:
		print("- Asset Commands")

func _try_load_optional_command(path: String) -> Node:
	if FileAccess.file_exists(path):
		var script = load(path)
		if script:
			var command = Node.new()
			command.set_script(script)
			command._websocket_server = _websocket_server
			_command_processors.append(command)
			add_child(command)
			return command
	return null

func _handle_command(client_id: int, command: Dictionary) -> void:
	var command_type = command.get("type", "")
	var params = command.get("params", {})
	var command_id = command.get("commandId", "")
	
	print("Processing command: %s" % command_type)
	
	# Special handling for enhanced commands
	var enhanced_commands = [
		"get_editor_scene_structure",
		"get_runtime_scene_structure",
		"get_debug_output",
		"get_editor_errors",
		"get_stack_trace_panel",
		"get_stack_frames_panel",
		"evaluate_runtime",
		"clear_debug_output",
		"clear_editor_errors",
		"subscribe_debug_output",
		"unsubscribe_debug_output",
		"update_node_transform"
	]
	if command_type in enhanced_commands:
		# Try to find enhanced commands processor first
		for processor in _command_processors:
			if processor.get_script() and processor.get_script().resource_path.ends_with("mcp_enhanced_commands.gd"):
				var handled = await _call_processor(processor, client_id, command_type, params, command_id)
				if handled:
					print("Command %s handled by Enhanced Commands processor" % command_type)
					return
	
	# Try each processor until one handles the command
	for processor in _command_processors:
		var handled = await _call_processor(processor, client_id, command_type, params, command_id)
		if handled:
			print("Command %s handled by %s" % [command_type, processor.get_class()])
			return

	# If no processor handled the command, send an error
	_send_error(client_id, "Unknown command: %s" % command_type, command_id)

func _send_error(client_id: int, message: String, command_id: String) -> void:
	var response = {
		"status": "error",
		"message": message
	}
	
	if not command_id.is_empty():
		response["commandId"] = command_id
	
	_websocket_server.send_response(client_id, response)
	print("Error: %s" % message)

func _processor_requires_await(processor: Node) -> bool:
	if processor is MCPDebuggerCommands:
		return true
	if processor is MCPInputCommands:
		return true
	if processor.get_script():
		var path := String(processor.get_script().resource_path)
		if path.ends_with("mcp_enhanced_commands.gd"):
			return true
	return false

func _call_processor(processor: Node, client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	if _processor_requires_await(processor):
		return await processor.process_command(client_id, command_type, params, command_id)
	return processor.process_command(client_id, command_type, params, command_id)
