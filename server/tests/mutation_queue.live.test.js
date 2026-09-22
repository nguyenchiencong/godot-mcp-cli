#!/usr/bin/env node

/**
 * LIVE queue-completion regression test (editor-required; NOT part of
 * `npm run test:offline`).
 *
 * Spawns a DEDICATED headless fixture editor (server/tests/utils/fixture_editor.js)
 * on a free port via the GODOT_MCP_PORT override and verifies the mutation
 * FIFO's completion semantics end-to-end:
 *
 *   1. A deliberately SLOW mutation 1 must finish before a mutation 2 that is
 *      submitted immediately afterwards: the client observes mutation 1 only
 *      after its ~400 ms wait (t1 - submit >= 350 ms) and mutation 2 strictly
 *      after mutation 1 completed (t2 > t1). This is the live counterpart of
 *      the H1 fix (dispatch awaits completion, not dispatch).
 *   2. A 10-deep burst of editor-script mutations with distinct markers must
 *      complete in submission order (the editor-side FIFO drains one mutation
 *      at a time).
 *
 * Deviation note (evidence-based): the burst/slow scripts cannot use the
 * literal `await get_tree().create_timer(0.4).timeout` inside
 * `execute_editor_script`. The command template calls `_execute_code()`
 * without `await`, so a user `await` turns `_execute_code` into a coroutine
 * and Godot 4.7.2 rejects the generated script at parse time
 * ("Function \"_execute_code()\" is a coroutine, so it must be called with
 * \"await\"", reproduced with `--headless --check-only -s`). The 0.4 s wait
 * before finishing is therefore a synchronous `OS.delay_msec(400)`, which
 * produces the same client-visible contract: mutation 1's response arrives
 * ~400 ms late and mutation 2 must not overtake it.
 *
 * Safety: never connects to, reloads, or stops a user's editor — only the
 * spawned fixture PID tree is killed and only the fixture dir is deleted
 * (both in finally). Skips with a clear message when no usable port exists.
 *
 * Usage (after `npm run build`):
 *   node tests/mutation_queue.live.test.js
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { GodotConnection } from '../dist/utils/godot_connection.js';
import { startFixtureEditor } from '../tests/utils/fixture_editor.js';

const COMMAND_TIMEOUT_MS = 30000;
const SLOW_DELAY_MS = 400;
const BURST_SIZE = 10;
// Generous lower bound: the slow mutation must be observed late by MORE than
// a scheduler wobble, proving the response really waited for the delay.
const SLOW_OBSERVATION_MIN_MS = 350;

let fixture = null;
let connection = null;

function slowMutationScript() {
  // See deviation note in the header: synchronous 400 ms wait, then marker.
  return {
    code: [
      `OS.delay_msec(${SLOW_DELAY_MS})`,
      'print("MUT1_SLOW_DONE")',
    ].join('\n'),
    allow_unsafe: true,
  };
}

function quickMutationScript(marker) {
  return {
    code: `print("${marker}")`,
    allow_unsafe: true,
  };
}

async function main() {
  fixture = await startFixtureEditor();
  if (fixture.skipped) {
    console.log(`[SKIP] mutation_queue.live: ${fixture.reason}`);
    return;
  }
  console.log(`[mutation_queue.live] dedicated headless fixture editor on port ${fixture.port} (${fixture.via})`);

  connection = new GodotConnection(fixture.url, COMMAND_TIMEOUT_MS, 1, 200);
  await connection.connect();
  const info = await connection.sendCommand('get_project_info', {});
  const version = info.godot_version || {};
  console.log(
    `[mutation_queue.live] editor ${version.major}.${version.minor}.${version.patch}, project "${info.project_name}"`
  );

  // --- Case 1: slow mutation 1, mutation 2 submitted immediately ----------
  const submit1At = performance.now();
  const mutation1 = connection
    .sendCommand('execute_editor_script', slowMutationScript())
    .then(result => ({ result, completedAt: performance.now() }));
  // No await between submissions: mutation 2 enters the FIFO right behind 1.
  const submit2At = performance.now();
  const mutation2 = connection
    .sendCommand('execute_editor_script', quickMutationScript('MUT2_QUICK_DONE'))
    .then(result => ({ result, completedAt: performance.now() }));

  const [outcome1, outcome2] = await Promise.all([mutation1, mutation2]);
  const t1 = outcome1.completedAt;
  const t2 = outcome2.completedAt;

  assert.equal(outcome1.result.success, true, `mutation 1 must succeed: ${JSON.stringify(outcome1.result)}`);
  assert.ok(
    (outcome1.result.output || []).join('\n').includes('MUT1_SLOW_DONE'),
    `mutation 1 output must contain its marker: ${JSON.stringify(outcome1.result.output)}`
  );
  assert.equal(outcome2.result.success, true, `mutation 2 must succeed: ${JSON.stringify(outcome2.result)}`);
  assert.ok(
    (outcome2.result.output || []).join('\n').includes('MUT2_QUICK_DONE'),
    `mutation 2 output must contain its marker: ${JSON.stringify(outcome2.result.output)}`
  );
  const slowObservationMs = t1 - submit1At;
  assert.ok(
    slowObservationMs >= SLOW_OBSERVATION_MIN_MS,
    `mutation 1 must be observed only after its ${SLOW_DELAY_MS} ms wait ` +
      `(observed after ${slowObservationMs.toFixed(1)} ms); the response did not wait for the script to finish`
  );
  assert.ok(
    t2 > t1,
    `mutation 2 (completed at ${t2.toFixed(1)} ms) must complete STRICTLY AFTER mutation 1 ` +
      `(completed at ${t1.toFixed(1)} ms)`
  );
  console.log(
    `[mutation_queue.live] case 1: mutation 1 observed after ${slowObservationMs.toFixed(1)} ms; ` +
      `mutation 2 completed ${(t2 - t1).toFixed(1)} ms later (strict ordering held)`
  );

  // --- Case 2: 10-deep burst completes in submission order ----------------
  const completions = [];
  const submissions = Array.from({ length: BURST_SIZE }, (_, index) => {
    const submittedAt = performance.now();
    return connection
      .sendCommand('execute_editor_script', quickMutationScript(`BURST_${index}`))
      .then(result => {
        completions.push({ index, completedAt: performance.now(), result });
        return result;
      });
  });
  const settled = await Promise.allSettled(submissions);
  const failures = settled.filter(outcome => outcome.status === 'rejected');
  assert.equal(failures.length, 0, `burst mutations failed: ${failures.map(f => f.reason).join('; ')}`);

  const completionOrder = completions.map(entry => entry.index);
  assert.deepEqual(
    completionOrder,
    Array.from({ length: BURST_SIZE }, (_, index) => index),
    `10-deep burst completion order must match submission order, got ${JSON.stringify(completionOrder)}`
  );
  for (let i = 1; i < completions.length; i++) {
    assert.ok(
      completions[i].completedAt >= completions[i - 1].completedAt,
      `burst mutation ${completions[i].index} completed before an earlier submission`
    );
  }
  completions.forEach(entry => {
    assert.ok(
      (entry.result.output || []).join('\n').includes(`BURST_${entry.index}`),
      `burst mutation ${entry.index} response is missing its marker`
    );
  });
  const burstWindowMs = completions[completions.length - 1].completedAt - completions[0].completedAt;
  console.log(
    `[mutation_queue.live] case 2: 10-deep burst completion order matched submission order ` +
      `(window ${burstWindowMs.toFixed(1)} ms)`
  );

  console.log('[mutation_queue.live] PASS: queue-completion regression checks passed on the dedicated fixture editor');
}

try {
  await main();
} catch (error) {
  console.error('[mutation_queue.live] FAILED:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
} finally {
  if (connection) {
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
