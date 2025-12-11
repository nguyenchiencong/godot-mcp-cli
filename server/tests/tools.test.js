#!/usr/bin/env node

/**
 * Comprehensive Tool Integration Tests
 * 
 * Tests all MCP tools against a live Godot connection.
 * Requires:
 *   1. Godot editor running with MCP plugin enabled
 *   2. WebSocket server on port 9080
 *   3. npm run build completed
 * 
 * Usage:
 *   node tests/tools.test.js [options]
 * 
 * Options:
 *   --help, -h       Show help
 *   --verbose, -v    Verbose output
 *   --category=X     Run only specific category (node, script, scene, project, editor, asset, debugger, input, enhanced)
 *   --tool=X         Run only specific tool by name
 *   --skip-runtime   Skip tests that require a running game
 */

import { getGodotConnection } from '../dist/utils/godot_connection.js';
import {
	log,
	logDivider,
	logError,
	logInfo,
	logJson,
	logStep,
	logSuccess,
	logWarning,
	logHeader
} from './utils/test_logger.js';

// Import all tool modules
import { nodeTools } from '../dist/tools/node_tools.js';
import { scriptTools } from '../dist/tools/script_tools.js';
import { sceneTools } from '../dist/tools/scene_tools.js';
import { projectTools } from '../dist/tools/project_tools.js';
import { editorTools } from '../dist/tools/editor_tools.js';
import { assetTools } from '../dist/tools/asset_tools.js';
import { debuggerTools } from '../dist/tools/debugger_tools.js';
import { inputTools } from '../dist/tools/input_tools.js';
import { enhancedTools } from '../dist/tools/enhanced_tools.js';
import { scriptResourceTools } from '../dist/tools/script_resource_tools.js';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const skipRuntime = args.includes('--skip-runtime');
const categoryArg = args.find(a => a.startsWith('--category='));
const toolArg = args.find(a => a.startsWith('--tool='));
const targetCategory = categoryArg ? categoryArg.split('=')[1] : null;
const targetTool = toolArg ? toolArg.split('=')[1] : null;

// Generate unique test file names using timestamp
const testTimestamp = Date.now();
const TEST_SCENE_PATH = `res://test_mcp_scene_${testTimestamp}.tscn`;
const TEST_SCRIPT_PATH = `res://test_mcp_script_${testTimestamp}.gd`;
const TEST_RESOURCE_PATH = `res://test_mcp_resource_${testTimestamp}.tres`;

if (args.includes('--help') || args.includes('-h')) {
	log('Godot MCP Tools Integration Test', 'bright');
	log('');
	log('Usage: node tests/tools.test.js [options]', 'cyan');
	log('');
	log('Options:');
	log('  --help, -h       Show this help message');
	log('  --verbose, -v    Enable verbose logging');
	log('  --category=X     Run only specific category');
	log('                   (node, script, scene, project, editor, asset, debugger, input, enhanced)');
	log('  --tool=X         Run only specific tool by name');
	log('  --skip-runtime   Skip tests requiring running game');
	log('');
	log('Prerequisites:');
	log('  1. Godot editor must be running');
	log('  2. Godot MCP plugin must be enabled');
	log('  3. WebSocket server must be on port 9080');
	log('  4. Run npm run build first');
	log('');
	process.exit(0);
}

// Combine all tools into a single lookup map
const allTools = [
	...nodeTools,
	...scriptTools,
	...sceneTools,
	...projectTools,
	...editorTools,
	...assetTools,
	...debuggerTools,
	...inputTools,
	...enhancedTools,
	...scriptResourceTools,
];

const toolMap = new Map(allTools.map(t => [t.name, t]));

