@tool
class_name MCPWebSocketServer
extends Node

signal client_connected(id)
signal client_disconnected(id)
signal command_received(client_id, command)

var tcp_server = TCPServer.new()
var peers = {}
var _port = 9080
var _next_client_id: int = 1
var _to_remove: Array = []
const MAX_MESSAGE_BYTES := 8 * 1024 * 1024
const MAX_QUEUED_PACKETS := 256
const MAX_PACKETS_PER_PEER_PER_FRAME := 16
var _disconnect_emitted := {}

func _ready():
	# GODOT_MCP_PORT (1024-65535, fallback 9080) lets a dedicated fixture editor pick a free port.
	var env_port := OS.get_environment("GODOT_MCP_PORT").strip_edges()
	if env_port.is_valid_int() and int(env_port) >= 1024 and int(env_port) <= 65535:
		_port = int(env_port)
	set_process(false)

func _process(_delta):
	poll()

func is_server_active() -> bool:
	return tcp_server.is_listening()

func start_server() -> int:
	if is_server_active():
		return ERR_ALREADY_IN_USE
	
	# Configure TCP server
	var err = tcp_server.listen(_port, "127.0.0.1")
	if err == OK:
		set_process(true)
		print("MCP WebSocket server started on port %d" % _port)
	else:
		print("Failed to start MCP WebSocket server: %d" % err)
	
	return err

func stop_server() -> void:
	# Emit disconnect before clearing peers so subscribers and queued work can
	# release client-owned state. The closed-state poll is guarded against a
	# second emission.
	for client_id in peers.keys():
		_emit_client_disconnected(client_id)
		if peers[client_id] != null:
			peers[client_id].close()
	peers.clear()
	if is_server_active():
		tcp_server.stop()
	set_process(false)
	print("MCP WebSocket server stopped")

func poll() -> void:
	if not tcp_server.is_listening():
		return
	
	# Handle new connections
	if tcp_server.is_connection_available():
		var tcp = tcp_server.take_connection()
		if tcp == null:
			print("Failed to take TCP connection")
			return
		
		tcp.set_no_delay(true)  # Important for WebSocket
		
		print("New TCP connection accepted")
		var ws = WebSocketPeer.new()
		
		# Configure WebSocket peer
		ws.inbound_buffer_size = MAX_MESSAGE_BYTES
		ws.outbound_buffer_size = MAX_MESSAGE_BYTES
		ws.max_queued_packets = MAX_QUEUED_PACKETS
		
		# Accept the stream
		var err = ws.accept_stream(tcp)
		if err != OK:
			print("Failed to accept WebSocket stream: ", err)
			tcp.disconnect_from_host()
			return
		
		# Generate client ID and store peer
		var client_id := _next_client_id
		_next_client_id += 1
		peers[client_id] = ws
		print("WebSocket connection setup for client: ", client_id)
	
	# Process existing connections
	_to_remove.clear()
	
	for client_id in peers:
		var peer = peers[client_id]
		if peer == null:
			_to_remove.append(client_id)
			continue
			
		peer.poll()
		var state = peer.get_ready_state()
		
		match state:
			WebSocketPeer.STATE_OPEN:
				# Bound work per editor frame. WebSocketPeer retains packets for the
				# next frame, preventing a burst from monopolizing the editor.
				var packets_processed := 0
				while peer.get_available_packet_count() > 0 and packets_processed < MAX_PACKETS_PER_PEER_PER_FRAME:
					var packet = peer.get_packet()
					_handle_packet(client_id, packet)
					packets_processed += 1
					
			WebSocketPeer.STATE_CONNECTING:
				pass
				
			WebSocketPeer.STATE_CLOSING:
				pass
				
			WebSocketPeer.STATE_CLOSED:
				print("Client %d connection closed. Code: %d, Reason: %s" % [
					client_id,
					peer.get_close_code(),
					peer.get_close_reason()
				])
				_emit_client_disconnected(client_id)
				_to_remove.append(client_id)
	
	# Remove disconnected clients
	for client_id in _to_remove:
		var peer = peers[client_id]
		if peer != null:
			peer.close()
		peers.erase(client_id)

func _emit_client_disconnected(client_id: int) -> void:
	if _disconnect_emitted.has(client_id):
		return
	_disconnect_emitted[client_id] = true
	emit_signal("client_disconnected", client_id)

func _handle_packet(client_id: int, packet: PackedByteArray) -> void:
	if packet.size() > MAX_MESSAGE_BYTES:
		_send_protocol_error(client_id, "Message exceeds the %d byte limit" % MAX_MESSAGE_BYTES)
		return
	var text = packet.get_string_from_utf8()
	var json = JSON.new()
	var parse_result = json.parse(text)
	
	if parse_result == OK:
		var data = json.get_data()
		
		# Handle ping-pong for FastMCP
		if data.has("method") and data["method"] == "ping":
			var response = {
				"jsonrpc": "2.0",
				"id": data.get("id", 0),
				"result": "pong"
			}
			send_response(client_id, response)
			return
			
		# Log only the routing fields, never the raw payload: params can contain
		# multi-MB script content or base64 image data.
		var command_type := str(data.get("type", "unknown"))
		var command_id := str(data.get("commandId", ""))
		print("Received command from client %d: type=%s commandId=%s" % [client_id, command_type, command_id])
		emit_signal("command_received", client_id, data)
	else:
		print("Error parsing JSON from client %d: %s at line %d" % 
			[client_id, json.get_error_message(), json.get_error_line()])

func _send_protocol_error(client_id: int, message: String) -> void:
	if peers.has(client_id):
		send_response(client_id, {"status": "error", "message": message})

func send_response(client_id: int, response: Dictionary) -> int:
	if not peers.has(client_id):
		print("Error: Client %d not found" % client_id)
		return ERR_DOES_NOT_EXIST
	
	var peer = peers[client_id]
	if peer == null:
		print("Error: Peer is null for client %d" % client_id)
		return ERR_INVALID_PARAMETER
		
	if peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		print("Error: Client %d connection not open" % client_id)
		return ERR_UNAVAILABLE
	
	var json_text = JSON.stringify(response)
	if json_text.to_utf8_buffer().size() > MAX_MESSAGE_BYTES:
		var command_id := str(response.get("commandId", ""))
		var compact_error := {"status": "error", "message": "Response exceeds the %d byte limit; use file-based capture output" % MAX_MESSAGE_BYTES}
		if not command_id.is_empty():
			compact_error["commandId"] = command_id
		json_text = JSON.stringify(compact_error)
	var result = peer.send_text(json_text)
	
	if result != OK:
		print("Error sending response to client %d: %d" % [client_id, result])
	
	return result

func send_event(client_id: int, event: Dictionary) -> int:
	if not peers.has(client_id):
		return ERR_DOES_NOT_EXIST

	var peer = peers[client_id]
	if peer == null or peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return ERR_UNAVAILABLE

	var payload: Dictionary = event
	if not payload.has("event"):
		payload = event.duplicate(true)
		payload["event"] = "unknown"

	var json_text = JSON.stringify(payload)
	if json_text.to_utf8_buffer().size() > MAX_MESSAGE_BYTES:
		return ERR_OUT_OF_MEMORY
	return peer.send_text(json_text)

func broadcast_event(event: Dictionary) -> void:
	for client_id in peers.keys():
		send_event(client_id, event)

func set_port(new_port: int) -> void:
	if is_server_active():
		push_error("Cannot change port while server is active")
		return
	_port = new_port

func get_port() -> int:
	return _port

func get_client_count() -> int:
	return peers.size()
