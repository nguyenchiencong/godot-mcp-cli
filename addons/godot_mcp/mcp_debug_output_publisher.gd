@tool
class_name MCPDebugOutputPublisher
extends Node

const POLL_INTERVAL_SECONDS := 0.5
const OUTPUT_SCORE_THRESHOLD := 60
const OUTPUT_KEYWORDS := ["output", "console", "log", "stdout"]
const ERRORS_SCORE_THRESHOLD := 25
const ERRORS_KEYWORDS := [
	"error", "errors", "warning", "warnings",
	"stack", "trace", "gdscript", "issues"
]
const STACK_TRACE_SCORE_THRESHOLD := 65
const STACK_TRACE_KEYWORDS := [
	"stack", "trace", "callstack", "call_stack", "stack trace", "call stack"
]
const STACK_FRAMES_SCORE_THRESHOLD := 65
const STACK_FRAMES_KEYWORDS := [
	"stack frames",
	"frames",
	"frame list",
	"call frames",
	"call stack",
	"stackframe",
	"frames panel"
]
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
	var result := _locate_control_with_scoring(Callable(self, "_score_output_control"), OUTPUT_SCORE_THRESHOLD)
	_last_control_search_summary = String(result.get("summary", ""))
	return result.get("control")

func _locate_control_with_scoring(scoring_func: Callable, threshold: int) -> Dictionary:
	var summary: Array = []

	if not Engine.is_editor_hint():
		return {
			"control": null,
			"summary": "editor_hint=false"
		}
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
					base_control_result = _search_control_tree(base_control, scoring_func)
					if not base_control_result.is_empty():
						summary.append("direct_score=%d" % int(base_control_result.get("score", 0)))
						summary.append("direct_visited=%d" % int(base_control_result.get("visited", 0)))
						var direct_class := String(base_control_result.get("class", ""))
						if not direct_class.is_empty():
							summary.append("direct_class=%s" % direct_class)
						var direct_path := String(base_control_result.get("path", ""))
						if not direct_path.is_empty():
							summary.append("direct_path=%s" % _summarize_summary_value(direct_path))
						if int(base_control_result.get("score", 0)) >= threshold and base_control_result.get("control"):
							return {
								"control": base_control_result.get("control"),
								"summary": "; ".join(summary)
							}
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
		return {"control": null, "summary": "; ".join(summary)}

	var editor_node = Engine.get_singleton("EditorNode")
	if editor_node == null:
		summary.append("editor_node=null")
		return {"control": null, "summary": "; ".join(summary)}
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
		var result := _search_control_tree(root, scoring_func)
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

	var summary_text := "; ".join(summary)
	if best_control and best_score >= threshold:
		return {
			"control": best_control,
			"summary": summary_text
		}

	return {
		"control": null,
		"summary": summary_text
	}

func _search_control_tree(root: Node, scoring_func: Callable = Callable()) -> Dictionary:
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
			var score := 0
			if scoring_func.is_valid():
				score = int(scoring_func.call(control_node))
			else:
				score = _score_output_control(control_node)
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
	return _score_control_with_keywords(node, OUTPUT_KEYWORDS)

func _score_errors_control(node: Control) -> int:
	return _score_control_with_keywords(node, ERRORS_KEYWORDS)

func _score_control_with_keywords(node: Control, keywords: Array) -> int:
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
	for keyword in keywords:
		if node_name.find(keyword) != -1:
			score = max(score, 80)
			break

	var theme_type := ""
	if node.has_method("get_theme_type_variation"):
		theme_type = String(node.call("get_theme_type_variation")).to_lower()
		for keyword in keywords:
			if theme_type.find(keyword) != -1:
				score = max(score, 75)
				break

	var parent := node.get_parent()
	var depth := 0
	while parent and depth < 6:
		var parent_name := String(parent.name).to_lower()
		for keyword in keywords:
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
		for keyword in keywords:
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