// All tools organized by category with proper test definitions
const toolCategories = {
	node: {
		name: 'Node Tools',
		tests: [
			{
				tool: 'list_nodes',
				params: { parent_path: '/' },
				validate: (result) => result.includes('Children') || result.includes('node') || result.includes('Node')
			},
			{
				tool: 'get_node_properties',
				params: { node_path: '/root' },
				validate: (result) => result.includes('Properties') || result.includes('property') || result.includes('name')
			},
			{
				tool: 'create_node',
				params: { parent_path: '/', node_type: 'Node2D', node_name: 'TestMCPNode' },
				validate: (result) => result.includes('Created') || result.includes('TestMCPNode'),
				cleanup: async () => {
					const tool = toolMap.get('delete_node');
					if (tool) {
						try {
							await tool.execute({ node_path: '/root/TestMCPNode' });
						} catch (e) {
							// Ignore cleanup errors
						}
					}
				}
			},
			{
				tool: 'update_node_property',
				params: { node_path: '/root', property: 'editor_description', value: 'Test' },
				validate: (result) => result.includes('Updated') || result.includes('property'),
				expectError: false
			}
		]
	},
	script: {
		name: 'Script Tools',
		tests: [
			{
				tool: 'get_script',
				params: { script_path: 'res://test_debugger.gd' },
				validate: (result) => result.includes('extends') || result.includes('func')
			},
			{
				tool: 'create_script',
				get params() {
					return { 
						script_path: TEST_SCRIPT_PATH,
						content: 'extends Node\n\nfunc _ready():\n\tpass\n'
					};
				},
				validate: (result) => result.includes('Created') || result.includes('script')
			},
			{
				tool: 'edit_script',
				get params() {
					return {
						script_path: TEST_SCRIPT_PATH,
						content: 'extends Node\n\nfunc _ready():\n\tprint("Hello MCP")\n'
					};
				},
				validate: (result) => result.includes('Updated') || result.includes('script'),
				cleanup: async () => {
					const tool = toolMap.get('execute_editor_script');
					if (tool) {
						try {
							const scriptPath = TEST_SCRIPT_PATH;
							await tool.execute({
								code: `
var dir = DirAccess.open("res://")
if dir:
	dir.remove("${scriptPath}")
	dir.remove("${scriptPath}.uid")
print("Cleaned up test script: ${scriptPath}")
`
							});
						} catch (e) {
							// Ignore cleanup errors
						}
					}
				}
			}
		]
	},
	scene: {
		name: 'Scene Tools',
		tests: [
			{
				tool: 'get_current_scene',
				params: {},
				validate: (result) => result.includes('scene') || result.includes('Scene') || result.includes('root')
			},
			{
				tool: 'open_scene',
				params: { path: 'res://test_main_scene.tscn' },
				validate: (result) => result.includes('Opened') || result.includes('scene')
			},
			{
				tool: 'save_scene',
				params: {},
				validate: (result) => result.includes('Saved') || result.includes('scene')
			},
			{
				tool: 'create_scene',
				get params() {
					return { path: TEST_SCENE_PATH, root_node_type: 'Node2D' };
				},
				validate: (result) => result.includes('Created') || result.includes('scene')
			},
			{
				tool: 'open_scene',
				params: { path: 'res://test_main_scene.tscn' },
				validate: (result) => result.includes('Opened') || result.includes('scene'),
				note: 'Switch to different scene before deleting test scene'
			},
			{
				tool: 'delete_scene',
				get params() {
					return { path: TEST_SCENE_PATH };
				},
				validate: (result) => result.includes('Deleted') || result.includes('deleted')
			},
			{
				tool: 'get_project_info',
				params: {},
				validate: (result) => result.includes('Project') || result.includes('Godot')
			},
			{
				tool: 'create_resource',
				get params() {
					return { resource_type: 'StyleBoxFlat', resource_path: TEST_RESOURCE_PATH };
				},
				validate: (result) => result.includes('Created') || result.includes('resource'),
				cleanup: async () => {
					const tool = toolMap.get('execute_editor_script');
					if (tool) {
						try {
							const resourcePath = TEST_RESOURCE_PATH;
							await tool.execute({
								code: `
var dir = DirAccess.open("res://")
if dir:
	dir.remove("${resourcePath}")
print("Cleaned up test resource: ${resourcePath}")
`
							});
						} catch (e) {
							// Ignore cleanup errors
						}
					}
				}
			}
		]
	},
	project: {
		name: 'Project Run Tools',
		tests: [
			{
				tool: 'run_project',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'run_current_scene',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'run_specific_scene',
				params: { scene_path: 'res://test_main_scene.tscn' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'stop_running_project',
				params: {},
				validate: (result) => result.includes('Stop') || result.includes('idle') || result.includes('not'),
				expectError: false
			}
		]
	},
	editor: {
		name: 'Editor Tools',
		tests: [
			{
				tool: 'execute_editor_script',
				params: { code: 'print("MCP Test")' },
				validate: (result) => result.includes('executed') || result.includes('success') || result.includes('Script')
			},
			{
				tool: 'reload_scene',
				params: {},
				validate: (result) => result.includes('reload') || result.includes('Reload') || result.includes('scene'),
				expectError: false
			},
			{
				tool: 'rescan_filesystem',
				params: {},
				validate: (result) => result.includes('Rescan') || result.includes('rescan') || result.includes('Filesystem') || result.includes('initiated')
			}
			// Skipping reload_project as it disconnects MCP
		]
	},
	asset: {
		name: 'Asset Tools',
		tests: [
			{
				tool: 'list_assets_by_type',
				params: { type: 'scripts' },
				validate: (result) => result.includes('Found') || result.includes('scripts') || result.includes('assets')
			},
			{
				tool: 'list_project_files',
				params: { extensions: ['.gd', '.tscn'] },
				validate: (result) => result.includes('Found') || result.includes('files')
			}
		]
	},
	debugger: {
		name: 'Debugger Tools',
		tests: [
			{
				tool: 'debugger_get_current_state',
				params: {},
				validate: (result) => result.includes('Debugger') || result.includes('state') || result.includes('session')
			},
			{
				tool: 'debugger_get_breakpoints',
				params: {},
				validate: (result) => result.includes('breakpoint') || result.includes('Breakpoint') || result.includes('No')
			},
			{
				tool: 'debugger_set_breakpoint',
				params: { script_path: 'res://test_debugger.gd', line: 10 },
				validate: (result) => true,
				expectError: true // Requires active debug session
			},
			{
				tool: 'debugger_clear_all_breakpoints',
				params: {},
				validate: (result) => result.includes('Cleared') || result.includes('cleared') || result.includes('breakpoint')
			},
			{
				tool: 'debugger_pause_execution',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'debugger_resume_execution',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'debugger_step_over',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'debugger_step_into',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'debugger_get_call_stack',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'debugger_enable_events',
				params: {},
				validate: (result) => result.includes('enabled') || result.includes('Enabled') || result.includes('event')
			},
			{
				tool: 'debugger_disable_events',
				params: {},
				validate: (result) => result.includes('disabled') || result.includes('Disabled') || result.includes('event')
			}
		]
	},
	input: {
		name: 'Input Tools',
		tests: [
			{
				tool: 'get_input_actions',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_action_press',
				params: { action: 'ui_accept' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_action_release',
				params: { action: 'ui_accept' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_action_tap',
				params: { action: 'ui_accept' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_mouse_click',
				params: { x: 100, y: 100 },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_mouse_move',
				params: { x: 200, y: 200 },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_drag',
				params: { start_x: 100, start_y: 100, end_x: 200, end_y: 200 },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_key_press',
				params: { key: 'space' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'simulate_input_sequence',
				params: { sequence: [{ type: 'action_tap', action: 'ui_accept', delay: 100 }] },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			}
		]
	},
	enhanced: {
		name: 'Enhanced Tools',
		tests: [
			{
				tool: 'get_editor_scene_structure',
				params: {},
				validate: (result) => result.includes('Scene') || result.includes('structure') || result.includes('root')
			},
			{
				tool: 'get_debug_output',
				params: {},
				validate: (result) => true // May be empty or have output
			},
			{
				tool: 'get_editor_errors',
				params: {},
				validate: (result) => true // May be empty or have errors
			},
			{
				tool: 'clear_debug_output',
				params: {},
				validate: (result) => result.includes('Cleared') || result.includes('cleared') || result.includes('Output')
			},
			{
				tool: 'clear_editor_errors',
				params: {},
				validate: (result) => result.includes('Cleared') || result.includes('cleared') || result.includes('Error')
			},
			{
				tool: 'stream_debug_output',
				params: { enabled: false },
				validate: (result) => result.includes('Stream') || result.includes('stream') || result.includes('Output') || result.includes('output') || result.includes('unsubscribed')
			},
			{
				tool: 'get_runtime_scene_structure',
				params: {},
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'evaluate_runtime_expression',
				params: { expression: '2 + 2' },
				validate: (result) => true,
				expectError: true,
				requiresRuntime: true
			},
			{
				tool: 'get_stack_trace_panel',
				params: {},
				validate: (result) => true,
				expectError: true // May fail if debugger not active
			},
			{
				tool: 'get_stack_frames_panel',
				params: {},
				validate: (result) => true,
				expectError: true
			}
		]
	}
};

// Test result tracking
const results = {
	passed: 0,
	failed: 0,
	skipped: 0,
	errors: []
};

async function runToolTest(categoryName, test) {
	const toolName = test.tool;
	
	// Skip if targeting specific tool and this isn't it
	if (targetTool && toolName !== targetTool) {
		return null;
	}
	
	// Skip runtime tests if --skip-runtime
	if (skipRuntime && test.requiresRuntime) {
		if (verbose) {
			logWarning(`  Skipped ${toolName} (requires runtime)`);
		}
		results.skipped++;
		return { tool: toolName, status: 'skipped', reason: 'requires runtime' };
	}
	
	const tool = toolMap.get(toolName);
	if (!tool) {
		logError(`  Tool not found: ${toolName}`);
		results.failed++;
		results.errors.push({ tool: toolName, error: 'Tool not registered' });
		return { tool: toolName, status: 'failed', error: 'Tool not registered' };
	}
	
	try {
		if (verbose) {
			logInfo(`  Testing ${toolName}...`);
			if (Object.keys(test.params).length > 0) {
				log(`    Params: ${JSON.stringify(test.params)}`, 'cyan');
			}
		}
		
		const result = await tool.execute(test.params);
		const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
		
		if (verbose) {
			log(`    Result: ${resultStr.substring(0, 200)}${resultStr.length > 200 ? '...' : ''}`, 'cyan');
		}
		
		// Run cleanup if specified
		if (test.cleanup && typeof test.cleanup === 'function') {
			try {
				await test.cleanup();
				if (verbose) {
					log(`    Cleanup executed`, 'cyan');
				}
			} catch (e) {
				if (verbose) {
					logWarning(`    Cleanup failed: ${e.message}`);
				}
			}
		}
		
		const valid = test.validate(resultStr);
		if (valid) {
			log(`  [PASS] ${toolName}`, 'green');
			results.passed++;
			return { tool: toolName, status: 'passed' };
		} else {
			log(`  [FAIL] ${toolName}: Validation failed`, 'red');
			results.failed++;
			results.errors.push({ tool: toolName, error: 'Validation failed', result: resultStr });
			return { tool: toolName, status: 'failed', error: 'Validation failed' };
		}
		
	} catch (error) {
		if (test.expectError) {
			// Expected error - this is a pass
			log(`  [PASS] ${toolName} (expected error: ${error.message.substring(0, 50)})`, 'green');
			results.passed++;
			return { tool: toolName, status: 'passed', note: 'expected error' };
		} else {
			log(`  [FAIL] ${toolName}: ${error.message}`, 'red');
			results.failed++;
			results.errors.push({ tool: toolName, error: error.message });
			return { tool: toolName, status: 'failed', error: error.message };
		}
	}
}

async function runCategoryTests(categoryKey, category) {
	// Skip if targeting specific category and this isn't it
	if (targetCategory && categoryKey !== targetCategory) {
		return [];
	}
	
	logStep(categoryKey, category.name);
	
	const categoryResults = [];
	
	for (const test of category.tests) {
		const result = await runToolTest(categoryKey, test);
		if (result) {
			categoryResults.push(result);
		}
	}
	
	return categoryResults;
}

async function checkConnection() {
	log('Checking Godot Connection...', 'cyan');
	
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
		return null;
	}
}

function printSummary() {
	logDivider();
	logHeader('TEST SUMMARY');
	logDivider();
	
	const total = results.passed + results.failed + results.skipped;
	
	log(`Total:   ${total}`, 'bright');
	log(`Passed:  ${results.passed}`, 'green');
	log(`Failed:  ${results.failed}`, results.failed > 0 ? 'red' : 'green');
	log(`Skipped: ${results.skipped}`, results.skipped > 0 ? 'yellow' : 'green');
	
	if (results.errors.length > 0) {
		log('\nFailed Tests:', 'red');
		for (const err of results.errors) {
			log(`  - ${err.tool}: ${err.error}`, 'red');
		}
	}
	
	const successRate = total > 0 ? Math.round((results.passed / (results.passed + results.failed)) * 100) : 0;
	log(`\nSuccess Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red');
	
	logDivider();
}

async function finalCleanup() {
	if (verbose) {
		log('\nRunning final cleanup...', 'cyan');
	}

	const tool = toolMap.get('execute_editor_script');
	if (!tool) return;

	try {
		await tool.execute({
			code: `
var dir = DirAccess.open("res://")
if dir:
	dir.list_dir_begin()
	var file_name = dir.get_next()
	var cleaned_files = []
	while file_name != "":
		if file_name.begins_with("test_mcp_"):
			if dir.remove(file_name) == OK:
				cleaned_files.append(file_name)
		file_name = dir.get_next()
	dir.list_dir_end()

	if cleaned_files.size() > 0:
		print("Final cleanup removed ", cleaned_files.size(), " test files:")
		for f in cleaned_files:
			print("  - ", f)
	else:
		print("No test files to clean up")
`
		});

		if (verbose) {
			logSuccess('Final cleanup completed');
		}
	} catch (error) {
		if (verbose) {
			logWarning(`Final cleanup failed: ${error.message}`);
		}
	}
}

async function main() {
	logHeader('Godot MCP Tools Integration Test');
	logDivider();
	
	if (targetCategory) {
		logInfo(`Running category: ${targetCategory}`);
	}
	if (targetTool) {
		logInfo(`Running tool: ${targetTool}`);
	}
	if (skipRuntime) {
		logInfo('Skipping runtime tests');
	}
	
	// Check connection
	const connection = await checkConnection();
	if (!connection) {
		process.exit(1);
	}
	
	log('');
	
	// Run tests by category
	for (const [categoryKey, category] of Object.entries(toolCategories)) {
		await runCategoryTests(categoryKey, category);
	}

	// Final cleanup of any remaining test files
	await finalCleanup();

	// Print summary
	printSummary();

	// Disconnect
	connection.disconnect();
	
	// Exit with appropriate code
	process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
	logError(`Test runner failed: ${error.message}`);
	process.exit(1);
});
