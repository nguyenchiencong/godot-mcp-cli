#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runPlaytest } from '../dist/tools/playtest_tools.js';

const calls = [];
const adapter = {
  launch: async mode => { calls.push(`launch:${mode}`); },
  stop: async () => { calls.push('stop'); return { stopped: true }; },
  runtimeScene: async () => ({ structure: { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D', visibility: { visible: true } }] } }),
  input: async sequence => { calls.push(`input:${sequence.length}`); },
  evaluate: async expression => { calls.push(`eval:${expression}`); return { result: 3 }; },
  capture: async () => ({ path: 'user://capture.png' }),
  sleep: async () => {},
};
const report = await runPlaytest({
  launch: { mode: 'main' },
  startup_timeout_ms: 1000,
  phases: [{ name: 'move', input: [{ type: 'tap', action: 'ui_accept' }], assertions: [
    { type: 'node_exists', node_path: '/Main/Player' },
    { type: 'node_type', node_path: '/Main/Player', expected_type: 'CharacterBody2D' },
    { type: 'node_visible', node_path: '/Main/Player', expected_visible: true },
    { type: 'expression', expression: 'score', operator: 'gte', expected: 2 },
  ] }],
  stop_after: true,
  capture_on_failure: true,
}, adapter);
assert.equal(report.passed, true);
assert.deepEqual(calls, ['launch:main', 'input:1', 'eval:score', 'stop']);

const makeAdapter = overrides => ({
  launch: async mode => { calls.push(`launch:${mode}`); },
  stop: async () => { calls.push('stop'); return { stopped: true }; },
  runtimeScene: async () => ({ structure: { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D', visibility: { visible: true } }] } }),
  input: async sequence => { calls.push(`input:${sequence.length}`); },
  evaluate: async expression => { calls.push(`eval:${expression}`); return { result: 3 }; },
  capture: async () => ({ path: 'user://capture.png' }),
  sleep: async () => {},
  ...overrides,
});
const baseParams = overrides => ({
  launch: { mode: 'already_running' },
  startup_timeout_ms: 500,
  phases: [{ name: 'check', assertions: [
    { type: 'node_exists', node_path: '/Main/Player' },
    { type: 'node_not_exists', node_path: '/Main/Ghost' },
  ] }],
  ...overrides,
});

// (1) Error snapshot during the assertion phase: every assertion is an
// infrastructure error, not a pass (including node_not_exists).
calls.length = 0;
{
  let sceneCalls = 0;
  const broken = makeAdapter({ runtimeScene: async () => (++sceneCalls === 1
    ? { structure: { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D' }] } }
    : { error: 'Runtime inspection unavailable' }) });
  const out = await runPlaytest(baseParams({}), broken);
  assert.equal(out.passed, false);
  const phase = out.phases[0];
  assert.equal(phase.status, 'infrastructure_error');
  assert.equal(phase.assertions.length, 2);
  for (const assertion of phase.assertions) assert.equal(assertion.status, 'infrastructure_error');
}

// (2) node_not_exists against an unavailable or truncated snapshot must be an
// infrastructure error, never a pass.
calls.length = 0;
for (const badSnapshot of [
  { error: 'bridge gone' },
  { truncated: true, structure: { name: 'Main', children: [] } },
  { scan_truncated: true, structure: { name: 'Main', children: [] } },
  { structure: { name: 'Main', truncated: true, children: [] } },
]) {
  let sceneCalls = 0;
  const bad = makeAdapter({ runtimeScene: async () => (++sceneCalls === 1
    ? { structure: { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D' }] } }
    : badSnapshot) });
  const out = await runPlaytest(baseParams({ phases: [{ name: 'check', assertions: [{ type: 'node_not_exists', node_path: '/Main/Ghost' }] }] }), bad);
  assert.equal(out.passed, false, `snapshot ${JSON.stringify(badSnapshot)} must not pass`);
  assert.equal(out.phases[0].assertions[0].status, 'infrastructure_error');
}

// (3) Thrown runtimeScene with stop_after: run still stops and reports cleanup.
calls.length = 0;
{
  let sceneCalls = 0;
  const throwing = makeAdapter({ runtimeScene: async () => {
    sceneCalls += 1;
    if (sceneCalls === 1) return { structure: { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D' }] } };
    throw new Error('connection lost');
  } });
  const out = await runPlaytest(baseParams({ stop_after: true }), throwing);
  assert.equal(out.passed, false);
  assert.equal(out.phases[0].status, 'infrastructure_error');
  assert.ok(calls.includes('stop'), 'stop must still run');
  assert.deepEqual(out.cleanup, { stopped: true });
}

// (4) A throw outside the handled phase logic still honors stop_after, then
// rethrows the original error.
calls.length = 0;
{
  const launchFails = makeAdapter({ launch: async () => { throw new Error('launch boom'); } });
  const err = await runPlaytest(baseParams({ launch: { mode: 'main' }, stop_after: true }), launchFails).then(() => null, e => e);
  assert.ok(err instanceof Error);
  assert.match(err.message, /launch boom/);
  assert.ok(calls.includes('stop'), 'stop must run on the throw path');
}

// (5) Cleanup failure forces passed=false.
calls.length = 0;
{
  const stopFails = makeAdapter({ stop: async () => ({ error: 'stop failed' }) });
  const out = await runPlaytest(baseParams({ stop_after: true }), stopFails);
  assert.equal(out.passed, false, 'cleanup error must force passed=false');
  assert.deepEqual(out.cleanup, { error: 'stop failed' });
}

// (6) stop_after false: cleanup skipped, phases pass normally.
calls.length = 0;
{
  const ok = makeAdapter({});
  const out = await runPlaytest(baseParams({}), ok);
  assert.equal(out.passed, true);
  assert.deepEqual(out.cleanup, { skipped: true });
  assert.ok(!calls.includes('stop'));
}
console.log('playtest tool tests passed');
