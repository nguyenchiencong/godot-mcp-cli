@tool
class_name MCPDebugOutputPublisher
extends Node

const POLL_INTERVAL_SECONDS := 0.5
const OUTPUT_SCORE_THRESHOLD := 60
const OUTPUT_KEYWORDS := ["output", "console", "log", "stdout"]
const SUMMARY_VALUE_MAX_LEN := 160

var websocket_server: MCPWebSocketServer

var _subscribers: Dictionary = {}
var _elapsed := 0.0
var _last_length := 0
var _cached_output_control: Control = null
var _last_capture_source := "unset"
var _last_capture_detail := ""
var _last_capture_timestamp := 0
var _last_control_class := ""
var _last_control_path := ""
var _last_log_file_path := ""
var _last_control_search_summary := ""

func _ready() -> void:
	set_process(false)

func subscribe(client_id: int) -> void:
	_subscribers[client_id] = true
	_initialize_baseline()
	if not is_processing():
		set_process(true)

func unsubscribe(client_id: int) -> void:
	if _subscribers.erase(client_id) and _subscribers.is_empty():
		set_process(false)

func unsubscribe_all() -> void:
	_subscribers.clear()
	set_process(false)

func _process(delta: float) -> void:
	if _subscribers.is_empty():
		set_process(false)
		return

	_elapsed += delta
	if _elapsed < POLL_INTERVAL_SECONDS:
		return
	_elapsed = 0.0

	_publish_incremental_frame()

func _initialize_baseline() -> void:
	var current_text := _fetch_log_text()
	if current_text == null:
		_last_length = 0
	else:
		_last_length = current_text.length()

func _publish_incremental_frame() -> void:
	var text := _fetch_log_text()
	if text == null:
		return

	var reset := false
	if text.length() < _last_length:
		reset = true

	var chunk := ""
	if reset:
		chunk = text
	else:
		if text.length() == _last_length:
			return
		chunk = text.substr(_last_length, text.length() - _last_length)

	_last_length = text.length()

	if chunk.is_empty() and not reset:
		return

	var lines: Array = []
	if not chunk.is_empty():
		lines = chunk.split("\n", false)
		# Drop trailing empty line caused by split behaviour.
		if lines.size() > 0 and String(lines.back()).is_empty():
			lines.pop_back()

	var payload := {
		"event": "debug_output_frame",
		"data": {
			"timestamp": Time.get_ticks_msec(),
			"chunk": chunk,
			"lines": lines,
			"reset": reset
		}
	}

	for client_id in _subscribers.keys():
		_send_event_to_client(int(client_id), payload)

func _send_event_to_client(client_id: int, payload: Dictionary) -> void:
	if websocket_server == null:
		return
	websocket_server.send_event(client_id, payload)

func _fetch_log_text() -> String:
	var control := _get_output_control()
	var detail_notes: Array = []
	var text := ""
	_last_control_class = ""

	if is_instance_valid(control):
		_last_control_class = control.get_class()
		if control.is_inside_tree():
			_last_control_path = String(control.get_path())
		else:
			_last_control_path = ""

		text = _extract_text_from_control(control)
		if not text.is_empty():
			_record_capture("control", "class=%s len=%d" % [_last_control_class, text.length()])
			return text
		detail_notes.append("control(%s) empty" % _last_control_class)
	else:
		_last_control_path = ""
		detail_notes.append("control missing")

	text = _fetch_debugger_log_text()
	if not text.is_empty():
		_record_capture("debugger", "len=%d" % text.length())
		return text
	detail_notes.append("debugger empty")

	text = _fetch_log_file_text()
	if not text.is_empty():
		var path_info := _last_log_file_path if not _last_log_file_path.is_empty() else "unknown"
		_record_capture("file", "path=%s len=%d" % [path_info, text.length()])
		return text
	detail_notes.append("log file missing")
	if not _last_control_search_summary.is_empty():
		detail_notes.append(_last_control_search_summary)

	_record_capture("none", "; ".join(detail_notes))
	return ""

