#!/usr/bin/env node
// Loopback benchmark of the actual GodotConnection client. No editor required.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { GodotConnection, GODOT_MAX_MESSAGE_BYTES } from '../dist/utils/godot_connection.js';

const optionIndex = process.argv.indexOf('--duration-ms');
const durationMs = optionIndex < 0 ? 1000 : Number(process.argv[optionIndex + 1]);
if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 10000) {
  throw new Error('--duration-ms must be an integer from 100 to 10000');
}
const sizes = [1024, 64 * 1024, 1024 * 1024, 7 * 1024 * 1024];
const pads = new Map(sizes.map(size => [size, 'x'.repeat(size)]));
const rows = [];
const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 4096 });
let client;
server.on('connection', socket => {
  socket.on('error', error => console.error('Mock peer:', error.message));
  socket.on('message', data => {
    const request = JSON.parse(data.toString());
    const payload = pads.get(request.params?.bench_size);
    const response = payload === undefined
      ? { commandId: request.commandId, status: 'error', message: 'Unknown benchmark size' }
      : { commandId: request.commandId, status: 'success', result: { data: payload } };
    socket.send(JSON.stringify(response));
  });
});

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function runCase(size, concurrency) {
  // Warm up and validate the mock really sends the requested size.
  const warmup = await client.sendCommand('bench', { bench_size: size });
  assert.equal(warmup.data.length, size);
  const latencies = [];
  const heapBefore = process.memoryUsage().heapUsed;
  let peakHeap = heapBefore;
  const started = performance.now();
  do {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      const requestStarted = performance.now();
      const result = await client.sendCommand('bench', { bench_size: size });
      assert.equal(result.data.length, size);
      latencies.push(performance.now() - requestStarted);
    }));
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  } while (performance.now() - started < durationMs);
  const elapsedMs = performance.now() - started;
  latencies.sort((a, b) => a - b);
  return {
    payload_bytes: size,
    concurrency,
    calls: latencies.length,
    elapsed_ms: Math.round(elapsedMs),
    ops_per_sec: Math.round(latencies.length * 1000 / elapsedMs),
    p50_ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p95_ms: Number(percentile(latencies, 0.95).toFixed(2)),
    sampled_heap_growth_mib: Number(((peakHeap - heapBefore) / 1024 / 1024).toFixed(1)),
  };
}

try {
  console.log('MOCK TRANSPORT — DOES NOT MEASURE GODOT OR EDITOR FRAME COST');
  console.log(JSON.stringify({ node: process.version, platform: process.platform, duration_ms: durationMs,
    message_limit_bytes: GODOT_MAX_MESSAGE_BYTES, note: 'Post-change baseline, not a before/after speedup; heap samples include both client and mock and depend on GC.' }));
  await once(server, 'listening');
  client = new GodotConnection(`ws://127.0.0.1:${server.address().port}`, 10000, 1, 50);
  await client.connect();
  for (const size of sizes) {
    for (const concurrency of (size > 1024 * 1024 ? [1] : [1, 16, 64])) {
      const row = await runCase(size, concurrency);
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  console.log(`Completed ${rows.length} mock cases; no editor was contacted.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  client?.disconnect();
  for (const socket of server.clients) socket.terminate();
  await new Promise(resolve => server.close(resolve));
}
