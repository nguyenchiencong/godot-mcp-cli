# Approved optimization implementation record

Status: implemented in working tree; no commit made.

## Delivered

- Awaited FastMCP startup and idempotent shutdown; CLI connection and tool deadlines are reported separately and do not claim Godot cancellation.
- Godot transport has finite 8 MiB message buffers, bounded packet polling, and a 64-entry TypeScript pending-command limit. Mutation commands use a bounded FIFO while read-only diagnostics and inspection remain concurrent.
- Debug streaming is protocol-safe: frames are retained in a 1,000-line/128 KiB cursor buffer. `read` and one-shot `capture` expose truncation metadata; asynchronous frames never print to stdout.
- `execute_editor_script` requires `allow_unsafe: true`; output is bounded and timeout wording states that main-thread execution may continue.
- File and asset enumeration expose stable offset pages (default 200, max 1000) and truncation metadata. Capture responses remain file-based by default.
- `batch_operations` validates existing tool schemas, supports schema-only dry runs, executes sequentially, and reports partial failures without rollback or atomicity claims.
- `playtest` composes launch/attach, runtime readiness, existing input, runtime scene/evaluation inspection, assertions, optional failure capture, and cleanup. Missing runtime bridges are infrastructure errors.

## Offline checks

The targeted tests exercise implementation paths (not source-string checks):

```text
npm run build
node tests/debug_output_buffer.test.js
node tests/batch_tools.test.js
node tests/playtest_tools.test.js
```

## Verification record

- `npm run build`: pass.
- Offline buffer, batch, playtest, connection, and CLI tests: pass.
- Godot parser check (`--headless --editor --quit`): pass on Godot 4.7.2.
- Dedicated headless-editor async diagnostics: pass; editor responsiveness check passed (447.6 ms vs 458.7 ms completion in that run).
- Dedicated headless-editor categories: editor 3/3 pass; asset 2/2 pass; project 2 pass/3 skipped; enhanced 9 pass/2 skipped.
- Dedicated headless-editor `tools.test.js --skip-runtime`: 49 pass, 1 fail (`capture_scene`, headless renderer could not read the rendered viewport), 45 skipped runtime tests. This is an environment limitation, not treated as an optimization result.
- `git diff --check`: pass. Temporary fixture files and generated guidance were removed after live checks.
- `npm run benchmark:live`: pass on Godot 4.7.2 (dedicated headless fixture editor; see Live-editor benchmark record).
- `node tests/mutation_queue.live.test.js`: pass on Godot 4.7.2 (dedicated headless fixture editor; see Queue-completion live test record).

Transport constants are provisional safety bounds. Two benchmarks now exist: the mock transport baseline (`server/benchmarks/transport.bench.js`, `npm run benchmark:transport`) and the live-editor benchmark (`server/benchmarks/live_editor.bench.js`, `npm run benchmark:live`) recorded below. Live numbers come from a dedicated headless fixture editor and are labeled as such — no latency claim extends to rendered/GPU frame cost.

## Mock transport benchmark record

Environment: Node v25.9.0, win32, loopback echo peer, 1000 ms per case, 8 MiB message limit. This measures the TypeScript client transport path only — it does not measure Godot or editor frame cost, and it is a post-change baseline, not a before/after speedup. Heap samples include client and mock and depend on GC timing.

| Payload | Concurrency | Ops/sec | p50 (ms) | p95 (ms) | Sampled heap growth (MiB) |
|---:|---:|---:|---:|---:|---:|
| 1 KiB | 1 | 5,789 | 0.15 | 0.25 | 5.6 |
| 1 KiB | 16 | 9,032 | 1.32 | 2.21 | 12.0 |
| 1 KiB | 64 | 12,185 | 3.81 | 6.39 | 18.6 |
| 64 KiB | 1 | 2,568 | 0.29 | 0.51 | 23.3 |
| 64 KiB | 16 | 4,025 | 2.38 | 4.61 | 37.6 |
| 64 KiB | 64 | 4,197 | 9.50 | 16.28 | 62.4 |
| 1 MiB | 1 | 250 | 2.98 | 9.44 | 11.7 |
| 1 MiB | 16 | 227 | 52.17 | 72.71 | 45.3 |
| 1 MiB | 64 | 212 | 206.62 | 291.95 | 0.0 |
| 7 MiB (ceiling probe) | 1 | 33 | 29.57 | 47.94 | 47.3 |

Observations: small payloads stay sub-10 ms p95 even at 64 in-flight calls against the 64-entry pending limit; 1 MiB-class payloads queue noticeably at higher concurrency, which motivates keeping default pages small (200) and captures file-based. The 7 MiB ceiling probe passes end-to-end below the 8 MiB limit. Re-run with `cd server && npm run build && npm run benchmark:transport` (optional `-- --duration-ms 2000`).

## Live-editor benchmark record

