/**
 * Shared helper that starts a DEDICATED headless Godot fixture editor for
 * live checks (benchmark:live, mutation_queue.live.test.js).
 *
 * Safety contract (never touch a user's open editor):
 *   - A throwaway project (project.godot + a copy of addons/godot_mcp) is
 *     created in a fresh temp directory and spawned as its own process.
 *   - The fixture editor is told to listen on a freshly picked free port via
 *     the GODOT_MCP_PORT override, so a busy default port (9080) never matters.
 *   - Only the PID this helper spawned is ever killed (taskkill /PID <pid> /T
 *     /F on win32); no other Godot process is inspected, reloaded, or stopped.
 *   - If the bundled addon has no GODOT_MCP_PORT override (older tree) the
 *     caller gets { skipped: true } instead of a run whenever 9080 is busy.
 *
 * stop() always terminates the spawned process tree and deletes the fixture
 * directory; callers should invoke it from a finally block.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// Documented project binary (docs/guidelines/suggested-commands.md); overridable
// for other machines.
const GODOT_BINARY = process.env.GODOT_MCP_GODOT_BIN || 'D:/Godot/GodotEngine/godot.exe';

const STARTUP_TIMEOUT_MS = 90000;
const PROBE_INTERVAL_MS = 500;
const LOG_RING_LINES = 400;

const PROJECT_GODOT = [
  'config_version=5',
  '',
  '[application]',
  '',
  'config/name="Godot MCP Live Fixture"',
  '',
  '[editor_plugins]',
  '',
  'enabled=PackedStringArray("res://addons/godot_mcp/plugin.cfg")',
  '',
].join('\n');

/** Resolve the bundled addon source directory (dev tree or packaged copy). */
export function resolveAddonSourceDir() {
  const candidates = [
    path.join(REPO_ROOT, 'addons', 'godot_mcp'),
    path.join(SERVER_ROOT, 'addons', 'godot_mcp'),
  ];
  const found = candidates.find(candidate => fs.existsSync(path.join(candidate, 'plugin.cfg')));
  if (!found) {
    throw new Error(`Bundled addon not found; looked in: ${candidates.join(', ')}`);
  }
  return found;
}

/** True when the bundled addon honors the GODOT_MCP_PORT override. */
export function portOverrideSupported(addonDir = resolveAddonSourceDir()) {
  const source = fs.readFileSync(path.join(addonDir, 'websocket_server.gd'), 'utf8');
  return source.includes('GODOT_MCP_PORT');
}

/** localhost probe: true when something accepts connections on the port. */
export function isPortBusy(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = busy => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    // A bound-but-unresponsive local port counts as busy: never risk colliding.
    socket.once('timeout', () => finish(true));
  });
}

/** Ask the OS for a free ephemeral port, then release it. */
export function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(closeError => {
        if (closeError) reject(closeError);
        else if (port >= 1024 && port <= 65535) resolve(port);
        else reject(new Error(`OS returned an out-of-range port: ${port}`));
      });
    });
  });
}

/**
 * Decide which port the fixture editor should use.
 * Returns { port, via } or { skipped: true, reason }.
 */
export async function resolveFixturePort() {
  if (portOverrideSupported()) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const port = await pickFreePort();
      if (!(await isPortBusy(port))) {
        return { port, via: 'GODOT_MCP_PORT override (picked free port)' };
      }
    }
    return { skipped: true, reason: 'Could not pick a free port for the fixture editor after 5 attempts.' };
  }
  // No override in this addon tree: the fixture would have to bind the fixed
  // default port. If anything already listens there (possibly a user's
  // editor), refuse rather than touch it.
  if (await isPortBusy(9080)) {
    return {
      skipped: true,
      reason:
        'Bundled addon has no GODOT_MCP_PORT override and port 9080 is busy; ' +
        'refusing to run against an editor this harness did not spawn.',
    };
  }
  return { port: 9080, via: 'default port (addon has no GODOT_MCP_PORT override, 9080 is free)' };
}

function spawnLogCapture() {
  const lines = [];
  const append = chunk => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line) continue;
      lines.push(line);
      if (lines.length > LOG_RING_LINES) lines.shift();
    }
  };
  return {
    append,
    tail: () => lines.join('\n'),
  };
}