func clear_log_output() -> Dictionary:
	var diagnostics := {
		"timestamp": Time.get_ticks_msec(),
		"attempts": []
	}

	if not Engine.is_editor_hint():
		diagnostics["error"] = "not_in_editor"
		return {
			"cleared": false,
			"method": "editor_only",
			"diagnostics": diagnostics
		}

	var cleared := false
	var method_used := ""

	var editor_node = Engine.get_singleton("EditorNode") if Engine.has_singleton("EditorNode") else null
	if editor_node and editor_node.has_method("get_log"):
		var editor_log = editor_node.call("get_log")
		if is_instance_valid(editor_log):
			diagnostics["attempts"].append("editor_log")
			if editor_log.has_method("clear"):
				editor_log.call("clear")
				cleared = true
				method_used = "editor_log_clear"
			elif editor_log.has_method("set_text"):
				editor_log.call("set_text", "")
				cleared = true
				method_used = "editor_log_set_text"

	if not cleared and Engine.has_singleton("EditorDebuggerNode"):
		var debugger_node = Engine.get_singleton("EditorDebuggerNode")
		if debugger_node and debugger_node.has_method("clear_log"):
			diagnostics["attempts"].append("editor_debugger_node")
			debugger_node.call("clear_log")
			cleared = true
			method_used = "editor_debugger_clear_log"

	if not cleared:
		var control := _get_output_control()
		if is_instance_valid(control):
			diagnostics["attempts"].append("output_control_%s" % control.get_class())
			if control.has_method("clear"):
				control.call("clear")
				cleared = true
				method_used = "control_clear"
			elif control.has_method("set_text"):
				control.call("set_text", "")
				cleared = true
				method_used = "control_set_text"

	if cleared:
		_last_length = 0
		_broadcast_log_reset()

	diagnostics["cleared"] = cleared
	diagnostics["method"] = method_used

	return {
		"cleared": cleared,
		"method": method_used,
		"diagnostics": diagnostics
	}

func _broadcast_log_reset() -> void:
	if _subscribers.is_empty() or websocket_server == null:
		return

	var payload := {
		"event": "debug_output_frame",
		"data": {
			"timestamp": Time.get_ticks_msec(),
			"chunk": "",
			"lines": [],
			"reset": true
		}
	}

	for client_id in _subscribers.keys():
		_send_event_to_client(int(client_id), payload)

func get_errors_panel_snapshot() -> Dictionary:
	return _capture_errors_tab_text()

func get_stack_trace_snapshot(session_id: int = -1) -> Dictionary:
	return _capture_stack_trace_panel(session_id)

func get_stack_frames_snapshot(session_id: int = -1) -> Dictionary:
	return _capture_stack_frames_panel(session_id)

func _gather_editor_search_roots() -> Array:
	var search_roots: Array = []

	var editor_node = Engine.get_singleton("EditorNode") if Engine.has_singleton("EditorNode") else null
	if editor_node:
		if editor_node.has_method("get_log"):
			var editor_log = editor_node.call("get_log")
			if is_instance_valid(editor_log):
				search_roots.append(editor_log)
		search_roots.append(editor_node)

	var plugin = Engine.get_meta("GodotMCPPlugin") if Engine.has_meta("GodotMCPPlugin") else null
	if plugin and plugin is EditorPlugin:
		var editor_interface = plugin.get_editor_interface()
		if editor_interface and editor_interface.has_method("get_base_control"):
			var base_control = editor_interface.call("get_base_control")
			if is_instance_valid(base_control):
				search_roots.append(base_control)

	var scene_tree := get_tree()
	if scene_tree:
		var tree_root := scene_tree.get_root()
		if is_instance_valid(tree_root):
			search_roots.append(tree_root)

	if Engine.has_singleton("EditorDebuggerNode"):
		var debugger_node = Engine.get_singleton("EditorDebuggerNode")
		if debugger_node and debugger_node is Node and is_instance_valid(debugger_node):
			search_roots.append(debugger_node)
			if debugger_node.has_method("get_gui_base"):
				var debugger_gui = debugger_node.call("get_gui_base")
				if is_instance_valid(debugger_gui):
					search_roots.append(debugger_gui)

	var debugger_panel := get_node_or_null("/root/EditorNode/DebuggerPanel")
	if debugger_panel and is_instance_valid(debugger_panel):
		search_roots.append(debugger_panel)

	return search_roots

