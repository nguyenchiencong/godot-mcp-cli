#!/usr/bin/env node
// LIVE HEADLESS EDITOR benchmark against a dedicated fixture editor.
//
// Label: LIVE HEADLESS EDITOR — no rendering; does not represent GPU/rendering frame cost.
//
// Unlike benchmarks/transport.bench.js (loopback mock, no Godot), this spawns
// its own throwaway fixture project in a headless Godot editor on a free port
// (GODOT_MCP_PORT override) and measures the real end-to-end command path via
// server/src/utils/godot_connection.ts. It never connects to or affects a
// user's open editor: the spawned PID tree is the only process it can kill,
// and the fixture directory is always deleted in the finally block.
//
// Cases:
//   (a) get_project_info p50/p95 over >=100 sequential calls
//   (b) list_project_files default page p50/p95 over >=50 sequential calls
//   (c) read-during-burst: 64 execute_editor_script mutations enqueued on one
//       connection while get_project_info is measured on a second connection;
//       reads bypass the mutation FIFO and should stay fast during the burst
//   (d) mutation completion order: 10 execute_editor_script mutations with
//       distinct markers; client-observed completion order must match
//       submission order
//   (e) stream_debug_output capture window of duration_ms 1000
//
// Provisional transport constants (16 packets/peer/frame, 64 FIFO, 64 pending,
// 8 MiB) are exercised, not re-tuned: live numbers here are the evidence for
// keeping or changing them.
import { performance } from 'node:perf_hooks';
import { GodotConnection, GODOT_MAX_MESSAGE_BYTES } from '../dist/utils/godot_connection.js';
import { startFixtureEditor } from '../tests/utils/fixture_editor.js';

