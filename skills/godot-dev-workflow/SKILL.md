---
name: godot-dev-workflow
description: "Drive the day-to-day Godot iteration loop through the godot-mcp CLI: inspect scenes and scripts, edit them, run the project, verify with debug output and captures, fix issues, and refresh the editor. Use when developing or iterating on a Godot project, deciding which godot-mcp tool to call for a task, or running an edit-run-verify-fix cycle."
---

# Godot Dev Workflow

## The iteration loop

For every change, walk the loop: inspect, edit, run, verify, fix, refresh.

1. **Inspect**: understand the current state before touching anything.

   ```bash
   godot-mcp get_editor_scene_structure --include-properties true --max-depth 3
   godot-mcp get_script --script-path "res://scripts/player.gd"
   ```

2. **Edit**: make the change.

   ```bash
   godot-mcp edit_script --script-path "res://scripts/player.gd" --content "<new source>"
   godot-mcp update_node_property --node-path "./Player" --property "speed" --value "300"
   ```

3. **Run**: play the project. Use `run_project` (F5, debug mode) when you need the debugger or input tools; `run_current_scene` (F6) only for a quick run of the open scene.

   ```bash
   godot-mcp run_project
   ```

4. **Verify**: confirm the change worked.

   ```bash
   godot-mcp get_debug_output
   godot-mcp capture_scene --width 1280 --height 720
   godot-mcp validate_scene --scene-path "res://scenes/main.tscn"
   ```

5. **Fix**: triage failures with diagnostics and errors.

   ```bash
   godot-mcp get_script_diagnostics --script-path "res://scripts/player.gd"
   godot-mcp get_editor_errors
   ```

6. **Refresh**: pick up external changes or restart cleanly.

   ```bash
   godot-mcp rescan_filesystem
   godot-mcp reload_scene
   godot-mcp reload_project --save true
   ```

## Decision table: tool category by intent

| Intent | Skill | Start with |
|--------|-------|------------|
| See the scene | godot-scene-editing | `get_editor_scene_structure` |
| Edit a node or scene | godot-scene-editing | `update_node_property`, `update_node_transform` |
| Write or fix GDScript | godot-scripting | `edit_script`, `get_script_diagnostics` |
| Author shaders | godot-scripting | `create_shader`, `shader_get_compile_errors` |
| Find a bug | godot-debugging | `debugger_enable_events`, `debugger_set_breakpoint` |
| Read runtime errors | godot-debugging | `get_debug_output`, `get_editor_errors` |
| Test controls | godot-input-testing | `get_input_actions`, `simulate_action_tap` |
| Automate a play-test with runtime assertions | godot-input-testing | `playtest` (input phases + assertions; `capture_on_failure`) |
| First-time setup or connection issues | godot-mcp-quickstart | `get_project_info` |
| Run several tool calls as one ordered job | godot-scene-editing | `batch_operations` (`dry_run` validates first; non-atomic) |
| One-off editor automation the dedicated tools lack | godot-scripting | `execute_editor_script --allow-unsafe true` |
| See what the game looks like now | godot-scene-editing | `capture_scene` |

## Running modes

- `run_project`: F5 debug mode. Required for debugger, input simulation, and runtime shader tools.
- `run_current_scene`: F6 run mode. Fast, but no debugger attached.
- `run_specific_scene --scene-path "res://test_main_scene.tscn"`: play a specific saved scene in debug mode.
- `stop_running_project`: return to the editor.

## Related skills

- [godot-mcp-quickstart](../godot-mcp-quickstart/SKILL.md): setup, connectivity, output modes.
- [godot-scene-editing](../godot-scene-editing/SKILL.md): scenes and nodes.
- [godot-scripting](../godot-scripting/SKILL.md): scripts, shaders, diagnostics.
- [godot-debugging](../godot-debugging/SKILL.md): breakpoints, stepping, error triage.
- [godot-input-testing](../godot-input-testing/SKILL.md): input simulation for tests.

## Advanced features

- Guidance files: `godot-mcp generate_project_guidance --include-agents-md true` writes `res://addons/godot_mcp/ai/project_guide.md` plus `res://AGENTS.md` (never overwritten unless `--force true`), giving future sessions a project-specific reference.
- Complex parameters: pass JSON objects with `--params-json '{"sequence":[...]}'` when flag syntax gets unwieldy.
- Long operations: raise the CLI timeout with `--timeout 20000`; runtime tools accept their own `--wait-ms` or `--timeout-ms` parameters.
