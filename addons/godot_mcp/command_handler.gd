@tool
class_name MCPCommandHandler
extends Node

const ENHANCED_COMMANDS: Array[String] = [
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

var _websocket_server
var _command_processors = []
var _enhanced_processor = null
const MAX_MUTATION_QUEUE := 64
# Read-only diagnostics/inspection commands intentionally bypass this queue so
# async_diagnostics and concurrent reads remain responsive. Mutating commands
# are admitted FIFO to avoid editor-state races. The drain loop awaits each
# dispatch, so the next mutation cannot start until the current one has
# finished (input sequences and editor scripts resolve on completion or their
# deadline).
# Rebuilt from the match arms in commands/*.gd and mcp_*_commands.gd; every
# entry changes scene/files/editor/runtime state. Phantoms (simulate_input,
# set_node_property, write_script, delete_script, write_shader,
# save_all_scenes) were removed because no processor handles them; read-only
# get_*/list_*/capture/subscribe commands stay concurrent by design.
const MUTATING_COMMANDS := [
	# Scene tree edits
	"create_node", "delete_node", "update_node_property", "update_node_transform",
	# Scene files and editor scene state
	"create_scene", "save_scene", "open_scene", "delete_scene",
	"reload_scene", "reload_project", "rescan_filesystem", "create_resource",
	# Run control and generated project guidance files
	"run_project", "run_current_scene", "run_specific_scene", "stop_running_project",
	"generate_project_guidance",
	# Script and shader files
	"create_script", "edit_script", "create_shader", "edit_shader",
	"shader_set_uniform", "shader_hot_reload", "shader_reset_uniforms",
	"shader_reload_from_disk", "shader_debug_overlay", "shader_debug_visualize",
	# Editor main-thread script execution
	"execute_editor_script",
	# Runtime input simulation
	"simulate_action_press", "simulate_action_release", "simulate_action_tap",
	"simulate_mouse_click", "simulate_mouse_move", "simulate_drag",
	"simulate_key_press", "simulate_input_sequence",
	# Editor panel state and arbitrary runtime evaluation
	"clear_debug_output", "clear_editor_errors", "evaluate_runtime"
]
var _mutation_queue: Array = []
var _mutation_worker_running := false

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
	var capture_commands = MCPCaptureCommands.new()
	var validation_commands = MCPValidationCommands.new()
	var shader_commands = MCPShaderCommands.new()
	
	# Set server reference for all processors
	node_commands._websocket_server = _websocket_server
	script_commands._websocket_server = _websocket_server
	scene_commands._websocket_server = _websocket_server
	project_commands._websocket_server = _websocket_server
	editor_commands._websocket_server = _websocket_server
	editor_script_commands._websocket_server = _websocket_server
	debugger_commands._websocket_server = _websocket_server
	input_commands._websocket_server = _websocket_server
	capture_commands._websocket_server = _websocket_server
	validation_commands._websocket_server = _websocket_server
	shader_commands._websocket_server = _websocket_server
	
	# Add them to our processor list
	_command_processors.append(node_commands)
	_command_processors.append(script_commands)
	_command_processors.append(scene_commands)
	_command_processors.append(project_commands)
	_command_processors.append(editor_commands)
	_command_processors.append(editor_script_commands)
	_command_processors.append(debugger_commands)
	_command_processors.append(input_commands)
	_command_processors.append(capture_commands)
	_command_processors.append(validation_commands)
	_command_processors.append(shader_commands)
	
	# Try to load optional command classes
	var enhanced_commands = _try_load_optional_command("res://addons/godot_mcp/mcp_enhanced_commands.gd")
	var asset_commands = _try_load_optional_command("res://addons/godot_mcp/mcp_asset_commands.gd")
	_enhanced_processor = enhanced_commands
	
	# Add required processors as children for proper lifecycle management
	add_child(node_commands)
	add_child(script_commands)
	add_child(scene_commands)
	add_child(project_commands)
	add_child(editor_commands)
	add_child(editor_script_commands)
	add_child(debugger_commands)
	add_child(input_commands)
	add_child(capture_commands)
	add_child(validation_commands)
	add_child(shader_commands)
	
	print("Command processors initialized:")
	print("- Node Commands")
	print("- Script Commands")
	print("- Scene Commands")
	print("- Project Commands")
	print("- Editor Commands")
	print("- Editor Script Commands")
	print("- Debugger Commands")
	print("- Input Commands")
	print("- Capture Commands")
	print("- Validation Commands")
	print("- Shader Commands")
	
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
	var command_type = str(command.get("type", ""))
	if command_type in MUTATING_COMMANDS:
		_enqueue_mutation(client_id, command)
		return
	await _dispatch_command(client_id, command)

func _enqueue_mutation(client_id: int, command: Dictionary) -> void:
	if _mutation_queue.size() >= MAX_MUTATION_QUEUE:
		_send_error(client_id, "Mutation queue is full (limit %d); retry after existing editor work completes" % MAX_MUTATION_QUEUE, str(command.get("commandId", "")))
		return
	_mutation_queue.append({"client_id": client_id, "command": command})
	if not _mutation_worker_running:
		call_deferred("_drain_mutation_queue")

func _drain_mutation_queue() -> void:
	if _mutation_worker_running:
		return
	_mutation_worker_running = true
	while not _mutation_queue.is_empty():
		var item: Dictionary = _mutation_queue.pop_front()
		await _dispatch_command(int(item.get("client_id", 0)), item.get("command", {}))
	_mutation_worker_running = false

func remove_client_commands(client_id: int) -> void:
	for index in range(_mutation_queue.size() - 1, -1, -1):
		if int(_mutation_queue[index].get("client_id", -1)) == client_id:
			_mutation_queue.remove_at(index)

func _dispatch_command(client_id: int, command: Dictionary) -> void:
	var command_type = command.get("type", "")
	var params = command.get("params", {})
	var command_id = command.get("commandId", "")
	
	print("Processing command: %s" % command_type)
	
	# Special handling for enhanced commands
	if command_type in ENHANCED_COMMANDS and _enhanced_processor != null:
		# Dispatch straight to the cached enhanced processor instead of scanning
		# the processor list for its script path on every enhanced command.
		var handled = await _call_processor(_enhanced_processor, client_id, command_type, params, command_id)
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
	if processor is MCPEditorScriptCommands:
		return true
	if processor is MCPCaptureCommands:
		return true
	if processor is MCPScriptCommands:
		return true
	if processor is MCPValidationCommands:
		return true
	if processor is MCPShaderCommands:
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
