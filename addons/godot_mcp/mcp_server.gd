@tool
extends EditorPlugin

var websocket_server: MCPWebSocketServer
var command_handler = null  # Command handler reference
var panel = null  # Reference to the MCP panel
var runtime_debugger_bridge = null  # Runtime scene inspection bridge
var debugger_bridge = null  # Debugger control bridge
var debug_output_publisher = null  # Live debug output broadcaster
var _runtime_bridge_warning_logged := false
var _debugger_bridge_warning_logged := false
const SCENE_CAPTURE_NAMES := ["scene", "limboai", "mcp_eval", "mcp_input"]
const STACK_CAPTURE_NAMES := ["stack", "call_stack", "callstack"]

const INPUT_HANDLER_AUTOLOAD_NAME := "MCPInputHandler"
const INPUT_HANDLER_SCRIPT_PATH := "res://addons/godot_mcp/mcp_input_handler.gd"

func _enter_tree():
	# Store plugin instance for EditorInterface access
	Engine.set_meta("GodotMCPPlugin", self)
	_runtime_bridge_warning_logged = false
	_debugger_bridge_warning_logged = false
	_try_register_runtime_bridge()
	_try_register_debugger_bridge()
	_register_input_handler_autoload()

	print("\n=== MCP SERVER STARTING ===")

	# Initialize the websocket server
	websocket_server = load("res://addons/godot_mcp/websocket_server.gd").new()
	websocket_server.name = "WebSocketServer"
	add_child(websocket_server)
	websocket_server.connect("client_disconnected", Callable(self, "_on_client_disconnected"))

	# Initialize the command handler
	print("Creating command handler...")
	var handler_script = load("res://addons/godot_mcp/command_handler.gd")
	if handler_script:
		command_handler = Node.new()
		command_handler.set_script(handler_script)
		command_handler.name = "CommandHandler"
		websocket_server.add_child(command_handler)

		# Connect signals
		print("Connecting command handler signals...")
		websocket_server.connect("command_received", Callable(command_handler, "_handle_command"))
	else:
		printerr("Failed to load command handler script!")

	# Initialize the control panel
	panel = load("res://addons/godot_mcp/ui/mcp_panel.tscn").instantiate()
	panel.websocket_server = websocket_server
	add_control_to_bottom_panel(panel, "MCP Server")

	# Initialize live debug output publisher
	var publisher_script = load("res://addons/godot_mcp/mcp_debug_output_publisher.gd")
	if publisher_script:
		debug_output_publisher = publisher_script.new()
		debug_output_publisher.name = "DebugOutputPublisher"
		debug_output_publisher.websocket_server = websocket_server
		add_child(debug_output_publisher)
		Engine.set_meta("MCPDebugOutputPublisher", debug_output_publisher)

	print("MCP Server plugin initialized")
	# Server startup will be handled in _ready() with proper timing

func _ready():
	# Wait for Godot to fully initialize before starting the server
	_start_server_with_improved_timing()

func _start_server_with_improved_timing(attempt: int = 0):
	# Wait for full Godot initialization (double frame wait)
	await get_tree().process_frame
	await get_tree().process_frame

	print("Attempting to start MCP WebSocket server...")
	var start_result := websocket_server.start_server()

	if start_result == OK:
		print("✓ MCP WebSocket server started successfully")
		# Verify server is actually ready
		await get_tree().create_timer(0.5).timeout
		if websocket_server.is_server_active():
			print("✓ MCP WebSocket server verified and ready")
		else:
			print("⚠ MCP server started but not fully active, may need manual start")
	elif start_result == ERR_ALREADY_IN_USE:
		print("✓ MCP WebSocket server already running")
	else:
		if attempt < 3:  # Retry up to 3 times
			print("✗ MCP server start failed (code: %d), retrying in 1 second... (attempt %d/3)" % [start_result, attempt + 1])
			await get_tree().create_timer(1.0).timeout
			_start_server_with_improved_timing(attempt + 1)
		else:
			printerr("✗ Failed to start MCP server after 3 attempts (final code: %d)" % start_result)
			printerr("Please use the 'Start' button in the MCP Server panel at the bottom of the editor")

func _exit_tree():
	# Remove plugin instance from Engine metadata
	if Engine.has_meta("GodotMCPPlugin"):
		Engine.remove_meta("GodotMCPPlugin")
	if Engine.has_meta("MCPRuntimeDebuggerBridge"):
		Engine.remove_meta("MCPRuntimeDebuggerBridge")
	if Engine.has_meta("MCPDebuggerBridge"):
		Engine.remove_meta("MCPDebuggerBridge")
	if Engine.has_meta("MCPDebugOutputPublisher"):
		Engine.remove_meta("MCPDebugOutputPublisher")
	_update_debugger_captures(false)
	_remove_input_handler_autoload()

	if runtime_debugger_bridge:
		remove_debugger_plugin(runtime_debugger_bridge)
		runtime_debugger_bridge = null

	if debugger_bridge:
		remove_debugger_plugin(debugger_bridge)
		debugger_bridge = null

	# Clean up the panel
	if panel:
		remove_control_from_bottom_panel(panel)
		panel.queue_free()
		panel = null

	if debug_output_publisher:
		debug_output_publisher.unsubscribe_all()
		debug_output_publisher.queue_free()
		debug_output_publisher = null

	# Clean up the websocket server and command handler
	if websocket_server:
		websocket_server.stop_server()
		websocket_server.queue_free()
		websocket_server = null

	print("=== MCP SERVER SHUTDOWN ===")