func _capture_errors_tab_text() -> Dictionary:
	var diagnostics := {
		"source": "errors_tab_lookup",
		"timestamp": Time.get_ticks_msec(),
		"control_found": false,
		"search_summary": ""
	}

	if not Engine.is_editor_hint():
		diagnostics["error"] = "not_in_editor"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	var search_roots := _gather_editor_search_roots()

	var aggregated_summary: Array = []
	var tab_info := {}
	for root in search_roots:
		tab_info = _find_errors_tab_control(root)
		var summary := String(tab_info.get("summary", ""))
		if not summary.is_empty():
			aggregated_summary.append(summary)
		if tab_info.has("control"):
			break

	diagnostics["search_summary"] = " | ".join(aggregated_summary) if aggregated_summary.size() > 0 else ""

	if tab_info.is_empty() or not tab_info.has("control"):
		diagnostics["error"] = "errors_tab_not_found"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	var tab_control: Control = tab_info.get("control")
	if not is_instance_valid(tab_control):
		diagnostics["error"] = "tab_control_invalid"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"diagnostics": diagnostics
		}

	diagnostics["control_found"] = true
	diagnostics["tab_title"] = tab_info.get("tab_title", "")
	if tab_control.is_inside_tree():
		diagnostics["control_path"] = String(tab_control.get_path())
	else:
		diagnostics["control_path"] = ""

	var tree := _find_descendant_tree(tab_control)
	var lines: Array = []
	var text := ""

	if tree:
		diagnostics["tree_path"] = String(tree.get_path()) if tree.is_inside_tree() else ""
		lines = _collect_tree_lines(tree)
		text = "\n".join(lines)
	else:
		text = _extract_text_from_control(tab_control)
		if not text.is_empty():
			lines = text.split("\n", false)

	return {
		"text": text,
		"lines": lines,
		"line_count": lines.size(),
		"diagnostics": diagnostics
	}

func _capture_stack_trace_panel(session_id: int) -> Dictionary:
	var diagnostics := {
		"source": "stack_trace_lookup",
		"timestamp": Time.get_ticks_msec(),
		"control_found": false,
		"search_summary": ""
	}

	if not Engine.is_editor_hint():
		diagnostics["error"] = "not_in_editor"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var search_roots := _gather_editor_search_roots()
	if search_roots.is_empty():
		diagnostics["error"] = "search_roots_empty"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var aggregated_summary: Array = []
	var panel_info := {}
	for root in search_roots:
		panel_info = _find_stack_trace_control(root)
		var summary := String(panel_info.get("summary", ""))
		if not summary.is_empty():
			aggregated_summary.append(summary)
		if panel_info.has("control"):
			break

	if aggregated_summary.size() > 0:
		diagnostics["search_summary"] = " | ".join(aggregated_summary)

	if panel_info.is_empty() or not panel_info.has("control"):
		diagnostics["error"] = "stack_trace_panel_not_found"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var panel_control: Control = panel_info.get("control")
	if not is_instance_valid(panel_control):
		diagnostics["error"] = "panel_control_invalid"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	diagnostics["control_found"] = true
	diagnostics["control_class"] = panel_control.get_class()
	diagnostics["control_path"] = String(panel_control.get_path()) if panel_control.is_inside_tree() else ""
	if panel_info.has("tab_title"):
		diagnostics["tab_title"] = panel_info.get("tab_title")
	if panel_info.has("score"):
		diagnostics["match_score"] = panel_info.get("score")
	if panel_info.has("fallback_source"):
		diagnostics["fallback_source"] = panel_info.get("fallback_source")
	diagnostics["panel_children"] = _summarize_control_structure(panel_control, 2, 64)

	var lines: Array = []
	var frames: Array = []
	var text := ""

	var tree: Tree = null
	if panel_info.has("tree"):
		tree = panel_info.get("tree")
	if not is_instance_valid(tree) and panel_control is Tree:
		tree = panel_control

	if is_instance_valid(tree):
		diagnostics["tree_path"] = String(tree.get_path()) if tree.is_inside_tree() else ""
		diagnostics["tree_item_count"] = _count_tree_items(tree)
		lines = _collect_tree_lines(tree)
		text = "\n".join(lines)
		frames = _collect_stack_tree_frames(tree)
		if lines.is_empty() and text.is_empty():
			var fallback_text_control := _find_descendant_text_control(panel_control)
			if is_instance_valid(fallback_text_control):
				diagnostics["text_control_path"] = String(fallback_text_control.get_path()) if fallback_text_control.is_inside_tree() else ""
				diagnostics["text_control_class"] = fallback_text_control.get_class()
				text = _extract_text_from_control(fallback_text_control)
				if not text.is_empty():
					lines = text.split("\n", false)
					frames = _derive_frames_from_lines(lines)
					if frames.is_empty():
						diagnostics["fallback_text_source"] = "stack_panel_text_control"
	else:
		var text_control := _find_descendant_text_control(panel_control)
		var capture_control: Control = panel_control
		if is_instance_valid(text_control):
			capture_control = text_control
			diagnostics["text_control_path"] = String(text_control.get_path()) if text_control.is_inside_tree() else ""
			diagnostics["text_control_class"] = text_control.get_class()

		text = _extract_text_from_control(capture_control)
		if not text.is_empty():
			lines = text.split("\n", false)
			frames = _derive_frames_from_lines(lines)

	return {
		"text": text,
		"lines": lines,
		"line_count": lines.size(),
		"frames": frames,
		"diagnostics": diagnostics
	}