const LABEL = 'LIVE HEADLESS EDITOR — no rendering; does not represent GPU/rendering frame cost';
const COMMAND_TIMEOUT_MS = 30000;
const BURST_SIZE = 64;
const ORDER_CASE_SIZE = 10;
const SEQUENTIAL_INFO_CALLS = 100;
const SEQUENTIAL_FILE_CALLS = 50;
const CAPTURE_WINDOW_MS = 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(caseName, latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    case: caseName,
    calls: sorted.length,
    p50_ms: Number(percentile(sorted, 0.5).toFixed(2)),
    p95_ms: Number(percentile(sorted, 0.95).toFixed(2)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function markerScript(marker) {
  return {
    code: `print("${marker}")`,
    allow_unsafe: true,
  };
}

let fixture = null;
const connections = [];

async function run() {
  fixture = await startFixtureEditor();
  if (fixture.skipped) {
    console.log(`[SKIP] ${fixture.reason}`);
    return;
  }

  console.log(LABEL);
  const meta = {
    node: process.version,
    platform: process.platform,
    port: fixture.port,
    port_via: fixture.via,
    message_limit_bytes: GODOT_MAX_MESSAGE_BYTES,
    mutation_fifo_limit: 64,
    pending_command_limit: 64,
    packets_per_peer_per_frame: 16,
    note: 'Provisional safety bounds exercised as-is; numbers are headless-editor latency, not frame cost.',
  };
  console.log(JSON.stringify(meta));

  const connA = new GodotConnection(fixture.url, COMMAND_TIMEOUT_MS, 1, 200);
  const connB = new GodotConnection(fixture.url, COMMAND_TIMEOUT_MS, 1, 200);
  connections.push(connA, connB);
  await connA.connect();
  await connB.connect();

  // Editor identity + fixture entry count for the report.
  const info = await connA.sendCommand('get_project_info', {});
  const version = info.godot_version || {};
  const editorVersion = `${version.major}.${version.minor}.${version.patch}`;
  const listing = await connA.sendCommand('list_project_files', { extensions: [] });
  const fixtureEntries = listing.total_count ?? (listing.files ? listing.files.length : 0);
  console.log(
    JSON.stringify({ editor_version: editorVersion, fixture_entries: fixtureEntries, port: fixture.port })
  );

  // (a) get_project_info, sequential.
  const infoLatencies = [];
  for (let i = 0; i < SEQUENTIAL_INFO_CALLS; i++) {
    const started = performance.now();
    const result = await connA.sendCommand('get_project_info', {});
    if (typeof result.project_name !== 'string' || result.project_name.length === 0) {
      throw new Error(`get_project_info returned no project_name: ${JSON.stringify(result)}`);
    }
    infoLatencies.push(performance.now() - started);
  }
  console.log(JSON.stringify(summarize('a_get_project_info_sequential', infoLatencies)));

  // (b) list_project_files default page, sequential.
  const fileLatencies = [];
  for (let i = 0; i < SEQUENTIAL_FILE_CALLS; i++) {
    const started = performance.now();
    const result = await connA.sendCommand('list_project_files', { extensions: [] });
    if (!Array.isArray(result.files)) {
      throw new Error(`list_project_files returned no files array: ${JSON.stringify(result)}`);
    }
    fileLatencies.push(performance.now() - started);
  }
  console.log(JSON.stringify(summarize('b_list_project_files_default_page', fileLatencies)));

  // (d) completion order of 10 mutations with distinct markers. All 10 are
  // submitted back-to-back (no awaiting between sends), so ws send order is
  // the submission order; responses must settle in the same order because the
  // editor-side FIFO drains one mutation at a time.
  const orderSubmitted = performance.now();
  const orderCompletions = [];
  const orderSettled = await Promise.allSettled(
    Array.from({ length: ORDER_CASE_SIZE }, (_, index) =>
      connA
        .sendCommand('execute_editor_script', markerScript(`BENCH_ORDER_${index}`))
        .then(result => {
          orderCompletions.push({ index, at: performance.now(), result });
          return { index, result };
        })
    )
  );
  const orderErrors = orderSettled.filter(outcome => outcome.status === 'rejected');
  if (orderErrors.length > 0) {
    throw new Error(`order case: ${orderErrors.length} mutations failed: ${orderErrors[0].reason}`);
  }
  const completionOrder = orderCompletions.map(entry => entry.index);
  const expectedOrder = Array.from({ length: ORDER_CASE_SIZE }, (_, index) => index);
  if (JSON.stringify(completionOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `mutation completion order ${JSON.stringify(completionOrder)} does not match submission order ${JSON.stringify(expectedOrder)}`
    );
  }
  for (let i = 1; i < orderCompletions.length; i++) {
    if (orderCompletions[i].at < orderCompletions[i - 1].at) {
      throw new Error(`mutation ${orderCompletions[i].index} completed before an earlier submission`);
    }
    if (!(orderCompletions[i].result.output || []).join('\n').includes(`BENCH_ORDER_${i}`)) {
      throw new Error(`mutation ${i} response is missing its marker output`);
    }
  }
  console.log(
    JSON.stringify({
      case: 'd_mutation_completion_order',
      calls: ORDER_CASE_SIZE,
      order_ok: true,
      window_ms: Number((orderCompletions[orderCompletions.length - 1].at - orderSubmitted).toFixed(1)),
    })
  );

  // (c) read-during-burst head-of-line check. Connection A enqueues exactly
  // BURST_SIZE mutations (the client pending limit and the editor FIFO limit
  // are both 64); connection B measures get_project_info while the burst
  // drains. A second connection is required: on a single connection the 64
  // mutation slots would leave no pending slot for the reads.
  const readLatenciesDuringBurst = [];
  let burstSettledAt = null;
  const burstStart = performance.now();
  const burstSettlement = Promise.allSettled(
    Array.from({ length: BURST_SIZE }, (_, index) =>
      connA.sendCommand('execute_editor_script', markerScript(`BENCH_BURST_${index % 8}`))
    )
  ).then(outcomes => {
    burstSettledAt = performance.now();
    return outcomes;
  });
  // Read loop runs concurrently; only readings completed while the burst is
  // still in flight count toward the during-burst statistics.
  while (burstSettledAt === null) {
    const started = performance.now();
    await connB.sendCommand('get_project_info', {});
    const finished = performance.now();
    if (burstSettledAt === null) {
      readLatenciesDuringBurst.push(finished - started);
    }
    await sleep(5);
  }
  const burstOutcomes = await burstSettlement;
  const burstFailures = burstOutcomes.filter(outcome => outcome.status === 'rejected');
  const burstDurationMs = burstSettledAt - burstStart;
  if (burstFailures.length > 0) {
    const first = burstFailures[0].reason;
    throw new Error(`burst: ${burstFailures.length}/${BURST_SIZE} mutations failed (first: ${first})`);
  }
  if (readLatenciesDuringBurst.length < 1) {
    throw new Error('burst completed before any read finished; re-run to measure read-during-burst');
  }
  console.log(
    JSON.stringify({
      case: 'c1_mutation_burst',
      calls: BURST_SIZE,
      duration_ms: Number(burstDurationMs.toFixed(1)),
      failures: 0,
    })
  );
  console.log(JSON.stringify(summarize('c2_get_project_info_during_mutation_burst', readLatenciesDuringBurst)));

  // (e) stream_debug_output capture window (subscribe -> 1000 ms -> unsubscribe),
  // mirroring the tool's capture action, with one marker script producing output.
  let frames = 0;
  const onFrame = () => {
    frames += 1;
  };
  connB.on('debug_output_frame', onFrame);
  const captureStart = performance.now();
  try {
    await connB.sendCommand('subscribe_debug_output', {});
    await connA.sendCommand('execute_editor_script', markerScript('BENCH_CAPTURE_MARKER'));
    await sleep(CAPTURE_WINDOW_MS);
  } finally {
    await connB.sendCommand('unsubscribe_debug_output', {});
  }
  const captureDurationMs = performance.now() - captureStart;
  connB.off('debug_output_frame', onFrame);
  if (captureDurationMs < CAPTURE_WINDOW_MS) {
    throw new Error(`capture window returned early: ${captureDurationMs.toFixed(1)} ms`);
  }
  console.log(
    JSON.stringify({
      case: 'e_stream_debug_output_capture',
      duration_ms: Number(captureDurationMs.toFixed(1)),
      frames_captured: frames,
    })
  );

  console.log(
    `Completed 5 live cases against the dedicated headless fixture editor on port ${fixture.port}; no user editor was contacted.`
  );
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const connection of connections) {
    try {
      connection.disconnect();
    } catch {
      /* already closed */
    }
  }
  // Always terminate the spawned editor tree and delete the fixture directory.
  if (fixture && !fixture.skipped) {
    await fixture.stop();
  }
}
