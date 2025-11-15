#!/usr/bin/env node

/**
 * Simple test for debugger_get_call_stack command
 *
 * Prerequisites:
 *  1. Godot editor is running with the MCP plugin enabled
 *  2. Project is running and paused at a breakpoint (or break on error triggered)
 */

import { getGodotConnection } from '../dist/utils/godot_connection.js';
import {
	log,
	logError,
	logJson,
	logStep,
	logSuccess
} from './utils/test_logger.js';

async function testCallStack() {
  logStep('Connecting to Godot');
  const connection = getGodotConnection();
  await connection.connect();

  if (!connection.isConnected()) {
    throw new Error('Failed to connect to Godot WebSocket server (is the MCP server running on port 9080?)');
  }
  logSuccess('Connected to Godot');

  try {
    logStep('Checking debugger state');
    const stateResponse = await connection.sendCommand('debugger_get_current_state', {});
    const state = stateResponse && typeof stateResponse === 'object' && stateResponse.result
      ? stateResponse.result
      : stateResponse;
    logJson('Debugger state:', state);

    const activeSessions = state.active_sessions || [];
    if (activeSessions.length === 0) {
      throw new Error('No active debugger sessions. Start the project and ensure it is paused.');
    }
    if (!state.paused) {
      throw new Error('Debugger session is not paused. Hit a breakpoint before running this test.');
    }

    const sessionId = activeSessions[0];
    logStep(`Requesting call stack for session ${sessionId}`);
    const stack = await connection.sendCommand('debugger_get_call_stack', { session_id: sessionId });

    logJson('Call stack result:', stack);
    logSuccess('debugger_get_call_stack succeeded');
  } finally {
    logStep('Cleaning up');
    connection.disconnect();
    logSuccess('Connection closed');
  }
}

testCallStack()
  .then(() => {
    log('\nAll checks passed', 'green');
    process.exit(0);
  })
  .catch(error => {
    logError(`\n✗ Test failed: ${error.message}`);
    process.exit(1);
  });
