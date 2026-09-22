# Suggested Commands

## TypeScript server
- **Build:** `cd server && npm run build`
- **Start:** `cd server && npm run start`
- **Dev (auto-rebuild):** `cd server && npm run dev`

## Tests
- **Full suite:** `cd server && node tests/tools.test.js`
- **Offline safety/workflow paths:** `cd server && npm run test:offline`
  (runs `debug_output_buffer`, `batch_tools`, and `playtest_tools`; no Godot or editor required)
- **Single category:** `node tests/tools.test.js --category=<cat>`
  (categories: `node`, `script`, `shader`, `scene`, `project`, `editor`,
  `asset`, `debugger`, `input`, `enhanced`)
- **Skip running-game tests:** add `--skip-runtime`
- **Queue-completion live test (fixture editor required):** `cd server && node tests/mutation_queue.live.test.js`
  (spawns its own temporary headless fixture editor on a free `GODOT_MCP_PORT` port; not part of `test:offline`; never attaches to a user's editor)
- Runtime tests (debugger, input, shader runtime, and live playtest assertions) require a game launched from the editor with the debugger attached (F5). The offline playtest test uses an adapter; unavailable runtime/eval bridges are infrastructure failures, not passes.
- `--skip-runtime` can still mutate an editor. Use an isolated temporary fixture/headless Godot for live checks and do not reload or stop a user's existing editor.

## Benchmarks
- **Mock client transport:** `cd server && npm run build && npm run benchmark:transport` (optional `-- --duration-ms 2000`). Uses an ephemeral loopback peer, not Godot; reports post-change latency/throughput and GC-dependent heap samples, not editor frame cost or speedup. See [verification record](../testing/approved-optimization.md).
- **Live headless editor:** `cd server && npm run build && npm run benchmark:live`. Spawns a dedicated temporary fixture editor on a free `GODOT_MCP_PORT` port (never touches a user's editor; fixture is deleted afterwards) and measures sequential reads, read-during-burst, mutation completion order, and debug-stream capture end to end. Labeled headless/no-rendering — does not measure GPU or rendering frame cost. Results: [verification record](../testing/approved-optimization.md).

## Releases
- Commit everything first: `npm version` refuses to run on a dirty tree (release hygiene — the release commit must contain exactly the synced release state).
- From `server/`, run `npm run release:minor` (or `release:patch` / `release:major`).
- The `version` lifecycle hook runs `scripts/bump-version.mjs`, which syncs the `version` constant in `src/index.ts`, both version fields in `package-lock.json` (top-level and `packages[""]`), and replaces the first `## Unreleased` heading in the root `CHANGELOG.md` with `## <version> - <YYYY-MM-DD>`. `server/package.json` is owned by `npm version` itself; the tool never touches it.
- `npm version` then commits `chore: Release v<version>` and creates the `v<version>` tag (no push — push tags/commits manually: `git push && git push --tags`).
- Standalone sync (no commit/tag): `node scripts/bump-version.mjs --set <x.y.z>` from anywhere; requires an existing `## Unreleased` CHANGELOG heading.

## Godot editor
- **Binary:** `D:\Godot\GodotEngine\godot.exe`
- **Open project:** `godot.exe --path <project> --editor`
- **Renderer:** GL Compatibility
- After plugin/autoload changes, restart the editor to apply them.
- **MCP port override:** set `GODOT_MCP_PORT` (integer 1024-65535, fallback 9080) in the editor's environment before launching to move the plugin's WebSocket port; dedicated fixture editors use it to avoid a busy default port.
