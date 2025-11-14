@tool
class_name MCPEditorScriptCommands
extends MCPBaseCommandProcessor

const EXECUTION_TIMEOUT_SECONDS := 1.5
const MAX_LOG_TAIL_CHARS := 2048
const MAX_LOG_TAIL_LINES := 20

var _pending_executions := {}

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"execute_editor_script":
			_execute_editor_script(client_id, params, command_id)
			return true
	return false  # Command not handled

# Add API compatibility fixing function
func _fix_api_compatibility(code: String) -> String:
	var modified_code = code
	
	# Handle Directory API (replaced with DirAccess in Godot 4.x)
	if "Directory.new()" in modified_code:
		modified_code = modified_code.replace("Directory.new()", "DirAccess.open('res://')")
		modified_code = modified_code.replace("dir.list_dir_begin(true, true)", "dir.list_dir_begin()")
	
	# Handle File API (replaced with FileAccess in Godot 4.x)
	if "File.new()" in modified_code:
		modified_code = modified_code.replace("File.new()", "FileAccess.open('res://', FileAccess.READ)")
		modified_code = modified_code.replace("file.open(", "file = FileAccess.open(")
	
	return modified_code

func _execute_editor_script(client_id: int, params: Dictionary, command_id: String) -> void:
	var code = params.get("code", "")
	
	# Validation
	if code.is_empty():
		return _send_error(client_id, "Code cannot be empty", command_id)
	
	# Fix common API incompatibilities
	code = _fix_api_compatibility(code)

	var parse_log_snapshot = _capture_log_snapshot()
	
	# Create a temporary script node to execute the code
	var script_node := Node.new()
	script_node.name = "EditorScriptExecutor"
	add_child(script_node)
	
	# Create a temporary script
	var script = GDScript.new()
	
	var output = []
	var error_message = ""
	var execution_result = null
	
	# Replace print() calls with custom_print() in the user code
	var modified_code = _replace_print_calls(code)
	
	# Use consistent tab indentation in the template
	var script_content = """@tool
extends Node

signal execution_completed

# Variable to store the result
var result = null
var _output_array = []
var _error_message = ""
var _parent

# Custom print function that stores output in the array
func custom_print(values):
	# Convert array of values to a single string
	var output_str = ""
	if values is Array:
		for i in range(values.size()):
			if i > 0:
				output_str += " "
			output_str += str(values[i])
	else:
		output_str = str(values)
		
	_output_array.append(output_str)
	print(output_str)  # Still print to the console for debugging

func run():
	print("Executing script... ready func")
	_parent = get_parent()
	var scene = get_tree().edited_scene_root
	
	# Execute the provided code
	var err = _execute_code()
	
	# If there was an error, store it
	if err != OK:
		_error_message = "Failed to execute script with error: " + str(err)
	
	# Signal that execution is complete
	execution_completed.emit()

func _execute_code():
	# USER CODE START
{user_code}
	# USER CODE END
	return OK
"""
	
	# Process the user code to ensure consistent indentation
	# This helps prevent "mixed tabs and spaces" errors
	var processed_lines = []
	var lines = modified_code.split("\n")
	for line in lines:
		# Replace any spaces at the beginning with tabs
		var processed_line = line
		
		# If line starts with spaces, replace with a tab
		var space_count = 0
		for i in range(line.length()):
			if line[i] == " ":
				space_count += 1
			else:
				break
		
		# If we found spaces at the beginning, replace with tabs
		if space_count > 0:
			# Create tabs based on space count (e.g., 4 spaces = 1 tab)
			var tabs = ""
			for _i in range(space_count / 4): # Integer division
				tabs += "\t"
			processed_line = tabs + line.substr(space_count)
			
		processed_lines.append(processed_line)
	
	var indented_code = ""
	for line in processed_lines:
		indented_code += "\t" + line + "\n"
	
	script_content = script_content.replace("{user_code}", indented_code)
	script.source_code = script_content
	
	# Check for script errors during parsing
	var error = script.reload()
	if error != OK:
		var parse_tail = _extract_log_tail(parse_log_snapshot)
		var parse_message = "Script parsing error: " + str(error)
		if not parse_tail.is_empty():
			parse_message += "\n" + "\n".join(parse_tail)
		remove_child(script_node)
		script_node.queue_free()
		return _send_error(client_id, parse_message, command_id)
	
	# Assign the script to the node
	script_node.set_script(script)
	
	# Connect to the execution_completed signal
	script_node.connect("execution_completed", _on_script_execution_completed.bind(script_node, client_id, command_id))

	var execution_log_snapshot = _capture_log_snapshot()
	_track_pending_execution(script_node, client_id, command_id, execution_log_snapshot)
	script_node.run()


# Signal handler for when script execution completes
func _on_script_execution_completed(script_node: Node, client_id: int, command_id: String) -> void:
	var pending = _pop_pending_execution(script_node)
	var log_snapshot = pending.get("log_snapshot", {})
	var log_tail = _extract_log_tail(log_snapshot)
	
	# Collect results safely by checking if properties exist
	var execution_result = script_node.get("result")
	var output = script_node._output_array
	var error_message = script_node._error_message
	
	# Clean up
	remove_child(script_node)
	script_node.queue_free()
	
	# Build the response
	var result_data = {
		"success": error_message.is_empty(),
		"output": output
	}

	print("result_data: ", result_data)
	
	if not error_message.is_empty():
		result_data["error"] = error_message
		if not log_tail.is_empty():
			result_data["debug_log_tail"] = log_tail
	elif execution_result != null:
		result_data["result"] = execution_result
	
	_send_success(client_id, result_data, command_id)