func _capture_stack_frames_panel(session_id: int) -> Dictionary:
	var diagnostics := {
		"source": "stack_frames_lookup",
		"timestamp": Time.get_ticks_msec(),
		"control_found": false,
		"search_summary": ""
	}

	if not Engine.is_editor_hint():
		diagnostics["error"] = "not_in_editor"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var search_roots := _gather_editor_search_roots()
	if search_roots.is_empty():
		diagnostics["error"] = "search_roots_empty"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var aggregated_summary: Array = []
	var panel_info := {}
	for root in search_roots:
		panel_info = _find_stack_frames_control(root)
		var summary := String(panel_info.get("summary", ""))
		if not summary.is_empty():
			aggregated_summary.append(summary)
		if panel_info.has("control"):
			break

	if aggregated_summary.size() > 0:
		diagnostics["search_summary"] = " | ".join(aggregated_summary)

	if panel_info.is_empty() or not panel_info.has("control"):
		diagnostics["error"] = "stack_frames_panel_not_found"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	var panel_control: Control = panel_info.get("control")
	if not is_instance_valid(panel_control):
		diagnostics["error"] = "panel_control_invalid"
		return {
			"text": "",
			"lines": [],
			"line_count": 0,
			"frames": [],
			"diagnostics": diagnostics
		}

	diagnostics["control_found"] = true
	diagnostics["control_class"] = panel_control.get_class()
	diagnostics["control_path"] = String(panel_control.get_path()) if panel_control.is_inside_tree() else ""
	if panel_info.has("tab_title"):
		diagnostics["tab_title"] = panel_info.get("tab_title")
	if panel_info.has("score"):
		diagnostics["match_score"] = panel_info.get("score")
	diagnostics["panel_children"] = _summarize_control_structure(panel_control, 2, 64)

	var lines: Array = []
	var text := ""
	var frames: Array = []

	var tree: Tree = null
	if panel_info.has("tree"):
		tree = panel_info.get("tree")
	if not is_instance_valid(tree) and panel_control is Tree:
		tree = panel_control

	if is_instance_valid(tree):
		diagnostics["tree_path"] = String(tree.get_path()) if tree.is_inside_tree() else ""
		diagnostics["tree_item_count"] = _count_tree_items(tree)
		lines = _collect_tree_lines(tree)
		text = "\n".join(lines)
		frames = _collect_stack_tree_frames(tree)
		if lines.is_empty() and frames.is_empty():
			var text_control := _find_descendant_text_control(panel_control)
			if is_instance_valid(text_control):
				diagnostics["text_control_path"] = String(text_control.get_path()) if text_control.is_inside_tree() else ""
				diagnostics["text_control_class"] = text_control.get_class()
				text = _extract_text_from_control(text_control)
				if not text.is_empty():
					lines = text.split("\n", false)
					frames = _derive_frames_from_lines(lines)
					if frames.is_empty():
						diagnostics["fallback_text_source"] = "stack_frames_text_control"
	else:
		var text_control := _find_descendant_text_control(panel_control)
		var capture_control: Control = panel_control
		if is_instance_valid(text_control):
			capture_control = text_control
			diagnostics["text_control_path"] = String(text_control.get_path()) if text_control.is_inside_tree() else ""
			diagnostics["text_control_class"] = text_control.get_class()

		text = _extract_text_from_control(capture_control)
		if not text.is_empty():
			lines = text.split("\n", false)
			frames = _derive_frames_from_lines(lines)

	return {
		"text": text,
		"lines": lines,
		"line_count": lines.size(),
		"frames": frames,
		"diagnostics": diagnostics
	}