async function waitForWebSocket(url, child, log, deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Fixture editor exited early (code=${child.exitCode}, signal=${child.signalCode}).\n` +
          `Last output:\n${log.tail()}`
      );
    }
    const connected = await new Promise(resolve => {
      let settled = false;
      const done = value => {
        if (settled) return;
        settled = true;
        try {
          ws.removeAllListeners();
          ws.terminate();
        } catch {
          /* already closed */
        }
        resolve(value);
      };
      let ws;
      try {
        ws = new WebSocket(url, { handshakeTimeout: 2000, perMessageDeflate: false });
      } catch {
        resolve(false);
        return;
      }
      ws.once('open', () => done(true));
      ws.once('error', () => done(false));
      setTimeout(() => done(false), 2500);
    });
    if (connected) return;
    await new Promise(resolve => setTimeout(resolve, PROBE_INTERVAL_MS));
  }
  throw new Error(
    `Fixture editor did not accept a WebSocket connection on ${url} within ${STARTUP_TIMEOUT_MS} ms.\n` +
      `Last output:\n${log.tail()}`
  );
}

/**
 * Start a dedicated headless fixture editor.
 *
 * @returns {Promise<object>} handle with { port, url, fixtureDir, pid, log, stop() },
 *   or { skipped: true, reason } when the run must not proceed.
 */
export async function startFixtureEditor() {
  const resolution = await resolveFixturePort();
  if (resolution.skipped) {
    return resolution;
  }
  const { port, via } = resolution;
  const addonSource = resolveAddonSourceDir();
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-fixture-'));
  try {
    fs.mkdirSync(path.join(fixtureDir, 'addons'), { recursive: true });
    fs.cpSync(addonSource, path.join(fixtureDir, 'addons', 'godot_mcp'), { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'project.godot'), PROJECT_GODOT, 'utf8');
  } catch (error) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    throw error;
  }

  const log = spawnLogCapture();
  const child = spawn(GODOT_BINARY, ['--headless', '--path', fixtureDir, '--editor'], {
    env: { ...process.env, GODOT_MCP_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', log.append);
  child.stderr.on('data', log.append);
  // Spawn failures surface here; a natural exit is handled during startup wait.
  const spawnFailure = new Promise((resolve, reject) => {
    child.once('error', error =>
      reject(new Error(`Failed to spawn fixture editor (${GODOT_BINARY}): ${error.message}`))
    );
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  spawnFailure.catch(() => {}); // observed by waitForWebSocket / stop; avoid unhandled rejection

  const url = `ws://127.0.0.1:${port}`;
  try {
    await waitForWebSocket(url, child, log, Date.now() + STARTUP_TIMEOUT_MS);
  } catch (error) {
    await stopFixtureEditor({ fixtureDir, child, pid: child.pid, log });
    throw error;
  }

  console.error(
    `[fixture-editor] started (pid=${child.pid}, port=${port}, via=${via}, fixture=${fixtureDir})`
  );

  return {
    port,
    url,
    via,
    fixtureDir,
    pid: child.pid,
    log,
    child,
    stop: () => stopFixtureEditor({ fixtureDir, child, pid: child.pid, log }),
  };
}

/**
 * Terminate ONLY the process tree this helper spawned, then delete the
 * fixture directory. Idempotent and safe to call from finally blocks.
 */
export async function stopFixtureEditor({ fixtureDir, child, pid, log }) {
  if (pid !== undefined && pid !== null) {
    try {
      if (process.platform === 'win32') {
        await new Promise(resolve => {
          const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
          killer.once('error', resolve);
          killer.once('close', resolve);
        });
      } else if (child && child.exitCode === null) {
        child.kill('SIGKILL');
      }
    } catch (error) {
      console.error(`[fixture-editor] failed to kill pid ${pid}: ${error.message}`);
      if (log) console.error(log.tail());
    }
  }
  if (child && child.exitCode === null) {
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
  }
  if (fixtureDir) {
    // Godot can hold file handles briefly after the process dies: retry a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
        if (!fs.existsSync(fixtureDir)) {
          console.error(`[fixture-editor] fixture removed: ${fixtureDir}`);
          return;
        }
      } catch {
        /* retry */
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    console.error(`[fixture-editor] WARNING: could not fully remove fixture: ${fixtureDir}`);
  }
}