func _record_capture(source: String, detail: String) -> void:
	_last_capture_source = source
	_last_capture_detail = detail
	_last_capture_timestamp = Time.get_ticks_msec()

func _extract_text_from_control(control: Object) -> String:
	if not is_instance_valid(control):
		return ""

	if control.has_method("get_parsed_text"):
		return String(control.call("get_parsed_text"))
	if control.has_method("get_text"):
		return String(control.call("get_text"))
	if control.has_method("get_full_text"):
		return String(control.call("get_full_text"))
	if control.has_method("get_line_count") and control.has_method("get_line"):
		var lines: Array = []
		var count := int(control.call("get_line_count"))
		for i in range(count):
			lines.append(String(control.call("get_line", i)))
		return "\n".join(lines)
	return ""

func _fetch_debugger_log_text() -> String:
	if Engine.has_singleton("EditorDebuggerNode"):
		var debugger = Engine.get_singleton("EditorDebuggerNode")
		if debugger and debugger.has_method("get_log"):
			return String(debugger.call("get_log"))
	if has_node("/root/EditorNode/DebuggerPanel"):
		var debugger_panel = get_node("/root/EditorNode/DebuggerPanel")
		if debugger_panel and debugger_panel.has_method("get_output"):
			return String(debugger_panel.call("get_output"))
	return ""

func _fetch_log_file_text() -> String:
	if not Engine.is_editor_hint():
		return ""
	var user_dir := ProjectSettings.globalize_path("user://")
	_last_log_file_path = ""
	var path_candidates: Array = [
		"editor/editor.log",
		"user/editor/editor.log",
		"logs/editor.log",
		"editor.log"
	]

	for relative_path in path_candidates:
		var candidate := user_dir.path_join(relative_path)
		if FileAccess.file_exists(candidate):
			_last_log_file_path = candidate
			break

	if _last_log_file_path.is_empty():
		return ""

	var file := FileAccess.open(_last_log_file_path, FileAccess.READ)
	if file == null:
		_last_log_file_path = ""
		return ""

	var content := file.get_as_text()
	file.close()
	return content

