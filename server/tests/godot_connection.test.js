#!/usr/bin/env node

/**
 * Deterministic regression tests for concurrency bugs in GodotConnection
 * (server/src/utils/godot_connection.ts).
 *
 * Test 1 (existing): reconnect fan-out — outage -> restart on same port ->
 * exactly one auto-reconnect accepted; explicit disconnect -> no reconnects.
 *
 * Test 2: concurrent connect() calls share exactly one retry routine. Without
 * the fix every concurrent connect() spawns its own retry loop, so several
 * live sockets get accepted when the server comes back (fan-out).
 *
 * Test 3: deterministic stale-attempt safety. A stalled first attempt's late
 * 'close' event (flushed after a newer attempt is established) must not null
 * out the newer socket, clear `connected`, or schedule a parallel reconnect.
 * Determinism comes from an emit-hold mock on WebSocket.prototype, not from
 * wall-clock races.
 *
 * Test 5: explicit initial connect() against a down local port rejects after
 * exactly its configured retry loop (maxRetries=1 -> exactly 2 attempts, one
 * retryDelay sleep) and never starts automatic reconnect cycles.
 *
 * Requires `npm run build` beforehand so dist/utils/godot_connection.js exists.
 *
 *   node tests/godot_connection.test.js
 */

import assert from 'node:assert';
import http from 'node:http';
import crypto from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { GodotConnection, resolveWebSocketUrl } from '../dist/utils/godot_connection.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve the first emission of `event` (reject on 'error'). */
function once(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once('error', reject);
  });
}

/**
 * Track a WebSocketServer's accepted connection count and concurrent open
 * sockets so we can detect reconnect fan-out.
 */
function makeServer(port) {
  const wss = new WebSocketServer({ port });
  const state = {
    accepted: 0,
    currentOpen: 0,
    maxConcurrent: 0,
    sockets: [],
  };
  wss.on('connection', (socket) => {
    state.accepted += 1;
    state.currentOpen += 1;
    if (state.currentOpen > state.maxConcurrent) {
      state.maxConcurrent = state.currentOpen;
    }
    state.sockets.push(socket);
    socket.on('close', () => {
      state.currentOpen = Math.max(0, state.currentOpen - 1);
    });
    // Keep the client happy if it ever sends anything (not required here).
    socket.on('message', () => {});
  });
  return { wss, state };
}

async function startServer(port) {
  const server = makeServer(port);
  await once(server.wss, 'listening');
  return server;
}

/** Terminate tracked clients and stop listening. Resolves when closed. */
function stopServer(server) {
  return new Promise((resolve) => {
    for (const sock of server.state.sockets) {
      try {
        sock.terminate();
      } catch {
        /* ignore */
      }
    }
    server.wss.close(() => resolve());
  });
}

/**
 * Stall server for TEST 3: the FIRST upgrade request is stalled (never
 * answered, forcing the client's connectionTimeout); every SUBSEQUENT request
 * completes the WebSocket handshake manually. Tracks upgrades, accepted
 * handshakes, and concurrent open TCP sockets like makeServer does.
 */
function makeStallServer() {
  const state = {
    accepted: 0,
    upgrades: 0,
    currentOpen: 0,
    maxConcurrent: 0,
  };
  const sockets = [];
  let firstUpgrade = true;
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('stall server');
  });
  server.on('upgrade', (req, socket) => {
    state.upgrades += 1;
    if (firstUpgrade) {
      // Stall: never respond, forcing the client's connectionTimeout to fire.
      firstUpgrade = false;
      sockets.push(socket);
      return;
    }
    // Complete the handshake manually.
    const key = req.headers['sec-websocket-key'];
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    state.accepted += 1;
    state.currentOpen += 1;
    if (state.currentOpen > state.maxConcurrent) {
      state.maxConcurrent = state.currentOpen;
    }
    socket.on('close', () => {
      state.currentOpen = Math.max(0, state.currentOpen - 1);
    });
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n'
    );
    sockets.push(socket);
  });
  return { server, state, sockets };
}

