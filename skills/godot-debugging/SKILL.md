---
name: godot-debugging
description: Debug a running Godot game through the godot-mcp CLI using breakpoints, pause/resume/step controls, call stacks, debug output, editor errors, and runtime state inspection. Use when finding or fixing bugs, setting or clearing breakpoints, stepping through code, reading stack traces or error logs, inspecting the live state of a running game, or debugging shaders in the running game (see godot-shader-debugging).
---

# Godot Debugging

## Critical rule

Debugger tools require the project to run in debug mode: start with `run_project` (F5) or `run_specific_scene`, never `run_current_scene` (F6). F6 runs without the debugger, and debugger tools will report no active session.

## Quick start

```bash
godot-mcp debugger_enable_events
godot-mcp debugger_set_breakpoint --script-path "res://player.gd" --line 42
godot-mcp run_project
godot-mcp debugger_get_current_state
```

Call `debugger_enable_events` FIRST, before setting breakpoints, to receive real-time breakpoint-hit and execution-change notifications.

## Workflows

### Breakpoint debugging

1. Enable events and set breakpoints, then run the project (F5 mode):

   ```bash
   godot-mcp debugger_enable_events
   godot-mcp debugger_set_breakpoint --script-path "res://player.gd" --line 42
   godot-mcp debugger_get_breakpoints
   godot-mcp run_project
   ```

2. When the breakpoint hits, inspect state and the stack panels:

   ```bash
   godot-mcp debugger_get_current_state
   godot-mcp debugger_get_call_stack
   godot-mcp get_stack_frames_panel --refresh true
   godot-mcp get_stack_trace_panel
   ```

3. Step through or resume:

   ```bash
   godot-mcp debugger_step_over
   godot-mcp debugger_step_into
   godot-mcp debugger_resume_execution
   ```

4. Clean up:

   ```bash
   godot-mcp debugger_clear_all_breakpoints
   godot-mcp debugger_disable_events
   ```

### Error triage

1. Clear the panels to establish a baseline, reproduce the failure (run the project, exercise the game), then collect evidence:

   ```bash
   godot-mcp clear_debug_output
   godot-mcp clear_editor_errors
   godot-mcp run_project
   godot-mcp get_debug_output
   godot-mcp get_editor_errors
   ```

2. Inspect the live scene and evaluate expressions (evaluation requires the runtime debugger bridge autoload):

   ```bash
   godot-mcp get_runtime_scene_structure --include-properties true --max-depth 3
   godot-mcp evaluate_runtime_expression --expression "position" --context-path "/root/Main/Player"
   ```

### Shader debugging

The live shader debugging loop (snapshots, uniform tweaks, frame capture, hot reload with rollback, debug-draw overlays) lives in [godot-shader-debugging](../godot-shader-debugging/SKILL.md); the runtime tools require the game running in F5 mode, while the editor-side `shader_get_warnings`/`shader_project_health` do not.

## Advanced features

### Live output streaming

```bash
godot-mcp stream_debug_output --action start
godot-mcp stream_debug_output --action read --after-cursor 0
godot-mcp stream_debug_output --action capture --duration-ms 1500 --raw
godot-mcp stream_debug_output --action stop
```

Output frames are retained in a bounded cursor buffer and returned by `read` or one-shot `capture`; asynchronous frames are never printed to stdout, preserving MCP framing. Use the returned `next_cursor` for the next read.

Session handling: `debugger_get_call_stack --session-id 1` addresses a specific debug session (multiple sessions are supported); only one client can receive debugger events at a time.

Breakpoint troubleshooting: "Failed to set breakpoint" means the `res://` path does not exist; a breakpoint that never hits means the line is not executed (verify line numbers with `get_script` first).
