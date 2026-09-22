@tool
class_name MCPAssetCommands
extends Node

const MAX_SCAN_ENTRIES := 100000

var _websocket_server = null

func process_command(client_id: int, command_type: String, params: Dictionary, command_id: String) -> bool:
	match command_type:
		"list_project_files":
			_handle_list_project_files(client_id, params, command_id)
			return true
		"list_assets_by_type":
			_handle_list_assets_by_type(client_id, params, command_id)
			return true
	
	# Command not handled by this processor
	return false

# ---- Project File Listing ----

func _handle_list_project_files(client_id: int, params: Dictionary, command_id: String) -> void:
	var extensions = params.get("extensions", [])
	
	var result = list_project_files(extensions)
	
	var response = {
		"status": "success",
		"result": result
	}
	
	if not command_id.is_empty():
		response["commandId"] = command_id
	
	_websocket_server.send_response(client_id, response)

func list_project_files(extensions: Array) -> Dictionary:
	var result = []
	# Cap the recursive walk so oversized projects cannot run unbounded; the
	# shared scan state lets callers surface scan_truncated additively.
	var scan_state = { "count": 0, "truncated": false }
	
	# Get all files recursively
	var dir = DirAccess.open("res://")
	if dir:
		_list_files_recursive(dir, "res://", extensions, result, scan_state)
	
	return {
		"files": result,
		"scan_truncated": bool(scan_state.get("truncated", false))
	}

# Helper function to recursively list files. Stops the entire walk once a
# matching file beyond MAX_SCAN_ENTRIES appears (scan_state["truncated"]).
func _list_files_recursive(dir: DirAccess, path: String, extensions: Array, result: Array, scan_state: Dictionary) -> void:
	# Open the directory
	dir.list_dir_begin()
	
	# Loop through all files and directories
	var file_name = dir.get_next()
	while file_name != "":
		if bool(scan_state.get("truncated", false)):
			break
		if file_name != "." and file_name != "..":
			var full_path = path.path_join(file_name)
			if dir.current_is_dir():
				# Recursively process subdirectories
				var subdir = DirAccess.open(full_path)
				if subdir:
					_list_files_recursive(subdir, full_path, extensions, result, scan_state)
			else:
				# If extensions are specified, filter by them
				var matched = extensions.size() == 0
				if not matched:
					for ext in extensions:
						if file_name.ends_with(ext):
							matched = true
							break
				if matched:
					if int(scan_state.get("count", 0)) >= MAX_SCAN_ENTRIES:
						# Another matching file past the cap: report the walk as
						# truncated and stop processing further entries.
						scan_state["truncated"] = true
					else:
						scan_state["count"] = int(scan_state.get("count", 0)) + 1
						result.append(full_path)
		
		file_name = dir.get_next()
	
	dir.list_dir_end()

# ---- Asset Type Listing ----

func _handle_list_assets_by_type(client_id: int, params: Dictionary, command_id: String) -> void:
	var type = params.get("type", "all")
	
	var result = list_assets_by_type(type, params)
	
	var response = {
		"status": "success",
		"result": result
	}
	
	if not command_id.is_empty():
		response["commandId"] = command_id
	
	_websocket_server.send_response(client_id, response)

func list_assets_by_type(type: String, page_params: Dictionary = {}) -> Dictionary:
	# Define file extensions for each asset type
	var extension_map = {
		"images": [".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".tga"],
		"audio": [".ogg", ".mp3", ".wav", ".opus"],
		"fonts": [".ttf", ".otf", ".fnt", ".font"],
		"models": [".glb", ".gltf", ".obj", ".fbx"],
		"shaders": [".gdshader", ".shader"],
		"resources": [".tres", ".res", ".theme", ".material"],
		"scripts": [".gd"],
		"scenes": [".tscn"],
		"all": [] # Will retrieve everything
	}

	# Get extensions for the requested type
	var extensions = []
	if extension_map.has(type):
		extensions = extension_map[type]
	else:
		# If type not found, return empty result
		return {
			"assetType": type,
			"extensions": [],
			"count": 0,
			"files": [],
			"organizedFiles": {},
			"error": "Unknown asset type: %s. Valid types are: %s" % [type, ", ".join(extension_map.keys())]
		}
	
	# Get files
	var file_result = list_project_files(extensions)
	var all_files: Array = file_result.get("files", [])
	all_files.sort()
	var offset := max(0, int(page_params.get("offset", 0)))
	var limit := clamp(int(page_params.get("limit", 200)), 1, 1000)
	var end := min(offset + limit, all_files.size())
	var files: Array = all_files.slice(offset, end)
	
	# Group by folder structure for better navigation
	var organized_files = {}
	for file_path in files:
		var parts = file_path.split("/")
		var current = organized_files
		
		# Skip the first "res://" part if present
		var start_idx = 1 if parts[0] == "res:" else 0
		
		# Process path parts
		for i in range(start_idx, parts.size() - 1):
			var part = parts[i]
			if not current.has(part):
				current[part] = {}
			current = current[part]
		
		# For the leaf/filename
		var file_name = parts[parts.size() - 1]
		current[file_name] = file_path
	
	return {
		"assetType": type,
		"extensions": extensions,
		"count": files.size(),
		"files": files,
		"organizedFiles": organized_files,
		"offset": offset,
		"limit": limit,
		"returned_count": files.size(),
		"total_count": all_files.size(),
		"truncated": end < all_files.size(),
		"scan_truncated": bool(file_result.get("scan_truncated", false)),
		"next_offset": end if end < all_files.size() else null
	}