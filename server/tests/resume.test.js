#!/usr/bin/env node

/**
 * Simple test for debugger_resume_execution command
 */

import { getGodotConnection } from '../dist/utils/godot_connection.js';
import { debuggerTools } from '../dist/tools/debugger_tools.js';

async function testResumeExecution() {
  console.log('Testing debugger_resume_execution...');

  try {
    // Connect to Godot
    const connection = getGodotConnection();
    await connection.connect();

    if (!connection.isConnected()) {
      console.error('✗ Could not connect to Godot WebSocket server');
      console.error('Make sure: 1. Godot editor is running');
      console.error('          2. Godot MCP plugin is enabled');
      console.error('          3. WebSocket server is running on port 9080');
      return false;
    }

    console.log('✓ Connected to Godot WebSocket server');

    // Test resume execution command
    console.log('Sending debugger_resume_execution command...');
    const tool = debuggerTools.find(t => t.name === 'debugger_resume_execution');
    const result = await tool.execute({});

    console.log('✓ Resume execution command sent successfully');
    console.log('Result:', JSON.stringify(result, null, 2));

    // Disconnect
    connection.disconnect();
    console.log('✓ Connection closed');
    return true;

  } catch (error) {
    console.error('✗ Test failed:', error.message);
    return false;
  }
}

// Run the test
testResumeExecution().then(success => {
  if (success) {
    console.log('✓ Test completed successfully');
    process.exit(0);
  } else {
    console.error('✗ Test failed');
    process.exit(1);
  }
}).catch(error => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});