func _locate_output_control() -> Control:
	var summary: Array = []

	if not Engine.is_editor_hint():
		_last_control_search_summary = "editor_hint=false"
		return null
	summary.append("editor_hint=true")

	var base_control_result: Dictionary = {}
	var base_control: Control = null

	if Engine.has_meta("GodotMCPPlugin"):
		var plugin = Engine.get_meta("GodotMCPPlugin")
		if plugin and plugin is EditorPlugin:
			var editor_interface = plugin.get_editor_interface()
			if editor_interface and editor_interface.has_method("get_base_control"):
				base_control = editor_interface.call("get_base_control")
				if is_instance_valid(base_control):
					summary.append("direct_base_control=valid")
					base_control_result = _search_control_tree(base_control)
					if not base_control_result.is_empty():
						summary.append("direct_score=%d" % int(base_control_result.get("score", 0)))
						summary.append("direct_visited=%d" % int(base_control_result.get("visited", 0)))
						var direct_class := String(base_control_result.get("class", ""))
						if not direct_class.is_empty():
							summary.append("direct_class=%s" % direct_class)
						var direct_path := String(base_control_result.get("path", ""))
						if not direct_path.is_empty():
							summary.append("direct_path=%s" % _summarize_summary_value(direct_path))
						if int(base_control_result.get("score", 0)) >= OUTPUT_SCORE_THRESHOLD and base_control_result.get("control"):
							_last_control_search_summary = "; ".join(summary)
							return base_control_result.get("control")
				else:
					summary.append("direct_base_control=invalid")
			else:
				summary.append("direct_base_control=missing")
		else:
			summary.append("direct_plugin=invalid")
	else:
		summary.append("direct_plugin=missing")

	var has_editor_node := Engine.has_singleton("EditorNode")
	summary.append("editor_node_singleton=%s" % ("true" if has_editor_node else "false"))
	if not has_editor_node:
		_last_control_search_summary = "; ".join(summary)
		return null

	var editor_node = Engine.get_singleton("EditorNode")
	if editor_node == null:
		summary.append("editor_node=null")
		_last_control_search_summary = "; ".join(summary)
		return null
	summary.append("editor_node=valid")

	var search_roots: Array = []
	var root_labels: Dictionary = {}
	var root_ids: Dictionary = {}

	if editor_node.has_method("get_log"):
		var editor_log = editor_node.call("get_log")
		var valid_log := is_instance_valid(editor_log)
		summary.append("get_log=%s" % ("valid" if valid_log else "invalid"))
		if valid_log:
			_register_control_root(search_roots, root_labels, root_ids, editor_log, "editor_log")
	else:
		summary.append("get_log=missing")

	if editor_node.has_method("get_gui_base"):
		var gui_base = editor_node.call("get_gui_base")
		var valid_gui := is_instance_valid(gui_base)
		summary.append("get_gui_base=%s" % ("valid" if valid_gui else "invalid"))
		if valid_gui:
			_register_control_root(search_roots, root_labels, root_ids, gui_base, "gui_base")
	else:
		summary.append("get_gui_base=missing")

	if is_instance_valid(base_control):
		_register_control_root(search_roots, root_labels, root_ids, base_control, "base_control")

	if Engine.has_meta("GodotMCPPlugin"):
		var plugin_again = Engine.get_meta("GodotMCPPlugin")
		if plugin_again and plugin_again is EditorPlugin:
			var editor_interface_again = plugin_again.get_editor_interface()
			if editor_interface_again:
				if editor_interface_again.has_method("get_editor_main_screen"):
					var main_screen = editor_interface_again.call("get_editor_main_screen")
					var valid_main := is_instance_valid(main_screen)
					summary.append("plugin_main_screen=%s" % ("valid" if valid_main else "invalid"))
					if valid_main:
						_register_control_root(search_roots, root_labels, root_ids, main_screen, "main_screen")
				else:
					summary.append("plugin_main_screen=missing")
			else:
				summary.append("editor_interface=null")
		else:
			summary.append("mcp_plugin=invalid")
	else:
		summary.append("mcp_plugin=missing")

	var scene_tree := get_tree()
	if scene_tree:
		var tree_root := scene_tree.get_root()
		var valid_root := is_instance_valid(tree_root)
		summary.append("scene_tree_root=%s" % ("valid" if valid_root else "invalid"))
		if valid_root:
			_register_control_root(search_roots, root_labels, root_ids, tree_root, "scene_tree_root")
	else:
		summary.append("scene_tree=null")

	var total_visited := 0
	var best_control: Control = null
	var best_score := 0
	var best_label := ""
	var best_class := ""
	var best_path := ""

	for root in search_roots:
		var result := _search_control_tree(root)
		var id = root.get_instance_id()
		var label := String(root_labels.get(id, "root"))
		total_visited += int(result.get("visited", 0))
		var score := int(result.get("score", 0))
		if score > best_score:
			best_score = score
			best_control = result.get("control")
			best_label = label
			best_class = String(result.get("class", ""))
			best_path = String(result.get("path", ""))

	summary.append("search_roots=%d" % search_roots.size())
	summary.append("search_total_visited=%d" % total_visited)
	if best_score > 0:
		summary.append("search_best_score=%d" % best_score)
		if not best_label.is_empty():
			summary.append("search_best_label=%s" % best_label)
		if not best_class.is_empty():
			summary.append("search_best_class=%s" % best_class)
		if not best_path.is_empty():
			summary.append("search_best_path=%s" % _summarize_summary_value(best_path))
	else:
		summary.append("search_best_score=0")

	if best_control and best_score >= OUTPUT_SCORE_THRESHOLD:
		_last_control_search_summary = "; ".join(summary)
		return best_control

	_last_control_search_summary = "; ".join(summary)
	return null