`npm run benchmark:live` (`server/benchmarks/live_editor.bench.js`) runs against a DEDICATED headless fixture editor: a throwaway temp project holding a copy of `addons/godot_mcp`, spawned as its own process with `GODOT_MCP_PORT` on a freshly picked free port. Only the spawned PID tree is killed and the fixture directory is always deleted (finally block); no user editor is ever connected to or stopped. Run label: **LIVE HEADLESS EDITOR — no rendering; does not represent GPU/rendering frame cost**.

Environment: Godot 4.7.2 headless fixture (editor 4.7.2, 63 fixture entries, port 5894 via `GODOT_MCP_PORT` override), Node v25.9.0, win32, loopback.

| Case | Calls | p50 (ms) | p95 (ms) | max (ms) |
|---|---:|---:|---:|---:|
| (a) `get_project_info` sequential | 100 | 7.31 | 9.51 | 11.39 |
| (b) `list_project_files` default page sequential | 50 | 14.01 | 24.24 | 25.10 |
| (c) `get_project_info` during 64-mutation burst | 4 | 311.90 | 326.33 | 326.33 |

Other cases from the same run: (c) the 64-mutation `execute_editor_script` burst — client pending limit and editor FIFO are both 64, reads ran on a second connection because a single connection would have no pending slot left — completed in 1255.7 ms with 0 failures; reads observed inside that window answered at p95 326.33 ms versus the 1255.7 ms burst, i.e. reads bypassed the FIFO and were not head-of-line blocked (the gap to the 9.51 ms idle baseline is editor main-thread saturation from script compilation, not queueing). (d) 10 mutations with distinct markers completed in submission order (window 140.7 ms, every response contained its own marker). (e) `stream_debug_output` capture (subscribe, 1000 ms window with a marker script, unsubscribe) measured 1039.6 ms with 1 frame captured.

## Queue-completion live test record

`node tests/mutation_queue.live.test.js` (editor-required; NOT part of `npm run test:offline`) spawns the same dedicated fixture editor through the shared helper `server/tests/utils/fixture_editor.js` (port 5952 via `GODOT_MCP_PORT`) and passed on Godot 4.7.2:

- Slow-then-quick pair: mutation 1 (synchronous 400 ms wait, marker printed after the wait) was observed by the client after 426.4 ms, and mutation 2 completed 2.6 ms after mutation 1 — strict client-side ordering held (t1 - submit >= 350 ms and t2 > t1).
- 10-deep editor-script burst: completion order matched submission order (window 18.3 ms) and every response contained its own marker.

Deviation with evidence: the slow mutation cannot use a literal `await get_tree().create_timer(0.4).timeout` inside `execute_editor_script`. The command template calls `_execute_code()` without `await`, so a user `await` makes `_execute_code` a coroutine and Godot 4.7.2 rejects the generated script at parse time (`Function "_execute_code()" is a coroutine, so it must be called with "await"`, reproduced with `--headless --check-only -s`). The test therefore uses a synchronous `OS.delay_msec(400)` to deliver the same client-visible contract; changing the template was out of scope for this round.

Constants decision: no transport constants were changed. The provisional bounds (16 packets per peer per frame, 64-entry mutation FIFO, 64-entry client pending limit, 8 MiB message cap) held in the headless-editor runs: the 64-mutation burst was admitted with 0 rejections at both the pending and FIFO caps, completion order was preserved through the drain loop, reads were answered mid-burst, and the 8 MiB ceiling remains covered only by the mock ceiling probe (no oversized live transfer attempted).

Reproducibility: an independent re-run on a fresh fixture (Godot 4.7.2, port 8398 via the override) confirmed the same shape: `get_project_info` 100 calls p50/p95 6.9/8.5 ms, `list_project_files` default page 50 calls 19.46/22.96 ms, 64-mutation burst 0 failures with reads answered mid-burst (p50/p95 262.18/354.83 ms across 4 samples), 10-deep completion order matched, capture ~1 frame in 1059.7 ms, and the queue-completion live test passed (slow mutation observed after its delay; second mutation strictly later). Run-to-run variance is normal; the bounds still hold.

## Review fix round

An independent review of this uncommitted work found six concrete gaps; all were addressed in the same working tree (still no commit, no worktree, no live-editor mutation).

### Findings addressed