# Method to get the debugger bridge for other components
func get_debugger_bridge():
	return debugger_bridge

# Helper function for command processors to access EditorInterface
func get_editor_interface():
	return super.get_editor_interface()

# Helper function for command processors to get undo/redo manager
func get_undo_redo():
	return super.get_undo_redo()

func _try_register_runtime_bridge() -> bool:
	if runtime_debugger_bridge:
		return true

	var runtime_bridge_script = load("res://addons/godot_mcp/mcp_runtime_debugger_bridge.gd")
	if not runtime_bridge_script:
		if not _runtime_bridge_warning_logged:
			_runtime_bridge_warning_logged = true
			print("Godot MCP runtime scene inspection unavailable (bridge script not found).")
		return false

	if not ClassDB.class_exists("EditorDebuggerPlugin"):
		if not _runtime_bridge_warning_logged:
			_runtime_bridge_warning_logged = true
			print("Godot MCP runtime scene inspection unavailable on this editor version.")
		return false

	var runtime_bridge_instance = runtime_bridge_script.new()
	if runtime_bridge_instance == null:
		if not _runtime_bridge_warning_logged:
			_runtime_bridge_warning_logged = true
			print("Godot MCP runtime scene inspection disabled (bridge instantiation failed).")
		return false

	runtime_debugger_bridge = runtime_bridge_instance
	add_debugger_plugin(runtime_debugger_bridge)
	Engine.set_meta("MCPRuntimeDebuggerBridge", runtime_debugger_bridge)
	_update_debugger_captures(true)
	_runtime_bridge_warning_logged = false
	print("Godot MCP runtime scene inspection enabled.")
	return true

func _try_register_debugger_bridge() -> bool:
	if debugger_bridge:
		return true

	var debugger_bridge_script = load("res://addons/godot_mcp/mcp_debugger_bridge.gd")
	if not debugger_bridge_script:
		if not _debugger_bridge_warning_logged:
			_debugger_bridge_warning_logged = true
			print("Godot MCP debugger bridge unavailable (bridge script not found).")
		return false

	if not ClassDB.class_exists("EditorDebuggerPlugin"):
		if not _debugger_bridge_warning_logged:
			_debugger_bridge_warning_logged = true
			print("Godot MCP debugger bridge unavailable on this editor version.")
		return false

	var debugger_bridge_instance = debugger_bridge_script.new()
	if debugger_bridge_instance == null:
		if not _debugger_bridge_warning_logged:
			_debugger_bridge_warning_logged = true
			print("Godot MCP debugger bridge disabled (bridge instantiation failed).")
		return false

	debugger_bridge = debugger_bridge_instance
	add_debugger_plugin(debugger_bridge)
	Engine.set_meta("MCPDebuggerBridge", debugger_bridge)
	_debugger_bridge_warning_logged = false
	print("Godot MCP debugger bridge enabled.")
	return true

func _update_debugger_captures(enable: bool) -> void:
	if not Engine.has_singleton("EngineDebugger"):
		return
	var engine_debugger = Engine.get_singleton("EngineDebugger")
	if engine_debugger == null:
		return
	if not engine_debugger.has_method("set_capture"):
		return
	var has_query := engine_debugger.has_method("has_capture")
	for name in SCENE_CAPTURE_NAMES + STACK_CAPTURE_NAMES:
		if enable:
			if not has_query or not engine_debugger.has_capture(name):
				engine_debugger.set_capture(name, true)
		else:
			if not has_query or engine_debugger.has_capture(name):
				engine_debugger.set_capture(name, false)

func _on_client_disconnected(client_id: int) -> void:
	if debug_output_publisher:
		debug_output_publisher.unsubscribe(client_id)


func _register_input_handler_autoload() -> void:
	# Check if autoload already exists
	if ProjectSettings.has_setting("autoload/" + INPUT_HANDLER_AUTOLOAD_NAME):
		print("MCP Input Handler autoload already registered.")
		return
	
	# Verify the script exists
	if not FileAccess.file_exists(INPUT_HANDLER_SCRIPT_PATH):
		printerr("MCP Input Handler script not found at: " + INPUT_HANDLER_SCRIPT_PATH)
		return
	
	# Add the autoload
	ProjectSettings.set_setting("autoload/" + INPUT_HANDLER_AUTOLOAD_NAME, "*" + INPUT_HANDLER_SCRIPT_PATH)
	ProjectSettings.save()
	print("MCP Input Handler autoload registered. Restart the game for input simulation to work.")


func _remove_input_handler_autoload() -> void:
	# Check if autoload exists before removing
	if not ProjectSettings.has_setting("autoload/" + INPUT_HANDLER_AUTOLOAD_NAME):
		return
	
	# Remove the autoload
	ProjectSettings.set_setting("autoload/" + INPUT_HANDLER_AUTOLOAD_NAME, null)
	ProjectSettings.save()
	print("MCP Input Handler autoload removed.")