func _search_control_tree(root: Node) -> Dictionary:
	var visited: Dictionary = {}
	var queue: Array = []
	var visited_count := 0
	var best_control: Control = null
	var best_score := 0
	var best_class := ""
	var best_path := ""

	if is_instance_valid(root):
		queue.append(root)

	while queue.size() > 0:
		var candidate = queue.pop_front()
		if not (candidate is Node):
			continue

		var node: Node = candidate
		var instance_id := node.get_instance_id()
		if visited.has(instance_id):
			continue
		visited[instance_id] = true
		visited_count += 1

		if node is Control:
			var control_node: Control = node
			var score := _score_output_control(control_node)
			if score > best_score:
				best_score = score
				best_control = control_node
				best_class = control_node.get_class()
				if control_node.is_inside_tree():
					best_path = String(control_node.get_path())
				else:
					best_path = String(control_node.name) if control_node.has_method("get_name") else "<detached>"

		for child in node.get_children():
			queue.append(child)

	return {
		"control": best_control,
		"score": best_score,
		"class": best_class,
		"path": best_path,
		"visited": visited_count
	}

func _register_control_root(search_roots: Array, root_labels: Dictionary, root_ids: Dictionary, node: Node, label: String) -> void:
	if not is_instance_valid(node):
		return
	var id := node.get_instance_id()
	if root_ids.has(id):
		return
	root_ids[id] = true
	search_roots.append(node)
	root_labels[id] = label

func _summarize_summary_value(text: String) -> String:
	if text.is_empty():
		return text
	if text.length() <= SUMMARY_VALUE_MAX_LEN:
		return text
	return text.substr(0, SUMMARY_VALUE_MAX_LEN - 3) + "..."

func _score_output_control(node: Control) -> int:
	if node == null:
		return 0

	var score := 0

	if node.is_class("RichTextLabel"):
		score = max(score, 30)
	elif node.is_class("TextEdit") or node.is_class("CodeEdit"):
		score = max(score, 25)
	else:
		return 0

	if _has_editor_log_ancestor(node):
		score = max(score, 100)

	var node_name := String(node.name).to_lower()
	for keyword in OUTPUT_KEYWORDS:
		if node_name.find(keyword) != -1:
			score = max(score, 80)
			break

	var theme_type := ""
	if node.has_method("get_theme_type_variation"):
		theme_type = String(node.call("get_theme_type_variation")).to_lower()
		for keyword in OUTPUT_KEYWORDS:
			if theme_type.find(keyword) != -1:
				score = max(score, 75)
				break

	var parent := node.get_parent()
	var depth := 0
	while parent and depth < 6:
		var parent_name := String(parent.name).to_lower()
		for keyword in OUTPUT_KEYWORDS:
			if parent_name.find(keyword) != -1:
				var parent_score := 70 - depth * 5
				if parent_score > score:
					score = parent_score
				break
		if parent.is_class("EditorLog"):
			score = max(score, 95)
		parent = parent.get_parent()
		depth += 1

	if node.is_inside_tree():
		var path_lower := String(node.get_path()).to_lower()
		for keyword in OUTPUT_KEYWORDS:
			if path_lower.find(keyword) != -1:
				score = max(score, 70)
				break

	return score

func _has_editor_log_ancestor(node: Node) -> bool:
	var current := node.get_parent()
	while current:
		if current.is_class("EditorLog"):
			return true
		current = current.get_parent()
	return false

func _get_output_control() -> Control:
	if is_instance_valid(_cached_output_control):
		return _cached_output_control
	_cached_output_control = _locate_output_control()
	return _cached_output_control

func get_full_log_text() -> String:
	return _fetch_log_text()

func get_capture_diagnostics() -> Dictionary:
	return {
		"source": _last_capture_source,
		"detail": _last_capture_detail,
		"timestamp": _last_capture_timestamp,
		"control_class": _last_control_class,
		"control_path": _last_control_path,
		"log_file_path": _last_log_file_path,
		"control_search": _last_control_search_summary
	}
