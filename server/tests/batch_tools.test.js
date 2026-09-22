#!/usr/bin/env node
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createBatchTool, BATCH_MAX_ARGUMENT_BYTES } from '../dist/tools/batch_tools.js';

const parseReport = error => JSON.parse(error.message.slice(error.message.indexOf('report: ') + 'report: '.length));

const calls = [];
const fake = (name, execute) => ({ name, description: name, parameters: z.object({ value: z.number().optional() }), execute });
const tool = createBatchTool([
  fake('first', async ({ value }) => { calls.push(`first:${value}`); return 'ok'; }),
  fake('second', async ({ value }) => { calls.push(`second:${value}`); throw new Error(`bad:${value}`); }),
  fake('third', async () => { calls.push('third'); return 'ok'; }),
]);

// Failed batch (no continue_on_error): throws, embeds the compact report, later ops skipped.
let threw = await tool.execute({ operations: [{ tool: 'first', arguments: { value: 1 } }, { tool: 'second', arguments: { value: 2 } }, { tool: 'third' }] }).then(() => null, error => error);
assert.ok(threw instanceof Error, 'failed batch must throw');
let report = parseReport(threw);
assert.deepEqual(calls, ['first:1', 'second:2']);
assert.equal(report.atomic, false);
assert.equal(report.success, false);
assert.equal(report.operations[0].status, 'success');
assert.equal(report.operations[1].status, 'failed');
assert.equal(report.operations[2].status, 'skipped');

// continue_on_error: keeps executing after a failure, but the batch still throws.
calls.length = 0;
threw = await tool.execute({ continue_on_error: true, operations: [{ tool: 'first', arguments: { value: 1 } }, { tool: 'second', arguments: { value: 2 } }, { tool: 'third' }] }).then(() => null, error => error);
assert.ok(threw instanceof Error, 'failed batch with continue_on_error must still throw');
report = parseReport(threw);
assert.deepEqual(calls, ['first:1', 'second:2', 'third']);
assert.equal(report.operations[1].status, 'failed');
assert.equal(report.operations[2].status, 'success');

// All-success batch returns the report normally.
calls.length = 0;
report = JSON.parse(await tool.execute({ operations: [{ tool: 'first', arguments: { value: 1 } }, { tool: 'third' }] }));
assert.deepEqual(calls, ['first:1', 'third']);
assert.equal(report.success, true);

// Argument byte cap rejection.
const bigValue = 'x'.repeat(BATCH_MAX_ARGUMENT_BYTES);
threw = await tool.execute({ operations: [{ id: bigValue, tool: 'first', arguments: {} }] }).then(() => null, error => error);
assert.ok(threw instanceof Error);
assert.match(threw.message, /bytes; maximum is/);

// Excluded tools are rejected: dry_run reports invalid without throwing...
calls.length = 0;
report = JSON.parse(await tool.execute({ dry_run: true, operations: [{ tool: 'batch_operations', arguments: {} }, { tool: 'playtest', arguments: {} }] }));
assert.deepEqual(calls, []);
assert.equal(report.operations[0].status, 'invalid');
assert.equal(report.operations[1].status, 'invalid');
assert.equal(report.success, false);

// ...while a real batch that includes an excluded tool throws.
threw = await tool.execute({ operations: [{ tool: 'playtest', arguments: {} }] }).then(() => null, error => error);
assert.ok(threw instanceof Error, 'excluded tool in a real batch must throw');
report = parseReport(threw);
assert.equal(report.operations[0].status, 'failed');
assert.match(report.operations[0].error, /not allowed in a batch/);

// dry_run schema validation: expected output, not a tool error.
calls.length = 0;
report = JSON.parse(await tool.execute({ dry_run: true, operations: [{ tool: 'first', arguments: { value: 1 } }, { tool: 'first', arguments: { value: 'wrong' } }] }));
assert.deepEqual(calls, []);
assert.equal(report.operations[0].status, 'valid');
assert.equal(report.operations[1].status, 'invalid');
console.log('batch tool tests passed');
