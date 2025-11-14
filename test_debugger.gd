extends Node

# Simple test script to validate debugger functionality
# Place this on a node in your scene to test breakpoints

var _counter: int = 0
var _test_string: String = "test_value"

func _ready():
	print("[Debugger Test] Test node ready")

	# Test code that we can set breakpoints on
	_test_function_call()

func _process(delta):
	_counter += 1

	# This is a good place to set a breakpoint
	if _counter % 60 == 0:  # Every second at 60 FPS
		_print_debug_info()

func _test_function_call():
	var local_var = 42
	var another_var = "hello"

	# Breakpoint can be set here
	print("[Debugger Test] Function called with: ", local_var, another_var)

	# More complex logic
	for i in range(5):
		local_var += i
		if local_var > 45:
			print("[Debugger Test] Local var exceeded threshold: ", local_var)

func _print_debug_info():
	var debug_info = {
		"counter": _counter,
		"test_string": _test_string,
		"node_name": name,
		"scene_path": scene_file_path
	}
	print("[Debugger Test] Debug info: ", debug_info)

	# Another good breakpoint location
	_another_test_function(debug_info)

func _another_test_function(info: Dictionary):
	var extracted_value = info.get("counter", 0)

	# Test conditional breakpoint location
	if extracted_value > 180:  # 3 seconds at 60 FPS
		print("[Debugger Test] Counter exceeded 180!")
		_test_string = "changed_value"

func _input(event):
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_SPACE:
				print("[Debugger Test] Space pressed - manual pause point")
				# # Good place for manual breakpoint testing
				# breakpoint
				# Trigger error to test stack frames
				cause_intentional_error()
			KEY_R:
				print("[Debugger Test] Resetting counter")
				_counter = 0
			KEY_T:
				print("[Debugger Test] Triggering stack dump error path")
				_trigger_stack_error()

func cause_intentional_error():
	# This function will trigger an error to test stack frames
	var invalid_dict = {"key": "value"}
	# Try to access a non-existent key that will cause a runtime error
	invalid_dict.non_existent_method_call()

func _trigger_stack_error():
	# Build a multi-layer call stack to exercise debugger stack frames
	_stack_layer_one(5)

func _stack_layer_one(value: int):
	_stack_layer_two(value + 1)

func _stack_layer_two(value: int):
	if value > 0:
		_stack_layer_three(str(value))

func _stack_layer_three(label: String):
	print("[Debugger Test] Initiating intentional error chain with label: ", label)
	print("[Debugger Test] STACK_DUMP_BEGIN")
	print_stack()
	print("[Debugger Test] STACK_DUMP_END")
	cause_intentional_error()