async function startStallServer() {
  const stall = makeStallServer();
  stall.server.listen(0);
  await once(stall.server, 'listening');
  stall.port = stall.server.address().port;
  return stall;
}

/** Destroy all tracked sockets and stop listening. Resolves when closed. */
function stopStallServer(stall) {
  return new Promise((resolve) => {
    for (const sock of stall.sockets) {
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
    }
    try {
      stall.server.closeAllConnections();
    } catch {
      /* ignore */
    }
    stall.server.close(() => resolve());
  });
}

async function main() {
  const connections = [];
  const servers = [];
  const stopped = new Set();
  let stallServer = null;
  let mockInstalled = false;
  const origEmit = WebSocket.prototype.emit;
  const held = [];
  let holdTimer = null;

  try {
    // ================================================================
    // TEST 1 - outage/restart reconnect + explicit disconnect (existing)
    // ================================================================
    // Let the OS pick an available port, then reuse that exact port after the
    // simulated outage to exercise the same-URL reconnect path.
    const serverA = await startServer(0);
    servers.push(serverA);
    const port = serverA.wss.address().port;
    const url = `ws://127.0.0.1:${port}`;

    // Short timeout, enough retries, short retryDelay (Windows-friendly).
    const connection = new GodotConnection(url, 1000, 8, 100);
    connections.push(connection);
    let serverB = null;

    // --- Step 2: initial connect -> exactly one connection ---
    await connection.connect();
    await sleep(50);
    assert.ok(connection.isConnected(), 'should be connected after initial connect');
    assert.strictEqual(
      serverA.state.accepted,
      1,
      'initial connect should accept exactly one connection'
    );

    // --- Step 3: simulate outage: drop clients + stop the server ---
    await stopServer(serverA);
    stopped.add(serverA);
    // Let at least one reconnect attempt fail before bringing the server back.
    await sleep(250);

    // --- Step 4: restart a server on the SAME port ---
    serverB = await startServer(port);
    servers.push(serverB);

    const deadline = Date.now() + 5000;
    while (!connection.isConnected() && Date.now() < deadline) {
      await sleep(20);
    }
    assert.ok(connection.isConnected(), 'should auto-reconnect after the outage');
    assert.strictEqual(
      serverB.state.accepted,
      1,
      'reconnect must accept EXACTLY one connection (no fan-out)'
    );
    assert.ok(
      serverB.state.maxConcurrent <= 1,
      'must never have more than one concurrent live socket'
    );

    // --- Step 5: explicit disconnect must not trigger a reconnect ---
    connection.disconnect();
    await sleep(250); // well beyond retryDelay (100ms)
    assert.strictEqual(
      connection.isConnected(),
      false,
      'disconnect() should close the connection'
    );
    assert.strictEqual(
      serverB.state.accepted,
      1,
      'no additional connections after explicit disconnect'
    );

    // ================================================================
    // TEST 2 - concurrent connect() calls share exactly one retry routine
    // ================================================================
    const serverC = await startServer(0);
    servers.push(serverC);
    const port2 = serverC.wss.address().port;
    const url2 = `ws://127.0.0.1:${port2}`;

    const connection2 = new GodotConnection(url2, 1000, 8, 100);
    connections.push(connection2);

    await connection2.connect();
    await sleep(50);
    assert.strictEqual(
      serverC.state.accepted,
      1,
      'test2: initial connect should accept exactly one connection'
    );

    // Outage: drop the client and stop the server.
    await stopServer(serverC);
    stopped.add(serverC);
    // Let the auto-reconnect timer (retryDelay=100ms) start its shared loop
    // (or be about to - either way the first call below starts the single
    // loop and the others join it).
    await sleep(250);

    // Fire three concurrent connects while the server is still down. With the
    // bug each call runs its OWN retry loop (fan-out); with the fix they all
    // share the one in-flight loop.
    const [p1, p2, p3] = [
      connection2.connect(),
      connection2.connect(),
      connection2.connect(),
    ];
    await sleep(100); // all three share one in-flight loop; attempts are failing

    // Bring the server back on the SAME port.
    const serverD = await startServer(port2);
    servers.push(serverD);

    await Promise.all([p1, p2, p3]);

    assert.strictEqual(
      serverD.state.accepted,
      1,
      'concurrent connect() calls must share exactly one retry routine'
    );
    assert.ok(
      serverD.state.maxConcurrent <= 1,
      'test2: must never have more than one concurrent live socket'
    );
    assert.strictEqual(
      connection2.isConnected(),
      true,
      'test2: should be connected after the shared loop succeeds'
    );

    // connect() while already connected returns immediately.
    await connection2.connect();
    assert.strictEqual(
      serverD.state.accepted,
      1,
      'test2: connect() while connected must not open a new socket'
    );

    connection2.disconnect();
    await sleep(250);
    assert.strictEqual(
      connection2.isConnected(),
      false,
      'test2: disconnect() should close the connection'
    );
    assert.strictEqual(
      serverD.state.accepted,
      1,
      'test2: no additional connections after explicit disconnect'
    );

    // ================================================================
    // TEST 3 - deterministic stale-attempt safety
    // ================================================================
    // Install the emit-hold mock BEFORE any GodotConnection socket exists.
    // Client-side sockets have a string `.url` (ws://...); server-side sockets
    // do not, so only the GodotConnection's sockets are held.
    WebSocket.prototype.emit = function (event, ...args) {
      if (
        event === 'close' &&
        typeof this.url === 'string' &&
        this.url.startsWith('ws://')
      ) {
        held.push(() => origEmit.call(this, 'close', ...args));
        if (!holdTimer) {
          holdTimer = setTimeout(() => {
            const pending = held.splice(0);
            pending.forEach((fn) => fn());
          }, 600);
        }
        return true;
      }
      return origEmit.apply(this, [event, ...args]);
    };
    mockInstalled = true;

    const stall = await startStallServer();
    stallServer = stall;
    const url3 = `ws://127.0.0.1:${stall.port}`;

    const connection3 = new GodotConnection(url3, 300, 5, 100);
    connections.push(connection3);

    // Attempt 1 is stalled by the server; the client connectionTimeout
    // (300ms) fires and terminates it, the loop sleeps 100ms, attempt 2
    // completes the handshake -> p resolves (~400ms).
    const p = connection3.connect();
    await p;
    assert.strictEqual(
      connection3.isConnected(),
      true,
      'test3: should be connected via attempt 2'
    );
    assert.strictEqual(stall.state.accepted, 1, 'test3: only attempt 2 should be handshaken');
    assert.strictEqual(stall.state.upgrades, 2, 'test3: attempt 1 stalls, attempt 2 completes');

    // Attempt 1's 'close' is held by the mock and flushes ~600ms after it was
    // emitted (~300ms), i.e. AFTER attempt 2 is established. Wait past it.
    await sleep(650);

    assert.strictEqual(
      connection3.isConnected(),
      true,
      'stale close must NOT clear the current connection'
    );
    assert.strictEqual(
      stall.state.accepted,
      1,
      'stale close must NOT schedule a reconnect (accepted stays 1)'
    );
    assert.strictEqual(
      stall.state.upgrades,
      2,
      'stale close must NOT trigger a new connection attempt'
    );
    assert.ok(
      stall.state.maxConcurrent <= 1,
      'test3: must never have more than one concurrent live socket'
    );

    // No delayed reconnect may appear after the stale close either.
    await sleep(400);
    assert.strictEqual(
      stall.state.upgrades,
      2,
      'no delayed reconnect attempt after the stale close'
    );

    // Restore the mock and flush any still-held events.
    WebSocket.prototype.emit = origEmit;
    mockInstalled = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    const pending = held.splice(0);
    pending.forEach((fn) => fn());

    connection3.disconnect();
    await stopStallServer(stall);
    stallServer = null;

    // ================================================================
    // TEST 4 - long outage: auto-reconnect REPEATS cycles until success
    // ================================================================
    // maxRetries=1 means each automatic cycle exhausts after only ~retryDelay.
    // Before the fix, a single exhausted cycle cleared `reconnecting` and gave
    // up forever, so a server down longer than one cycle never got reconnected.
    // After the fix, cycles repeat until success or disconnect().
    const serverE = await startServer(0);
    servers.push(serverE);
    const port4 = serverE.wss.address().port;
    const url4 = `ws://127.0.0.1:${port4}`;

    const connection4 = new GodotConnection(url4, 300, 1, 50);
    connections.push(connection4);

    await connection4.connect();
    await sleep(50);
    assert.ok(connection4.isConnected(), 'test4: initial connect');
    assert.strictEqual(serverE.state.accepted, 1, 'test4: one initial connection');

    // Outage: stop the server and stay down long enough for the first automatic
    // reconnect cycle (and several more) to fully exhaust.
    await stopServer(serverE);
    stopped.add(serverE);
    await sleep(350);

    // Restart on the SAME port. The fix keeps cycling, so a later cycle's
    // attempt succeeds within the deadline.
    const serverF = await startServer(port4);
    servers.push(serverF);

    const deadline4 = Date.now() + 3000;
    while (!connection4.isConnected() && Date.now() < deadline4) {
      await sleep(20);
    }
    assert.ok(
      connection4.isConnected(),
      'test4: should reconnect after long outage via repeated cycles'
    );
    assert.strictEqual(
      serverF.state.accepted,
      1,
      'test4: exactly one accepted socket after reconnect (no fan-out)'
    );
    assert.ok(
      serverF.state.maxConcurrent <= 1,
      'test4: must never have more than one concurrent live socket'
    );

    // Explicit disconnect must stop all further reconnect attempts.
    connection4.disconnect();
    await sleep(300);
    assert.strictEqual(
      connection4.isConnected(),
      false,
      'test4: disconnect closes the connection'
    );
    assert.strictEqual(
      serverF.state.accepted,
      1,
      'test4: no additional connections after explicit disconnect'
    );

    // ================================================================
    // TEST 5 - explicit connect() against a down port rejects after its
    // configured retry loop; no automatic reconnect cycles follow
    // ================================================================
    // An explicit initial connect() must fail after exactly maxRetries+1
    // attempts (maxRetries=1 -> attempts 1 and 2, one retryDelay sleep between
    // them) and must NOT schedule automatic reconnect cycles that would keep
    // trying forever. Attempts are counted by instrumenting
    // WebSocket.prototype.emit like TEST 3 does: each failed client socket
    // (down port -> ECONNREFUSED) emits exactly one 'error', so the count
    // equals the number of WebSocket constructions.

    // Grab a free port, then release it so nothing listens on it.
    const probe = await startServer(0);
    servers.push(probe);
    const downPort = probe.wss.address().port;
    await stopServer(probe);
    stopped.add(probe);

    let downPortAttempts = 0;
    WebSocket.prototype.emit = function (event, ...args) {
      if (
        event === 'error' &&
        typeof this.url === 'string' &&
        this.url.startsWith('ws://')
      ) {
        downPortAttempts += 1;
      }
      return origEmit.apply(this, [event, ...args]);
    };
    mockInstalled = true;

    const url5 = `ws://127.0.0.1:${downPort}`;
    const connection5 = new GodotConnection(url5, 300, 1, 50);
    connections.push(connection5);

    // Race against a clearable guard so a regression that hangs (instead of
    // rejecting) fails fast without blocking the suite or leaving a timer.
    let guard;
    const guardPromise = new Promise((resolve) => {
      guard = setTimeout(() => resolve('timeout'), 2000);
    });
    const t0 = Date.now();
    const result = await Promise.race([
      connection5.connect().then(() => 'connected', () => 'rejected'),
      guardPromise,
    ]);
    clearTimeout(guard);
    const elapsed = Date.now() - t0;

    assert.strictEqual(
      result,
      'rejected',
      'test5: connect() must reject against a down port'
    );
    assert.strictEqual(
      downPortAttempts,
      2,
      'test5: exactly maxRetries+1 = 2 attempts in the configured retry loop'
    );
    // Lower bound proves the loop honored retryDelay (50ms sleep between the
    // two attempts) instead of rejecting on the first error.
    assert.ok(elapsed >= 40, 'test5: rejection must come after the retryDelay sleep');
    assert.ok(elapsed < 2000, 'test5: rejection must not hang past the guard');
    assert.strictEqual(
      connection5.isConnected(),
      false,
      'test5: must not be connected after the loop rejects'
    );

    // Wait well past several auto-reconnect cycles (retryDelay=50ms): no
    // attempt may appear after the explicit loop gave up.
    await sleep(300);
    assert.strictEqual(
      downPortAttempts,
      2,
      'test5: no automatic reconnect cycle may start after the explicit loop rejects'
    );
    assert.strictEqual(
      connection5.isConnected(),
      false,
      'test5: still disconnected after waiting past auto-cycle periods'
    );

    connection5.disconnect();
    WebSocket.prototype.emit = origEmit;
    mockInstalled = false;

    console.log('GodotConnection tests passed');
  } finally {
    // Always tear down so the process can exit naturally (no process.exit()):
    // held timers must be cleared, reconnect timers neutralized by
    // intentionalClose, all servers closed.
    if (mockInstalled) {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      WebSocket.prototype.emit = origEmit;
      mockInstalled = false;
    }
    for (const conn of connections) {
      try {
        conn.disconnect();
      } catch {
        /* ignore */
      }
    }
    // Flush any still-held close events AFTER disconnect so every flushed
    // handler observes intentionalClose === true (no reconnect timers).
    const pending = held.splice(0);
    pending.forEach((fn) => fn());
    if (stallServer) {
      try {
        await stopStallServer(stallServer);
      } catch {
        /* ignore */
      }
      stallServer = null;
    }
    for (const server of servers) {
      if (stopped.has(server)) continue;
      try {
        await stopServer(server);
      } catch {
        /* ignore */
      }
    }
  }
}