func _find_errors_tab_control(root: Node) -> Dictionary:
	var queue: Array = []
	var summary := []
	if is_instance_valid(root):
		queue.append(root)
	else:
		return {}

	var visited := 0

	while queue.size() > 0:
		var candidate = queue.pop_front()
		if not is_instance_valid(candidate):
			continue
		visited += 1

		if candidate is TabContainer:
			var tab_container: TabContainer = candidate
			var tab_count := 0
			if tab_container.has_method("get_tab_count"):
				tab_count = tab_container.get_tab_count()
			else:
				tab_count = tab_container.get_child_count()

			for i in range(tab_count):
				var title := ""
				if tab_container.has_method("get_tab_title"):
					title = String(tab_container.get_tab_title(i))
				var title_lower := title.to_lower()
				if title_lower.find("error") != -1:
					var tab_control: Control = null
					if tab_container.has_method("get_tab_control"):
						tab_control = tab_container.get_tab_control(i)
					if not is_instance_valid(tab_control):
						# Fallback: try to get nth child
						if i < tab_container.get_child_count():
							var child = tab_container.get_child(i)
							if child is Control:
								tab_control = child

					if is_instance_valid(tab_control):
						tab_control = _unwrap_tab_content(tab_control)
						summary.append("tab_found=%s" % title)
						summary.append("visited=%d" % visited)
						return {
							"control": tab_control,
							"tab_title": title,
							"summary": "; ".join(summary)
						}
		for child in candidate.get_children():
			if child is Node:
				queue.append(child)

	return {"summary": "; ".join(summary)}

func _find_stack_trace_control(root: Node) -> Dictionary:
	var queue: Array = []
	var summary := []
	if is_instance_valid(root):
		queue.append(root)
	else:
		return {}

	var visited := 0
	var max_nodes := 8192

	while queue.size() > 0 and visited < max_nodes:
		var candidate = queue.pop_front()
		if not is_instance_valid(candidate):
			continue
		visited += 1

		if candidate is TabContainer:
			var tab_container: TabContainer = candidate
			var tab_count := 0
			if tab_container.has_method("get_tab_count"):
				tab_count = tab_container.get_tab_count()
			else:
				tab_count = tab_container.get_child_count()
			for i in range(tab_count):
				var title := ""
				if tab_container.has_method("get_tab_title"):
					title = String(tab_container.get_tab_title(i))
				var title_lower := title.to_lower()
				for keyword in STACK_TRACE_KEYWORDS:
					if title_lower.find(keyword) != -1:
						var tab_control: Control = null
						if tab_container.has_method("get_tab_control"):
							tab_control = tab_container.get_tab_control(i)
						if not is_instance_valid(tab_control) and i < tab_container.get_child_count():
							var child = tab_container.get_child(i)
							if child is Control:
								tab_control = child

						if is_instance_valid(tab_control):
							tab_control = _unwrap_tab_content(tab_control)
							var tree := _find_descendant_tree(tab_control)
							summary.append("tab_found=%s" % title)
							summary.append("visited=%d" % visited)
							return {
								"control": tab_control,
								"tree": tree,
								"tab_title": title,
								"summary": "; ".join(summary)
							}
						break

		if candidate is Control:
			var control_score := _score_stack_trace_candidate(candidate)
			if control_score >= STACK_TRACE_SCORE_THRESHOLD:
				var matched_control: Control = candidate
				var tree_control: Tree = candidate if candidate is Tree else _find_descendant_tree(candidate)
				var info := {
					"control": matched_control,
					"score": control_score,
					"summary": "score=%d name=%s class=%s visited=%d" % [control_score, candidate.name, candidate.get_class(), visited]
				}
				if tree_control:
					info["tree"] = tree_control
				return info

		for child in candidate.get_children():
			if child is Node:
				queue.append(child)

	summary.append("visited=%d" % visited)
	return {"summary": "; ".join(summary)}

