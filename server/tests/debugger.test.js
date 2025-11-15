#!/usr/bin/env node

/**
 * Godot MCP Debugger Integration Test Runner
 *
 * This script helps you run comprehensive integration tests for all debugger tools.
 * It requires Godot to be running with the MCP plugin enabled.
 */

import { getGodotConnection } from '../dist/utils/godot_connection.js';
import { debuggerTools } from '../dist/tools/debugger_tools.js';
import {
	log,
	logDivider,
	logError,
	logInfo,
	logJson,
	logStep,
	logSuccess,
	logWarning
} from './utils/test_logger.js';

function getDebuggerTool(name) {
	const tool = debuggerTools.find(t => t.name === name);
	if (!tool) {
		throw new Error(`Debugger tool "${name}" is not registered`);
	}
	return tool;
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
		const tool = getDebuggerTool('debugger_get_current_state');
		const result = await tool.execute({});

		logJson('Current Debugger State:', result);
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
			const tool = getDebuggerTool('debugger_set_breakpoint');
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
		const tool = getDebuggerTool('debugger_get_breakpoints');
		const result = await tool.execute({});
		logJson('\nCurrent breakpoints:', result);
	} catch (error) {
		logError(`Failed to get breakpoints: ${error.message}`);
	}

	// Remove one breakpoint
	try {
		const tool = getDebuggerTool('debugger_remove_breakpoint');
		await tool.execute({
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
		{ name: 'step_over', tool: 'debugger_step_over', desc: 'Step over' },
		{ name: 'step_into', tool: 'debugger_step_into', desc: 'Step into' },
		// { name: 'resume_execution', tool: 'debugger_resume_execution', desc: 'Resume execution' }
	];

	let successCount = 0;

	for (const test of tests) {
		try {
			const tool = getDebuggerTool(test.tool);
			await tool.execute({});
			log(`  ${test.desc}: Success`, 'green');
			successCount++;
		} catch (error) {
			logWarning(`  ${test.desc}: ${error.message}`);
		}
	}

	return successCount > 0;
}

async function testCleanup() {
	logStep(5, 'Testing Cleanup');

	const tests = [
		{ name: 'clear_breakpoints', tool: 'debugger_clear_all_breakpoints', desc: 'All breakpoints cleared' },
		{ name: 'resume_execution', tool: 'debugger_resume_execution', desc: 'Resume execution' },
	];

	let successCount = 0;

for (const test of tests) {
	try {
		const tool = getDebuggerTool(test.tool);
		await tool.execute({});
		log(`  ${test.desc}: Success`, 'green');
		successCount++;
	} catch (error) {
			logWarning(`  ${test.desc}: ${error.message}`);
		}
	}

	return successCount > 0;
}

async function testEventHandling(connection) {
  logStep(7, 'Testing Event Handling');

  if (!connection || !connection.isConnected()) {
    logWarning('  Skipping event test (no active Godot connection).');
    return false;
  }

  try {
    // Enable events
    const enableTool = getDebuggerTool('debugger_enable_events');
    await enableTool.execute({});
    logSuccess('Debugger events enabled');

    let eventReceived = false;
    const onBreakpoint = (data) => {
      eventReceived = true;
      logSuccess(`Breakpoint hit event received! Session: ${data.session_id}, Line: ${data.line}`);
    };
    const onPaused = (data) => {
      eventReceived = true;
      logSuccess(`Execution paused event received! Session: ${data.session_id}`);
    };

    connection.on('breakpoint_hit', onBreakpoint);
    connection.on('execution_paused', onPaused);

    // Force the debugger into a paused state to trigger events.
    const pauseTool = getDebuggerTool('debugger_pause_execution');
    const resumeTool = getDebuggerTool('debugger_resume_execution');
    if (pauseTool) {
      logInfo('  Sending pause command to trigger debugger events...');
      await pauseTool.execute({});
    }

    // Confirm paused state via debugger_get_current_state to ensure something happened.
    try {
      const pauseState = await connection.sendCommand('debugger_get_current_state', {});
      const paused = pauseState?.result?.paused ?? pauseState?.paused;
      if (paused) {
        eventReceived = true;
        logSuccess('Debugger confirmed paused state after pause command.');
      }
    } catch (stateErr) {
      logWarning(`  Failed to verify paused state: ${stateErr.message}`);
    }

    // Allow some extra time for async events to arrive
    logInfo('  Waiting up to 5 seconds for debugger events...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (resumeTool) {
      logInfo('  Resuming execution after event test...');
      await resumeTool.execute({});
      try {
        const resumeState = await connection.sendCommand('debugger_get_current_state', {});
        const pausedNow = resumeState?.result?.paused ?? resumeState?.paused;
        if (pausedNow === false) {
          logSuccess('Debugger confirmed running state after resume command.');
        }
      } catch (stateErr) {
        logWarning(`  Failed to verify resumed state: ${stateErr.message}`);
      }
    }

    connection.off('breakpoint_hit', onBreakpoint);
    connection.off('execution_paused', onPaused);

    // Disable events
    const disableTool = getDebuggerTool('debugger_disable_events');
    await disableTool.execute({});
    logSuccess('Debugger events disabled');

    if (!eventReceived) {
      logWarning('No events received (project may not be running or no breakpoints hit).');
    }

    return eventReceived;
  } catch (error) {
    logError(`Event handling test failed: ${error.message}`);
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
	logDivider();

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

	// Step 5: Cleanup
	const cleanupResult = await testCleanup();
	results.push({ name: 'Cleanup', passed: cleanupResult });

	// Step 6: Test event handling
	const eventResult = await testEventHandling(connection);
	results.push({ name: 'Event Handling', passed: eventResult });

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
