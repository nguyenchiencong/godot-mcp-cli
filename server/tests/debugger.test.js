#!/usr/bin/env node

/**
 * Godot MCP Debugger Integration Test Runner
 *
 * This script helps you run comprehensive integration tests for all debugger tools.
 * It requires Godot to be running with the MCP plugin enabled.
 */

import { getGodotConnection } from '../dist/utils/godot_connection.js';
import { debuggerTools } from '../dist/tools/debugger_tools.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, description) {
  log(`\n🔧 Step ${step}: ${description}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

async function checkGodotConnection() {
  logStep(1, 'Checking Godot Connection');

  try {
    const connection = getGodotConnection();
    await connection.connect();

    if (!connection.isConnected()) {
      logError('Could not connect to Godot WebSocket server');
      logInfo('Make sure:');
      logInfo('  1. Godot editor is running');
      logInfo('  2. Godot MCP plugin is enabled');
      logInfo('  3. WebSocket server is running on port 9080');
      return null;
    }

    logSuccess('Connected to Godot WebSocket server');
    return connection;
  } catch (error) {
    logError(`Connection failed: ${error.message}`);
    logInfo('Please start Godot with the MCP plugin enabled');
    return null;
  }
}

async function testDebuggerState() {
  logStep(2, 'Getting Debugger State');

  try {
    const tool = debuggerTools.find(t => t.name === 'debugger_get_current_state');
    const result = await tool.execute({});

    log('Current Debugger State:', 'bright');
    log(result);
    return true;
  } catch (error) {
    logError(`Failed to get debugger state: ${error.message}`);
    return false;
  }
}

async function testBreakpointManagement() {
  logStep(3, 'Testing Breakpoint Management');

  const testScriptPath = 'res://test_debugger.gd';
  const testLines = [10, 13, 20, 27, 36];
  let successCount = 0;

  // Set breakpoints
  log('Setting breakpoints:', 'bright');
  for (const line of testLines) {
    try {
      const tool = debuggerTools.find(t => t.name === 'debugger_set_breakpoint');
      const result = await tool.execute({
        script_path: testScriptPath,
        line: line
      });
      log(`  Set breakpoint at line ${line}`, 'green');
      successCount++;
    } catch (error) {
      logWarning(`  Failed to set breakpoint at line ${line}: ${error.message}`);
    }
  }

  // Get current breakpoints
  try {
    const tool = debuggerTools.find(t => t.name === 'debugger_get_breakpoints');
    const result = await tool.execute({});
    log('\nCurrent breakpoints:', 'bright');
    log(result);
  } catch (error) {
    logError(`Failed to get breakpoints: ${error.message}`);
  }

  // Remove one breakpoint
  try {
    const tool = debuggerTools.find(t => t.name === 'debugger_remove_breakpoint');
    const result = await tool.execute({
      script_path: testScriptPath,
      line: 13
    });
    logSuccess(`Removed breakpoint at line 13`);
  } catch (error) {
    logWarning(`Failed to remove breakpoint: ${error.message}`);
  }

  return successCount > 0;
}

async function testExecutionControl() {
  logStep(4, 'Testing Execution Control');

  const tests = [
    { name: 'pause_execution', tool: 'debugger_pause_execution', desc: 'Pause execution' },
    { name: 'resume_execution', tool: 'debugger_resume_execution', desc: 'Resume execution' },
    { name: 'step_over', tool: 'debugger_step_over', desc: 'Step over' },
    { name: 'step_into', tool: 'debugger_step_into', desc: 'Step into' }
  ];

  let successCount = 0;

  for (const test of tests) {
    try {
      const tool = debuggerTools.find(t => t.name === test.tool);
      const result = await tool.execute({});
      log(`  ${test.desc}: Success`, 'green');
      successCount++;

      // Add 3-second wait after pause_execution
      if (test.name === 'pause_execution') {
        logInfo('  Waiting 3 seconds before resuming execution...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      logWarning(`  ${test.desc}: ${error.message}`);
    }
  }

  return successCount > 0;
}

async function testCallStack() {
  logStep(5, 'Testing Call Stack Inspection');

  try {
    const tool = debuggerTools.find(t => t.name === 'debugger_get_call_stack');
    const result = await tool.execute({});
    log('Call stack result:', 'bright');
    log(result);
    return true;
  } catch (error) {
    logWarning(`Call stack test: ${error.message}`);
    return false;
  }
}

async function testEventHandling(connection) {
  logStep(6, 'Testing Event Handling');

  try {
    // Enable events
    const enableTool = debuggerTools.find(t => t.name === 'debugger_enable_events');
    const enableResult = await enableTool.execute({});
    logSuccess('Debugger events enabled');

    // Set up event listener
    let eventReceived = false;
    connection.on('breakpoint_hit', (data) => {
      eventReceived = true;
      logSuccess(`Breakpoint hit event received! Session: ${data.session_id}, Line: ${data.line}`);
    });

    connection.on('execution_paused', (data) => {
      eventReceived = true;
      logSuccess(`Execution paused event received! Session: ${data.session_id}`);
    });

    logInfo('Listening for debugger events...');
    logInfo('To trigger events:');
    logInfo('  1. Make sure the test project is running in Godot (F6)');
    logInfo('  2. Use SPACE key to pause');
    logInfo('  3. Use T key to trigger test function');
    logInfo('  4. Walk through breakpoints in your code');

    // Wait for events
    await new Promise(resolve => setTimeout(resolve, 10000));

    if (!eventReceived) {
      logWarning('No events received (project may not be running)');
    }

    // Disable events
    const disableTool = debuggerTools.find(t => t.name === 'debugger_disable_events');
    const disableResult = await disableTool.execute({});
    logSuccess('Debugger events disabled');

    return eventReceived;
  } catch (error) {
    logError(`Event handling test failed: ${error.message}`);
    return false;
  }
}

async function testCleanup() {
  logStep(7, 'Testing Cleanup');

  try {
    const tool = debuggerTools.find(t => t.name === 'debugger_clear_all_breakpoints');
    const result = await tool.execute({});
    logSuccess('All breakpoints cleared');
    log(result);
    return true;
  } catch (error) {
    logError(`Cleanup failed: ${error.message}`);
    return false;
  }
}

async function printFinalSummary(results) {
  log('\n🎯 === FINAL TEST SUMMARY ===', 'bright');

  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;

  log(`Total Tests: ${totalTests}`);
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');

  if (failedTests > 0) {
    log('\nFailed Tests:', 'bright');
    results.filter(r => !r.passed).forEach(result => {
      log(`  ❌ ${result.name}: ${result.error}`, 'red');
    });
  }

  log('\n📝 Next Steps:', 'bright');
  log('1. Open test_main_scene.tscn in Godot');
  log('2. Run the project (F6)');
  log('3. Use keyboard controls:');
  log('   - SPACE: Manual pause point');
  log('   - R: Reset counter');
  log('   - T: Trigger test function');
  log('4. Re-run this test to see full debugger integration');

  const successRate = Math.round((passedTests / totalTests) * 100);
  log(`\n🏆 Overall Success Rate: ${successRate}%`,
    successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');
}

async function main() {
  log('🎮 Godot MCP Debugger Integration Test Runner', 'bright');
  log('=' .repeat(50), 'cyan');

  const results = [];

  // Step 1: Check connection
  const connection = await checkGodotConnection();
  if (!connection) {
    process.exit(1);
  }

  // Step 2: Test debugger state
  const stateResult = await testDebuggerState();
  results.push({ name: 'Debugger State', passed: stateResult });

  // Step 3: Test breakpoint management
  const breakpointResult = await testBreakpointManagement();
  results.push({ name: 'Breakpoint Management', passed: breakpointResult });

  // Step 4: Test execution control
  const executionResult = await testExecutionControl();
  results.push({ name: 'Execution Control', passed: executionResult });

  // Step 5: Test call stack
  const callStackResult = await testCallStack();
  results.push({ name: 'Call Stack Inspection', passed: callStackResult });

  // Step 6: Test event handling
  const eventResult = await testEventHandling(connection);
  results.push({ name: 'Event Handling', passed: eventResult });

  // Step 7: Cleanup
  const cleanupResult = await testCleanup();
  results.push({ name: 'Cleanup', passed: cleanupResult });

  // Final summary
  await printFinalSummary(results);

  // Disconnect
  connection.disconnect();

  // Exit with appropriate code
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  log('Godot MCP Debugger Integration Test Runner', 'bright');
  log('');
  log('Usage: node debugger.test.js [options]', 'cyan');
  log('');
  log('Options:');
  log('  --help, -h     Show this help message');
  log('  --verbose, -v  Enable verbose logging');
  log('');
  log('Prerequisites:');
  log('  1. Godot editor must be running');
  log('  2. Godot MCP plugin must be enabled');
  log('  3. WebSocket server must be running on port 9080');
  log('  4. Test project (test_main_scene.tscn) should be available');
  log('');
  process.exit(0);
}

if (args.includes('--verbose') || args.includes('-v')) {
  process.env.DEBUG = 'true';
}

// Run the tests
main().catch(error => {
  logError(`Test runner failed: ${error.message}`);
  process.exit(1);
});