func _find_stack_frames_control(root: Node) -> Dictionary:
	var queue: Array = []
	var summary := []
	if is_instance_valid(root):
		queue.append(root)
	else:
		return {}

	var visited := 0
	var max_nodes := 8192

	while queue.size() > 0 and visited < max_nodes:
		var candidate = queue.pop_front()
		if not is_instance_valid(candidate):
			continue
		visited += 1

		if candidate is TabContainer:
			var tab_container: TabContainer = candidate
			var tab_count := 0
			if tab_container.has_method("get_tab_count"):
				tab_count = tab_container.get_tab_count()
			else:
				tab_count = tab_container.get_child_count()
			for i in range(tab_count):
				var title := ""
				if tab_container.has_method("get_tab_title"):
					title = String(tab_container.get_tab_title(i))
				var title_lower := title.to_lower()
				if _title_matches_stack_frames(title_lower):
					var tab_control: Control = null
					if tab_container.has_method("get_tab_control"):
						tab_control = tab_container.get_tab_control(i)
					if not is_instance_valid(tab_control) and i < tab_container.get_child_count():
						var child = tab_container.get_child(i)
						if child is Control:
							tab_control = child

					if is_instance_valid(tab_control):
						tab_control = _unwrap_tab_content(tab_control)
						var tree := _find_descendant_tree(tab_control)
						summary.append("tab_found=%s" % title)
						summary.append("visited=%d" % visited)
						return {
							"control": tab_control,
							"tree": tree,
							"tab_title": title,
							"summary": "; ".join(summary)
						}

		if candidate is Control:
			var control_score := _score_stack_frames_candidate(candidate)
			if control_score >= STACK_FRAMES_SCORE_THRESHOLD:
				var matched_control: Control = candidate
				var tree_control: Tree = candidate if candidate is Tree else _find_descendant_tree(candidate)
				var info := {
					"control": matched_control,
					"score": control_score,
					"summary": "score=%d name=%s class=%s visited=%d" % [control_score, candidate.name, candidate.get_class(), visited]
				}
				if tree_control:
					info["tree"] = tree_control
				return info

		for child in candidate.get_children():
			if child is Node:
				queue.append(child)

	summary.append("visited=%d" % visited)
	var fallback_info := _find_stack_trace_control(root)
	if fallback_info.has("control"):
		fallback_info["fallback_source"] = "stack_trace_lookup"
		var combined_summary := "; ".join(summary)
		if fallback_info.has("summary") and not String(fallback_info["summary"]).is_empty():
			combined_summary = "%s | %s" % [combined_summary, fallback_info["summary"]]
		fallback_info["summary"] = combined_summary
		return fallback_info
	return {"summary": "; ".join(summary)}

func _score_stack_trace_candidate(node: Control) -> int:
	var score := 0
	var name_lower := String(node.name).to_lower()
	for keyword in STACK_TRACE_KEYWORDS:
		if name_lower.find(keyword) != -1:
			score += 35
			break

	var class_lower := node.get_class().to_lower()
	if class_lower.find("stack") != -1 or class_lower.find("trace") != -1:
		score += 20

	if node is Tree:
		score += 20

	var parent := node.get_parent()
	var depth := 0
	while parent and depth < 4:
		var parent_name := String(parent.name).to_lower()
		if parent_name.find("debug") != -1 or parent_name.find("stack") != -1:
			score += 10
			break
		parent = parent.get_parent()
		depth += 1

	if node.is_inside_tree():
		var path_lower := String(node.get_path()).to_lower()
		for keyword in STACK_TRACE_KEYWORDS:
			if path_lower.find(keyword) != -1:
				score += 10
				break

	return score

func _score_stack_frames_candidate(node: Control) -> int:
	var score := 0
	var name_lower := String(node.name).to_lower()
	if name_lower.find("frame") != -1 and name_lower.find("stack") != -1:
		score += 35
	else:
		for keyword in STACK_FRAMES_KEYWORDS:
			if name_lower.find(keyword) != -1:
				score += 35
				break

	var class_lower := node.get_class().to_lower()
	if class_lower.find("frame") != -1 and class_lower.find("stack") != -1:
		score += 20

	if node is Tree:
		score += 20

	var parent := node.get_parent()
	var depth := 0
	while parent and depth < 4:
		var parent_name := String(parent.name).to_lower()
		if parent_name.find("frame") != -1 and parent_name.find("stack") != -1:
			score += 10
			break
		if parent_name.find("call stack") != -1:
			score += 10
			break
		parent = parent.get_parent()
		depth += 1

	if node.is_inside_tree():
		var path_lower := String(node.get_path()).to_lower()
		if path_lower.find("frame") != -1 and path_lower.find("stack") != -1:
			score += 10
		elif path_lower.find("call_stack") != -1 or path_lower.find("call stack") != -1:
			score += 10

	return score

func _title_matches_stack_frames(title_lower: String) -> bool:
	if title_lower.is_empty():
		return false
	if title_lower.find("stack frames") != -1 or title_lower.find("stack frame") != -1:
		return true
	if title_lower.find("call stack") != -1:
		return true
	if title_lower.find("frame") != -1 and title_lower.find("stack") != -1:
		return true
	for keyword in STACK_FRAMES_KEYWORDS:
		if title_lower.find(keyword) != -1:
			return true
	return false