# Replace print() calls with custom_print() in the user code
func _replace_print_calls(code: String) -> String:
	var modified_code := ""
	var search_index := 0
	
	while search_index < code.length():
		var match_index = code.find("print", search_index)
		if match_index == -1:
			modified_code += code.substr(search_index)
			break
		
		modified_code += code.substr(search_index, match_index - search_index)
		var prev_char = code.substr(match_index - 1, 1) if match_index > 0 else ""
		var next_char = code.substr(match_index + 5, 1) if match_index + 5 < code.length() else ""
		
		if _is_identifier_char(prev_char) or _is_identifier_char(next_char):
			modified_code += "print"
			search_index = match_index + 5
			continue
		
		var paren_index = _skip_whitespace(code, match_index + 5)
		if paren_index >= code.length() or code[paren_index] != "(":
			modified_code += "print"
			search_index = match_index + 5
			continue
		
		var closing_index = _find_matching_paren(code, paren_index)
		if closing_index == -1:
			modified_code += code.substr(match_index)
			break
		
		var inner_content = code.substr(paren_index + 1, closing_index - paren_index - 1)
		modified_code += "custom_print([" + inner_content + "])"
		search_index = closing_index + 1
	
	return modified_code

func _skip_whitespace(text: String, start_index: int) -> int:
	var index = start_index
	while index < text.length():
		var char = text.substr(index, 1)
		if char != " " and char != "\t" and char != "\n" and char != "\r":
			break
		index += 1
	return index

func _is_identifier_char(char: String) -> bool:
	if char.is_empty():
		return false
	var code_point = char.unicode_at(0)
	var is_digit = code_point >= 48 and code_point <= 57
	var is_lower = code_point >= 97 and code_point <= 122
	var is_upper = code_point >= 65 and code_point <= 90
	return is_digit or is_lower or is_upper or char == "_"

func _find_matching_paren(text: String, open_index: int) -> int:
	var depth = 1
	var index = open_index + 1
	var in_string = false
	var string_delimiter = ""
	var escape_next = false
	
	while index < text.length():
		var char = text[index]
		if in_string:
			if escape_next:
				escape_next = false
			elif char == "\\":
				escape_next = true
			elif char == string_delimiter:
				in_string = false
		else:
			if char == "\"" or char == "'":
				in_string = true
				string_delimiter = char
			elif char == "(":
				depth += 1
			elif char == ")":
				depth -= 1
				if depth == 0:
					return index
		index += 1
	return -1

func _get_debug_output_publisher():
	if Engine.has_meta("MCPDebugOutputPublisher"):
		var publisher = Engine.get_meta("MCPDebugOutputPublisher")
		if publisher and publisher.has_method("get_full_log_text"):
			return publisher
	return null

func _capture_log_snapshot() -> Dictionary:
	var publisher = _get_debug_output_publisher()
	if publisher == null:
		return {}
	var text = publisher.get_full_log_text()
	return {
		"publisher": publisher,
		"length": text.length()
	}

func _extract_log_tail(snapshot: Dictionary) -> Array:
	if snapshot.is_empty():
		return []
	if not snapshot.has("publisher") or not snapshot.has("length"):
		return []
	var publisher = snapshot["publisher"]
	if publisher == null or not publisher.has_method("get_full_log_text"):
		return []
	var baseline = int(snapshot["length"])
	var text = publisher.get_full_log_text()
	if baseline < 0 or baseline > text.length():
		baseline = max(0, text.length() - MAX_LOG_TAIL_CHARS)
	var delta = text.substr(baseline)
	if delta.length() > MAX_LOG_TAIL_CHARS:
		delta = delta.substr(delta.length() - MAX_LOG_TAIL_CHARS)
	delta = delta.strip_edges()
	if delta.is_empty():
		return []
	var lines = delta.split("\n", false)
	if lines.size() > MAX_LOG_TAIL_LINES:
		lines = lines.slice(lines.size() - MAX_LOG_TAIL_LINES, lines.size())
	return lines

func _track_pending_execution(script_node: Node, client_id: int, command_id: String, log_snapshot: Dictionary) -> void:
	var execution_id = script_node.get_instance_id()
	var timer := Timer.new()
	timer.one_shot = true
	timer.wait_time = EXECUTION_TIMEOUT_SECONDS
	add_child(timer)
	timer.connect("timeout", Callable(self, "_on_execution_timeout").bind(execution_id, client_id, command_id))
	timer.start()
	_pending_executions[execution_id] = {
		"client_id": client_id,
		"command_id": command_id,
		"log_snapshot": log_snapshot,
		"timer": timer,
		"node": script_node
	}

func _pop_pending_execution(script_node: Node) -> Dictionary:
	var execution_id = script_node.get_instance_id()
	if not _pending_executions.has(execution_id):
		return {}
	var pending: Dictionary = _pending_executions[execution_id]
	_pending_executions.erase(execution_id)
	var timer = pending.get("timer", null)
	if timer and is_instance_valid(timer):
		timer.queue_free()
	return pending

func _on_execution_timeout(execution_id: int, client_id: int, command_id: String) -> void:
	if not _pending_executions.has(execution_id):
		return
	var pending: Dictionary = _pending_executions[execution_id]
	_pending_executions.erase(execution_id)
	var timer = pending.get("timer", null)
	if timer and is_instance_valid(timer):
		timer.queue_free()
	var script_node = pending.get("node", null)
	if script_node and is_instance_valid(script_node):
		if script_node.is_inside_tree():
			remove_child(script_node)
		script_node.queue_free()
	var log_tail = _extract_log_tail(pending.get("log_snapshot", {}))
	var message = "Script execution timed out before completion."
	if not log_tail.is_empty():
		message += "\n" + "\n".join(log_tail)
	_send_error(client_id, message, command_id)
