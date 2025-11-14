#!/usr/bin/env node

import { getGodotConnection } from '../dist/utils/godot_connection.js';

function log(message, prefix = '[stack-frames-test]') {
  console.log(`${prefix} ${message}`);
}

function fail(message, diagnostics) {
  log(message, '[stack-frames-test][error]');
  if (diagnostics) {
    log(`Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
  }
  process.exit(1);
}

async function main() {
  const godot = getGodotConnection();
  log('Connecting to Godot MCP server ...');
  await godot.connect();
  if (!godot.isConnected()) {
    fail('Failed to connect to Godot WebSocket server. Is the editor running with the MCP plugin enabled?');
  }

  log('Requesting current debugger state ...');
  const state = await godot.sendCommand('debugger_get_current_state', {});
  const activeSessions = Array.isArray(state.active_sessions) ? state.active_sessions : [];
  if (activeSessions.length === 0) {
    fail('No active debugger sessions. Run the project and ensure the debugger is attached before running this test.');
  }
  if (!state.paused) {
    fail('Debugger is not paused. Trigger a breakpoint or error so the stack frames are populated.');
  }

  const sessionId = state.current_session_id ?? activeSessions[0];
  log(`Capturing stack frames for session ${sessionId} ...`);
  const capture = await godot.sendCommand('get_stack_frames_panel', { session_id: sessionId });
  const panel = capture.stack_frames_panel ?? {};
  const frames = Array.isArray(panel.frames) ? panel.frames : [];
  const diagnostics = panel.diagnostics ?? {};

  if (frames.length === 0) {
    fail('Stack frames are empty.', diagnostics);
  }

  log(`Stack frames capture succeeded with ${frames.length} frame(s).`);
  if (diagnostics) {
    log(`Diagnostics: ${JSON.stringify(diagnostics, null, 2)}`);
  }

  const preview = frames.slice(0, 5).map((frame, index) => {
    const idx = typeof frame.index === 'number' ? frame.index : index;
    const fn = typeof frame.function === 'string' && frame.function.length > 0 ? frame.function : '(anonymous)';
    const script = typeof frame.script === 'string' ? frame.script : (frame.file ?? '');
    const line = typeof frame.line === 'number' ? frame.line : null;
    const location = script && line !== null ? `${script}:${line}` : (script || 'location unavailable');
    return `#${idx} ${fn} — ${location}`;
  }).join("`n");

  log('Preview:\n' + preview);
  log('Test passed! Stack frames command returned data.');
  process.exit(0);
}

main().catch(error => {
  fail(`Unhandled error: ${error.message}`);
});