func _collect_stack_tree_frames(tree: Tree) -> Array:
	var frames: Array = []
	if not is_instance_valid(tree):
		return frames

	var root := tree.get_root()
	if not root:
		return frames

	var item := root.get_first_child()
	var fallback_index := 0
	while item:
		frames.append(_build_stack_frame_from_item(item, tree.columns, fallback_index))
		fallback_index += 1
		item = item.get_next()

	return frames

func _build_stack_frame_from_item(item: TreeItem, column_count: int, fallback_index: int) -> Dictionary:
	var columns: Array = []
	for col in range(column_count):
		columns.append(String(item.get_text(col)))

	var function_name := ""
	var location := ""

	if columns.size() >= 2:
		function_name = columns[1]
	if columns.size() >= 3:
		location = columns[2]
	elif columns.size() >= 2:
		location = columns[1]

	var script_path := ""
	var line_number := -1

	if not location.is_empty():
		var split := location.rsplit(":", false, 1)
		if split.size() == 2:
			var potential_line := split[1].strip_edges()
			if potential_line.is_valid_int():
				line_number = int(potential_line)
				script_path = split[0]

	var index_value := fallback_index
	if columns.size() > 0:
		var index_text := String(columns[0]).strip_edges()
		if index_text.begins_with("#"):
			index_text = index_text.substr(1).strip_edges()
		if index_text.is_valid_int():
			index_value = int(index_text)

	return {
		"index": index_value,
		"function": function_name,
		"location": location,
		"script": script_path,
		"line": line_number,
		"columns": columns
	}

func _derive_frames_from_lines(lines: Array) -> Array:
	var frames: Array = []
	var i := 0
	var fallback_index := 0
	while i < lines.size():
		var current_line := String(lines[i]).strip_edges()
		if current_line.is_empty():
			i += 1
			continue

		var consumed_lines := 1
		var parsed := _parse_stack_line(current_line, fallback_index)

		if parsed.is_empty():
			if current_line.begins_with("res://") or current_line.begins_with("user://"):
				var script_path := current_line
				var line_number := -1
				if i + 1 < lines.size():
					var next_line := String(lines[i + 1]).strip_edges()
					var prefix := "Line "
					if next_line.begins_with(prefix):
						var maybe_number := next_line.substr(prefix.length()).strip_edges()
						if maybe_number.is_valid_int():
							line_number = int(maybe_number)
							consumed_lines = 2
				var location := script_path
				if line_number >= 0:
					location = "%s:%d" % [script_path, line_number]
				parsed = {
					"index": fallback_index,
					"function": "",
					"location": location,
					"script": script_path,
					"line": line_number,
					"columns": [script_path]
				}
		if not parsed.is_empty():
			frames.append(parsed)
			fallback_index += 1
		i += consumed_lines

	return frames

func _parse_stack_line(line: String, fallback_index: int) -> Dictionary:
	var trimmed := line.strip_edges()
	if trimmed.is_empty():
		return {}

	var index_value := fallback_index
	if trimmed.begins_with("#"):
		var after_hash := trimmed.substr(1).strip_edges()
		var parts := after_hash.split(" ", false)
		if parts.size() > 0:
			var index_text := parts[0].strip_edges()
			if index_text.is_valid_int():
				index_value = int(index_text)

	var script_path := ""
	var line_number := -1
	var colon_index := trimmed.rfind(":")
	if colon_index != -1 and colon_index + 1 < trimmed.length():
		var maybe_line := trimmed.substr(colon_index + 1).strip_edges()
		if maybe_line.is_valid_int():
			line_number = int(maybe_line)
			script_path = trimmed.substr(0, colon_index)
			return {
				"index": index_value,
				"function": "",
				"location": trimmed,
				"script": script_path,
				"line": line_number,
				"columns": [trimmed]
			}

	return {}

func _unwrap_tab_content(control: Control) -> Control:
	if not is_instance_valid(control):
		return control

	# Godot editor wraps tab content inside MarginContainer -> VBox/HBox -> actual content.
	# Try to find the deepest Control that actually holds text.
	var current := control
	var safety := 0

	while safety < 5 and current.get_child_count() == 1:
		var child = current.get_child(0)
		if child is Control:
			current = child
			safety += 1
		else:
			break

	# If we ended up on a container with multiple children, try to pick the TextEdit/RichTextLabel.
	if current.get_child_count() > 1:
		for child in current.get_children():
			if child is Control and (_is_text_display_control(child)):
				return child

	return current