// GODOT_MCP_PORT resolver (offline): mirrors the plugin-side override rules
// in websocket_server.gd — digits only, 1024-65535, fallback 9080.
{
  const original = process.env.GODOT_MCP_PORT;
  const cases = [
    [undefined, 'ws://127.0.0.1:9080'],
    ['', 'ws://127.0.0.1:9080'],
    ['   ', 'ws://127.0.0.1:9080'],
    ['9080', 'ws://127.0.0.1:9080'],
    ['5894', 'ws://127.0.0.1:5894'],
    ['65535', 'ws://127.0.0.1:65535'],
    ['1024', 'ws://127.0.0.1:1024'],
    ['1023', 'ws://127.0.0.1:9080'],
    ['70000', 'ws://127.0.0.1:9080'],
    ['abc', 'ws://127.0.0.1:9080'],
    ['12.5', 'ws://127.0.0.1:9080'],
    ['0x1F90', 'ws://127.0.0.1:9080'],
    ['-1', 'ws://127.0.0.1:9080'],
  ];
  for (const [value, expected] of cases) {
    if (value === undefined) delete process.env.GODOT_MCP_PORT;
    else process.env.GODOT_MCP_PORT = value;
    const actual = resolveWebSocketUrl();
    if (actual !== expected) {
      throw new Error(`resolveWebSocketUrl with GODOT_MCP_PORT=${JSON.stringify(value)}: expected ${expected}, got ${actual}`);
    }
  }
  if (original === undefined) delete process.env.GODOT_MCP_PORT;
  else process.env.GODOT_MCP_PORT = original;
  console.log('GODOT_MCP_PORT resolver tests passed');
}

main().catch((err) => {
  console.error('GodotConnection tests FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
