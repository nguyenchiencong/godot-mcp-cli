# Godot MCP Skills

Agent skills for using the godot-mcp-cli project: a CLI (`godot-mcp`) and MCP server that lets AI assistants interact with the Godot Engine editor and running games. Every tool name, flag, and example in these skills is grounded in the project documentation (`docs/command-reference.md`, `docs/cli.md`, `docs/tool-prompt-guide.md`) and the server source.

## Skills

| Skill | Covers |
|-------|--------|
| [godot-mcp-quickstart](godot-mcp-quickstart/SKILL.md) | Setup and connectivity: npm install, `install-addon`, enabling the plugin, verifying the server, `--list-tools`, `--help <tool>`, output modes (`--raw`, `--verbose`), timeouts, and a connectivity troubleshooting checklist (Godot open, plugin enabled, WebSocket port 9080). |
| [godot-scene-editing](godot-scene-editing/SKILL.md) | Scenes and nodes: `get_editor_scene_structure`, `create_scene`/`open_scene`/`save_scene`, `create_node`/`delete_node`, `update_node_property`/`update_node_transform`, `get_node_warnings`, `validate_scene`, `capture_scene`, and node path conventions. |
| [godot-scripting](godot-scripting/SKILL.md) | Scripts and shader authoring: `create_script`/`edit_script`/`get_script`/`get_script_diagnostics`, `godot://script/...` resources, shader authoring (`create_shader`, `edit_shader`, `get_shader`, `shader_get_compile_errors`, template-from-type), `execute_editor_script`, `generate_project_guidance`, and GDScript style rules. |
| [godot-debugging](godot-debugging/SKILL.md) | Debugger integration: `debugger_enable_events` first, breakpoint management, pause/resume/step, call stack and stack panels, debug output and editor errors, runtime scene inspection, and expression evaluation. For the live shader debugging loop see godot-shader-debugging. Requires F5 (debug) mode. |
| [godot-shader-debugging](godot-shader-debugging/SKILL.md) | The live shader debugging loop: `shader_debug_snapshot`, `shader_set_uniform` (per-node or shader-wide), `shader_debug_visualize`, `capture_running_game`, `shader_hot_reload`/`shader_reload_from_disk`, `shader_reset_uniforms`, `shader_measure_frame_time`, and `shader_debug_overlay`; editor-side `shader_get_warnings`/`shader_project_health` need no running game. Runtime tools require the game in F5 (debug) mode; never F6. |
| [godot-input-testing](godot-input-testing/SKILL.md) | Input simulation: `get_input_actions`, action press/release/tap, mouse click/move/drag, key presses, and `simulate_input_sequence`, plus UI navigation and gameplay test workflows. |
| [godot-dev-workflow](godot-dev-workflow/SKILL.md) | The daily iteration loop (inspect, edit, run, verify, fix, refresh), run modes, and a decision table mapping intents to tool categories and skills. |

## Recommended reading order

1. godot-mcp-quickstart: get connected.
2. godot-dev-workflow: learn the loop and where each skill fits.
3. godot-scene-editing and godot-scripting: build content.
4. godot-debugging, godot-shader-debugging, and godot-input-testing: verify and test.

## Installation

For project-level installs, the recommended way is the CLI:

```bash
godot-mcp install-skills "path/to/your/project"
```

This installs all bundled skills to `<project>/.agents/skills/`, replacing any previous copies of these skills while leaving unrelated skills in that directory untouched.

You can also copy the `skills/` folder (or individual skill folders) to a skills directory your agent reads:

- Global (user-level): `~/.agents/skills/` or `~/.pi/agent/skills/`
- Project-level: `.agents/skills/` in the repository root
- pi settings: add `{"skills": [...]}` entries pointing at the skill folders
- Claude Code: load via `--skill godot-mcp-quickstart` or the skills configuration

After installing, a skill is triggered by its `description` frontmatter. For example, a "godot not responding" error report loads godot-mcp-quickstart, and a request to set a breakpoint loads godot-debugging.

## Conventions used by all skills

- Tool invocation: `godot-mcp <tool_name> --flag value`, e.g. `godot-mcp debugger_set_breakpoint --script-path res://player.gd --line 42`.
- Safety and bounded workflows: `execute_editor_script` requires `allow_unsafe: true`; file/asset inventories use offset pagination (the scan reports `scan_truncated` when the 100000-entry cap is hit); `batch_operations` is ordered but non-atomic with schema-only `dry_run` and fails the tool call (with the compact report embedded) when a real batch has a failed/invalid operation; `playtest` reports unavailable or truncated runtime snapshots and unavailable runtime bridges as infrastructure errors; mutation commands run one at a time, so the next mutation waits for input sequences and editor scripts to finish.
- Debug streaming: use `stream_debug_output` with `start`, cursor-based `read`, bounded `capture`, or `stop`; asynchronous frames remain off stdout.
- Editor node paths use `./` prefixes (`./World/Enemy`); script and scene paths use `res://`; runtime paths use `/root/...`.
- Debugger, input simulation, and runtime shader tools require the game running in debug mode (F5), not F6.
- GDScript written through these tools must use Python-style conditionals (`a if cond else b`), never the C-style ternary; no emoji anywhere.
- Full reference: `docs/command-reference.md`, `docs/cli.md`, `docs/tool-prompt-guide.md`.