func _is_text_display_control(control: Control) -> bool:
	if not is_instance_valid(control):
		return false
	if control.is_class("TextEdit") or control.is_class("CodeEdit") or control.is_class("RichTextLabel"):
		return true
	return false

func _find_descendant_tree(root: Node, max_nodes: int = 8192) -> Tree:
	if not is_instance_valid(root):
		return null
	var queue: Array = [root]
	var visited := 0
	while queue.size() > 0 and visited < max_nodes:
		var candidate = queue.pop_front()
		visited += 1
		if not is_instance_valid(candidate):
			continue
		if candidate is Tree:
			return candidate
		for child in candidate.get_children():
			if child is Node:
				queue.append(child)
	return null

func _find_descendant_text_control(root: Node, max_nodes: int = 4096) -> Control:
	if not is_instance_valid(root):
		return null
	var queue: Array = [root]
	var visited := 0
	while queue.size() > 0 and visited < max_nodes:
		var candidate = queue.pop_front()
		if not is_instance_valid(candidate):
			continue
		visited += 1
		if candidate is Control and _is_text_display_control(candidate):
			return candidate
		for child in candidate.get_children():
			if child is Node:
				queue.append(child)
	return null

func _summarize_control_structure(root: Node, max_depth: int, max_nodes: int) -> Array:
	var summary: Array = []
	if not is_instance_valid(root):
		return summary
	var queue: Array = [{
		"node": root,
		"depth": 0
	}]
	var visited := 0
	while queue.size() > 0 and visited < max_nodes:
		var entry = queue.pop_front()
		var node = entry["node"]
		var depth = entry["depth"]
		if not is_instance_valid(node) or depth > max_depth:
			continue
		var prefix := ""
		for i in range(depth):
			prefix += "-"
		summary.append("%s%s (%s)" % [prefix, node.name, node.get_class()])
		visited += 1
		if depth == max_depth:
			continue
		for child in node.get_children():
			if child is Node:
				queue.append({
					"node": child,
					"depth": depth + 1
				})
	return summary

func _collect_tree_lines(tree: Tree) -> Array:
	var lines: Array = []
	if not is_instance_valid(tree):
		return lines
	var root := tree.get_root()
	if not root:
		return lines
	var column_count: int = tree.columns
	if tree.has_method("is_hide_root") and not tree.is_hide_root():
		_collect_tree_item_lines(root, lines, 0, column_count)
		var child := root.get_first_child()
		while child:
			_collect_tree_item_lines(child, lines, 1, column_count)
			child = child.get_next()
	else:
		var item := root.get_first_child()
		while item:
			_collect_tree_item_lines(item, lines, 0, column_count)
			item = item.get_next()
	return lines

func _count_tree_items(tree: Tree) -> int:
	if not is_instance_valid(tree):
		return 0
	var root := tree.get_root()
	if not root:
		return 0
	var count := 0
	if tree.has_method("is_hide_root") and not tree.is_hide_root():
		count += 1
		var child := root.get_first_child()
		while child:
			count += 1
			child = child.get_next()
	else:
		var item := root.get_first_child()
		while item:
			count += 1
			item = item.get_next()
	return count

func _collect_tree_item_lines(item: TreeItem, lines: Array, depth: int, column_count: int) -> void:
	if not is_instance_valid(item):
		return
	var parts: Array = []

	if item.has_meta("_is_warning"):
		parts.append("[warning]")
	elif item.has_meta("_is_error"):
		parts.append("[error]")

	var main_text := item.get_text(0)
	if not main_text.is_empty():
		parts.append(main_text)

	for col in range(1, column_count):
		var extra := item.get_text(col)
		if not extra.is_empty():
			parts.append(extra)

	if parts.size() > 0:
		var prefix := _make_indent(depth)
		lines.append(prefix + " ".join(parts))

	var child := item.get_first_child()
	while child:
		_collect_tree_item_lines(child, lines, depth + 1, column_count)
		child = child.get_next()

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

func _make_indent(depth: int) -> String:
	if depth <= 0:
		return ""
	var spaces := depth * 2
	var builder := ""
	for i in range(spaces):
		builder += " "
	return builder
