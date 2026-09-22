---
name: godot-input-testing
description: Simulate keyboard, mouse, and input-action events in a running Godot game through the godot-mcp CLI for automated UI and gameplay testing. Use when testing controls, verifying UI navigation, automating gameplay sequences, simulating key presses or mouse clicks, or checking that input actions respond correctly.
---

# Godot Input Testing

## Requirements

- The game must be running with the debugger attached: start with `run_project` or `run_specific_scene` (F5 mode), not `run_current_scene` (F6).
- Mouse coordinates are screen/viewport space, not world coordinates. For a 1280x720 window, the center is (640, 360).
- Discover input actions before simulating them: `godot-mcp get_input_actions`.

## Quick start

```bash
godot-mcp get_input_actions
godot-mcp simulate_action_tap --action "ui_accept"
godot-mcp simulate_mouse_click --x 400 --y 300
```

## Workflows

### UI navigation test

Tap through a menu and confirm the selection:

```bash
godot-mcp simulate_action_tap --action "ui_down"
godot-mcp simulate_action_tap --action "ui_down"
godot-mcp simulate_action_tap --action "ui_down"
godot-mcp simulate_action_tap --action "ui_accept"
```

### Gameplay test (hold, then jump)

```bash
godot-mcp simulate_action_press --action "ui_right"
godot-mcp simulate_action_tap --action "jump" --duration-ms 100
godot-mcp simulate_action_release --action "ui_right"
```

For precise timing, use a single sequence instead of separate calls:

```bash
godot-mcp simulate_input_sequence --sequence '[{"type":"press","action":"ui_right"},{"type":"wait","duration_ms":500},{"type":"tap","action":"jump","duration_ms":100},{"type":"release","action":"ui_right"}]'
```

Sequence step types: `press`, `release`, `tap`, `wait`, `click`.

### Mouse-driven interaction

```bash
godot-mcp simulate_mouse_move --x 200 --y 150
godot-mcp simulate_mouse_click --x 200 --y 150 --button "left"
godot-mcp simulate_drag --start-x 100 --start-y 100 --end-x 300 --end-y 200 --duration-ms 500
```

### Verify the result

Pair input with observation tools to confirm the game reacted:

```bash
godot-mcp capture_scene --width 1280 --height 720
godot-mcp get_debug_output
godot-mcp get_runtime_scene_structure --max-depth 2
```

For scripted end-to-end checks, `playtest` composes launch (or attach), input phases, runtime node/expression assertions, and optional failure capture in one call. Unavailable or truncated runtime snapshots are reported as infrastructure errors, never silent passes; mutation commands (input simulation included) run one at a time in submission order.

## Advanced features

- `simulate_action_press --action "ui_right" --strength 0.5`: analog-style strength for actions read via `Input.get_action_strength`.
- `simulate_key_press --key "SPACE" --modifiers '{"ctrl":true}'`: raw keys with modifier support.
- `simulate_mouse_click --double-click true`: double clicks for list and dialog interactions.
- Timing: `--duration-ms` on taps and presses, `wait` steps in sequences. Keep durations realistic; a 0 ms tap may be missed by frame-based logic.
