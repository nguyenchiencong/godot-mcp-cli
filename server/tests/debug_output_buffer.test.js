#!/usr/bin/env node
import assert from 'node:assert/strict';
import { DebugOutputBuffer } from '../dist/utils/debug_output_buffer.js';

const buffer = new DebugOutputBuffer(2, 20);
buffer.appendFrame({ reset: true, lines: ['one', 'two', 'three'] });
let page = buffer.snapshot();
assert.deepEqual(page.lines, ['two', 'three']);
assert.equal(page.truncated, false);
assert.equal(page.dropped_lines, 1);
assert.equal(page.reset, true);
const cursor = page.next_cursor;
buffer.append('four');
page = buffer.read(cursor);
assert.deepEqual(page.lines, ['four']);
assert.equal(page.next_cursor, 4);
assert.equal(page.truncated, false);
const old = buffer.read(1);
assert.equal(old.truncated, true);

// clear() must zero the drop counter and start a fresh stream for readers.
buffer.clear();
page = buffer.snapshot();
assert.equal(page.dropped_lines, 0);
assert.deepEqual(page.lines, []);
assert.equal(page.reset, true);
const afterClearCursor = page.next_cursor;
buffer.append('fresh');
page = buffer.read(afterClearCursor);
assert.deepEqual(page.lines, ['fresh']);
assert.equal(page.dropped_lines, 0);
assert.equal(page.truncated, false);
assert.equal(page.reset, false);
console.log('debug output buffer tests passed');
