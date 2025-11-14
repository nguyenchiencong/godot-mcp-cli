#!/usr/bin/env node

import { getGodotConnection } from '../dist/utils/godot_connection.js';

function log(message, prefix = '[stack-trace-test]') {
  console.log(`${prefix} ${message}`);
}

function fail(message, diagnostics) {
  log(message, '[stack-trace-test][error]');
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
    fail('Debugger is not paused. Trigger a breakpoint or error so the stack trace is populated.');
  }

  const sessionId = state.current_session_id ?? activeSessions[0];
  log(`Capturing stack trace panel for session ${sessionId} ...`);
  const capture = await godot.sendCommand('get_stack_trace_panel', { session_id: sessionId });
  const panel = capture.stack_trace_panel ?? {};
  const frames = Array.isArray(panel.frames) ? panel.frames : [];
  const lines = Array.isArray(panel.lines) ? panel.lines : [];

  if (frames.length === 0 && lines.length === 0) {
    fail('Stack trace capture returned no frames or lines.', panel.diagnostics ?? capture);
  }

  log(`Stack trace capture succeeded with ${frames.length} frame(s) and ${lines.length} line(s).`);
  if (panel.diagnostics) {
    log(`Diagnostics: ${JSON.stringify(panel.diagnostics, null, 2)}`);
  }

  log('Test passed! Stack trace panel returned data.');
  process.exit(0);
}

main().catch(error => {
  fail(`Unhandled error: ${error.message}`);
});