- **[H1] Queue dispatch awaited completion, not dispatch.** `commands/input_commands.gd` now `await`s every handler in `process_command`; `commands/editor_script_commands.gd` awaits `_execute_editor_script`, which resolves after `execution_completed` or the deadline timer (reusing `_pending_executions`; `_on_script_execution_completed` now returns early when the entry was already popped, guaranteeing exactly one response). `command_handler.gd::_processor_requires_await` gained `MCPEditorScriptCommands` (`MCPInputCommands` was already listed). The mutation drain loop therefore cannot start the next mutation until an input sequence or editor script finishes or hits its deadline.
- **[H2] `MUTATING_COMMANDS` rebuilt from match-arm evidence.** Removed phantoms (`simulate_input`, `set_node_property`, `write_script`, `delete_script`, `write_shader`, `save_all_scenes`); added real mutators (`edit_script`, `edit_shader`, `open_scene`, `delete_scene`, `create_resource`, `simulate_action_press/release/tap`, and the other `simulate_*` arms, plus `generate_project_guidance`, `shader_set_uniform`, `shader_hot_reload`, `shader_reset_uniforms`, `shader_reload_from_disk`, `shader_debug_overlay`, `shader_debug_visualize`, `evaluate_runtime`). Read-only `get_*`/`list_*`/capture/subscribe commands remain concurrent by design. Kept as a file-scope const with an evidence comment.
- **[H3] Playtest false-pass/cleanup holes.** `playtest_tools.ts` checks snapshot unavailability and truncation (`truncated`/`scan_truncated`/`structure.truncated`) before node lookup and marks every assertion in that phase `infrastructure_error` (including thrown `runtimeScene`); launch-to-cleanup is wrapped so any throw still runs `stop_after` (stop errors swallowed, original rethrown); a `cleanup.error` forces `passed=false`. GD side: the runtime snapshot builder (`mcp_runtime_debugger_bridge.gd::_build_response`/`_project_node`, the `_build_response` referenced by the finding) and the editor builder (`mcp_enhanced_commands.gd::_build_node_info`) now set `structure.truncated` (and a per-node `truncated` flag) when `max_depth` drops children — additive fields only.
- **[M4] Paging bounds.** `_walk_project_tree` stops the whole walk when the 100000-entry cap is reached and propagates `scan_truncated` via a shared scan counter; `mcp_asset_commands.gd` caps its recursive walk the same way; `asset_tools.ts` prints the `scan_truncated` warning whenever it is true (even if the page is untruncated) and reports an offset past the end explicitly in both tools.
- **[M5] Debug stream.** `enhanced_tools.ts` capture wraps sleep+unsubscribe in `try/finally` so unsubscribe always runs; `debug_output_buffer.ts::clear()` now zeroes `droppedLines` (and keeps `resetPending=true`); `debug_output_buffer.test.js` asserts both.
- **[M6] Batch failure semantics.** `batch_tools.ts` throws an `Error` embedding the compact JSON report (bounded to 8 KiB) when any operation is `failed`/`invalid` and `dry_run` is false; `dry_run` still returns the report normally. `batch_tools.test.js` covers the continue-on-error path, argument byte-cap rejection, excluded-tool rejection (dry-run invalid vs real-batch throw), and the failed-batch-throws behavior.

`npm run test:offline` now runs the three offline suites (debug buffer, batch, playtest) and is referenced in `docs/guidelines/suggested-commands.md`.

### Verification results

- `npm run build` (tsc): pass, zero errors.
- `node tests/debug_output_buffer.test.js`: pass (with new clear()/dropped_lines assertions).
- `node tests/batch_tools.test.js`: pass (5 scenarios incl. failed-batch throw).
- `node tests/playtest_tools.test.js`: pass (error/truncated snapshot -> infrastructure_error; thrown runtimeScene still stops; cleanup error forces passed=false; launch-throw path still stops).
- `node tests/godot_connection.test.js`: pass. `node tests/cli.test.js`: pass.
- `npm run benchmark:transport` re-run (Node v25.9.0, win32, 1000 ms/case): 1 KiB/1: 7,208 ops/s, p95 0.21 ms; 1 KiB/16: 14,974 ops/s, p95 1.30 ms; 1 KiB/64: 15,933 ops/s, p95 4.94 ms; 64 KiB/1: 2,957 ops/s, p95 0.44 ms; 64 KiB/16: 3,598 ops/s, p95 5.73 ms; 64 KiB/64: 4,174 ops/s, p95 15.80 ms; 1 MiB/1: 217 ops/s, p95 10.92 ms; 1 MiB/16: 292 ops/s, p95 57.04 ms; 1 MiB/64: 303 ops/s, p95 194.56 ms; 7 MiB probe: 49 ops/s, p95 30.88 ms. Same shape as the baseline above (GC-dependent heap samples vary run to run); no regression signal.
- GDScript: `--check-only -s` on all six changed scripts in an isolated temp fixture (Godot 4.7.2 headless) pass; `--headless --editor --quit` parse smoke pass. The user's open editor was not touched; the temp fixture was deleted afterwards.
- `git diff --check`: pass.

Follow-up: verification found the `GODOT_MCP_PORT` docs promised client-side behavior the client lacked; `getGodotConnection()` now resolves the same variable (digits-only 1024-65535, fallback 9080, via `resolveWebSocketUrl`) with offline resolver tests in `tests/godot_connection.test.js`, so plugin and client stay on the same port.

### Remaining accepted limitations

- `websocket_server.gd::send_response` still stringifies before applying the message-size cap (oversized responses are rejected rather than trimmed); accepted as documented, not fixed in this round.
- `execute_editor_script` user code cannot `await` (the template calls `_execute_code()` without `await`, so Godot 4.7.2 rejects the generated script at parse time); live slow-mutation coverage uses a synchronous delay instead, and changing the template was out of scope for this round. The live queue-completion regression test and live benchmark now cover the previously pending items.
