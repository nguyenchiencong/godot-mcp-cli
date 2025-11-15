@tool
class_name MCPDebuggerCommands
extends MCPBaseCommandProcessor

# Reference to the debugger bridge provided by the plugin
var _debugger_bridge = null

func _ready():
    _debugger_bridge = _get_debugger_bridge()

    if _debugger_bridge:
        # Connect signals so the bridge can forward debugger events to MCP
        _debugger_bridge.breakpoint_hit.connect(_on_breakpoint_hit)
        _debugger_bridge.execution_paused.connect(_on_execution_paused)
        _debugger_bridge.execution_resumed.connect(_on_execution_resumed)
        _debugger_bridge.stack_frame_changed.connect(_on_stack_frame_changed)
        _debugger_bridge.breakpoint_set.connect(_on_breakpoint_set)
        _debugger_bridge.breakpoint_removed.connect(_on_breakpoint_removed)
    else:
        print('[MCPDebuggerCommands] Warning: Could not get debugger bridge reference')

func _get_debugger_bridge():
    if Engine.has_meta('MCPDebuggerBridge'):
        return Engine.get_meta('MCPDebuggerBridge')

    var plugin = Engine.get_meta('GodotMCPPlugin')
    if plugin and plugin.has_method('get_debugger_bridge'):
        return plugin.get_debugger_bridge()

    return null

func _ensure_bridge(client_id: int, command_id: String) -> bool:
    if _debugger_bridge:
        return true

    _send_error(client_id, 'Debugger bridge not available', command_id)
    return false

func _normalize_script_path(script_path: String) -> String:
    if script_path.is_empty():
        return script_path

    if script_path.begins_with('res://'):
        return script_path

    if script_path.begins_with('/'):
        return 'res://' + script_path.substr(1)

    return 'res://' + script_path

func _forward_bridge_result(client_id: int, command_id: String, result: Variant, failure_message: String) -> void:
    if result is Dictionary and not result.get('success', true):
        _send_error(client_id, result.get('message', failure_message), command_id)
        return

    _send_success(client_id, result, command_id)

func _call_breakpoint_operation(client_id: int, params: Dictionary, command_id: String, method_name: String, failure_message: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    var script_path: String = params.get('script_path', '')
    var line: int = params.get('line', -1)

    if script_path.is_empty():
        _send_error(client_id, 'script_path parameter is required', command_id)
        return

    if line < 0:
        _send_error(client_id, 'line parameter must be >= 0', command_id)
        return

    script_path = _normalize_script_path(script_path)

    var result = _debugger_bridge.call(method_name, script_path, line)
    _forward_bridge_result(client_id, command_id, result, failure_message)

func _call_bridge_no_args(client_id: int, command_id: String, method_name: String, failure_message: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    var result = _debugger_bridge.call(method_name)
    _forward_bridge_result(client_id, command_id, result, failure_message)

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
    match command_type:
        'debugger_set_breakpoint':
            _call_breakpoint_operation(client_id, params, command_id, 'set_breakpoint', 'Failed to set breakpoint')
            return true
        'debugger_remove_breakpoint':
            _call_breakpoint_operation(client_id, params, command_id, 'remove_breakpoint', 'Failed to remove breakpoint')
            return true
        'debugger_get_breakpoints':
            _get_breakpoints(client_id, params, command_id)
            return true
        'debugger_clear_all_breakpoints':
            _call_bridge_no_args(client_id, command_id, 'clear_all_breakpoints', 'Failed to clear all breakpoints')
            return true
        'debugger_pause_execution':
            _call_bridge_no_args(client_id, command_id, 'pause_execution', 'Failed to pause execution')
            return true
        'debugger_resume_execution':
            _call_bridge_no_args(client_id, command_id, 'resume_execution', 'Failed to resume execution')
            return true
        'debugger_step_over':
            _call_bridge_no_args(client_id, command_id, 'step_over', 'Failed to step over')
            return true
        'debugger_step_into':
            _call_bridge_no_args(client_id, command_id, 'step_into', 'Failed to step into')
            return true
        'debugger_get_call_stack':
            await _get_call_stack(client_id, params, command_id)
            return true
        'debugger_get_current_state':
            _get_current_state(client_id, params, command_id)
            return true
        'debugger_enable_events':
            _enable_debugger_events(client_id, params, command_id)
            return true
        'debugger_disable_events':
            _disable_debugger_events(client_id, params, command_id)
            return true
    return false

func _get_breakpoints(client_id: int, params: Dictionary, command_id: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    var result = _debugger_bridge.get_breakpoints()
    _send_success(client_id, result, command_id)

func _parse_session_identifier(raw_value) -> Variant:
    var session_id = raw_value
    var value_type := typeof(raw_value)
    match value_type:
        TYPE_INT:
            return raw_value
        TYPE_FLOAT:
            return int(raw_value)
        TYPE_STRING:
            var session_str: String = raw_value
            if session_str.is_valid_int():
                return int(session_str)
            return session_str.strip_edges()
        _:
            return raw_value
    return session_id

func _get_call_stack(client_id: int, params: Dictionary, command_id: String):
    if not _ensure_bridge(client_id, command_id):
        return

    var session_id = null
    if params.has('session_id'):
        session_id = _parse_session_identifier(params['session_id'])

    var result = await _debugger_bridge.get_call_stack(session_id)
    if typeof(result) == TYPE_DICTIONARY and result.has("error"):
        var message := String(result.get("message", result.get("error", "unknown_call_stack_error")))
        _send_error(client_id, "Failed to capture call stack: %s" % message, command_id)
        return

    _send_success(client_id, result, command_id)

func _get_current_state(client_id: int, params: Dictionary, command_id: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    var result = _debugger_bridge.get_current_state()
    _send_success(client_id, result, command_id)

func _enable_debugger_events(client_id: int, params: Dictionary, command_id: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    _debugger_bridge.set_client_id(client_id)

    if not _debugger_bridge._websocket_server:
        _debugger_bridge.set_websocket_server(_websocket_server)

    _send_success(client_id, {
        'message': 'Debugger events enabled for this client',
        'client_id': client_id,
    }, command_id)

func _disable_debugger_events(client_id: int, params: Dictionary, command_id: String) -> void:
    if not _ensure_bridge(client_id, command_id):
        return

    if _debugger_bridge._current_client_id == client_id:
        _debugger_bridge.set_client_id(-1)

    _send_success(client_id, {
        'message': 'Debugger events disabled for this client',
        'client_id': client_id,
    }, command_id)

# Signal handlers to provide editor-side visibility into debugger activity
func _on_breakpoint_hit(session_id: int, script_path: String, line: int, stack_info: Dictionary) -> void:
    print('Breakpoint hit in session %s at %s:%d' % [session_id, script_path, line])

func _on_execution_paused(session_id: int, reason: String) -> void:
    print('Execution paused in session %s: %s' % [session_id, reason])

func _on_execution_resumed(session_id: int) -> void:
    print('Execution resumed in session %s' % session_id)

func _on_stack_frame_changed(session_id: int, frame_info: Dictionary) -> void:
    print('Stack frame changed in session %s' % session_id)

func _on_breakpoint_set(session_id: int, script_path: String, line: int, success: bool) -> void:
    if success:
        print('Breakpoint set successfully at %s:%d' % [script_path, line])
    else:
        print('Failed to set breakpoint at %s:%d' % [script_path, line])

func _on_breakpoint_removed(session_id: int, script_path: String, line: int, success: bool) -> void:
    if success:
        print('Breakpoint removed successfully at %s:%d' % [script_path, line])
    else:
        print('Failed to remove breakpoint at %s:%d' % [script_path, line])
