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
 *   --category=X     Run only specific category (node, script, shader, scene, project, editor, asset, debugger, input, enhanced)
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
import { captureTools } from '../dist/tools/capture_tools.js';
import { diagnosticsTools } from '../dist/tools/diagnostics_tools.js';
import { shaderTools } from '../dist/tools/shader_tools.js';

import { writeFileSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const TEST_SHADER_PATH = `res://test_mcp_shader_${testTimestamp}.gdshader`;

// Godot project root (tests/ -> server/ -> project root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

if (args.includes('--help') || args.includes('-h')) {
	log('Godot MCP Tools Integration Test', 'bright');
	log('');
	log('Usage: node tests/tools.test.js [options]', 'cyan');
	log('');
	log('Options:');
	log('  --help, -h       Show this help message');
	log('  --verbose, -v    Enable verbose logging');
	log('  --category=X     Run only specific category');
	log('                   (node, script, shader, scene, project, editor, asset, debugger, input, enhanced)');
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
	...captureTools,
	...diagnosticsTools,
	...shaderTools,
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
						// Deliberately invalid: exercises the auto-diagnostics error path
						content: 'extends Node\n\nfunc _ready():\n\tvar value = \n',
						diagnostics: true
					};
				},
				validate: (result) => result.includes('Created') && result.includes('Diagnostics:') && result.includes('error')
			},
			{
				tool: 'edit_script',
				get params() {
					return {
						script_path: TEST_SCRIPT_PATH,
						// Valid content: recovery after the broken create above
						content: 'extends Node\n\nfunc _ready():\n\tprint("Hello MCP")\n',
						diagnostics: true
					};
				},
				validate: (result) => result.includes('Updated') && result.includes('Diagnostics: valid'),
				cleanup: async () => {
					const tool = toolMap.get('execute_editor_script');
					if (tool) {
						try {
							const scriptPath = TEST_SCRIPT_PATH;
							await tool.execute({
								allow_unsafe: true,
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
			},
			{
				tool: 'get_script_diagnostics',
				params: { script_path: 'res://test_debugger.gd' },
				validate: (result) => result.includes('valid') && result.includes('0 errors')
			},
			{
				tool: 'get_script_diagnostics',
				get params() {
					// Write a broken script at the project root so the real parse-error path is exercised
					const brokenPath = `test_mcp_broken_${testTimestamp}.gd`;
					writeFileSync(path.join(PROJECT_ROOT, brokenPath), 'extends Node\nfunc broken():\n\tvar x = \n');
					return { script_path: `res://${brokenPath}` };
				},
				validate: (result) => result.includes('error') || result.includes('line') || result.includes('Expected'),
				cleanup: async () => {
					rmSync(path.join(PROJECT_ROOT, `test_mcp_broken_${testTimestamp}.gd`), { force: true });
					rmSync(path.join(PROJECT_ROOT, `test_mcp_broken_${testTimestamp}.gd.uid`), { force: true });
				}
			}
		]
	},
	shader: {
		name: 'Shader Tools',
		tests: [
			{
				tool: 'create_shader',
				get params() {
					return { script_path: TEST_SHADER_PATH, shader_type: 'canvas_item' };
				},
				validate: (result) => result.includes('Created') && result.includes('no shader compile errors')
			},
			{
				tool: 'edit_shader',
				get params() {
					return { script_path: TEST_SHADER_PATH, content: '' };
				},
				validate: (result) => result.includes('Updated shader')
			},
			{
				tool: 'edit_shader',
				get params() {
					// Valid content: recovery after the deliberately empty edit above
					return {
						script_path: TEST_SHADER_PATH,
						content: 'shader_type canvas_item;\n\nvoid fragment() {\n\tCOLOR = vec4(0.2, 0.4, 0.8, 1.0);\n}\n'
					};
				},
				validate: (result) => result.includes('Updated') && result.includes('no shader compile errors')
			},
			{
				tool: 'edit_shader',
				get params() {
					// Deliberately invalid: exercises the editor compile-error diagnostics path
					return {
						script_path: TEST_SHADER_PATH,
						content: 'shader_type canvas_item;\n\nvoid fragment() {\n\tCOLOR = vec4(1.0;\n}\n'
					};
				},
				validate: (result) => result.includes('Updated') && (result.includes('issue') || result.includes('line'))
			},
			{
				tool: 'shader_get_compile_errors',
				get params() {
					// The invalid edit above should have left a captured shader compile error.
					// A short wait also exercises the bounded wait path.
					return { script_path: TEST_SHADER_PATH, wait_ms: 10 };
				},
				validate: (result) => result.includes('issue(s):') && result.includes('[error at')
			},
			{
				tool: 'get_shader',
				get params() {
					return { script_path: TEST_SHADER_PATH };
				},
				validate: (result) => result.includes('shader_type canvas_item'),
				cleanup: async () => {
					const tool = toolMap.get('execute_editor_script');
					if (tool) {
						try {
							await tool.execute({
								allow_unsafe: true,
								code: `
var dir = DirAccess.open("res://")
if dir:
	dir.remove("${TEST_SHADER_PATH}")
	dir.remove("${TEST_SHADER_PATH}.uid")
print("Cleaned up test shader: ${TEST_SHADER_PATH}")
`
							});
						} catch (e) {
							// Ignore cleanup errors
						}
					}
				}
			},
			// Runtime shader tools (Phase B): target the RUNNING game, so they are
			// gated like the debugger/input runtime tests. Use --skip-runtime when
			// no game is attached; otherwise success cases must not accept errors.
			// When it is running (F5 from the editor), the scene must contain the
			// ShaderVisuals nodes from test_main_scene.tscn for the assertions.
			{
				tool: 'shader_list_materials',
				get params() {
					return { node_path: '/root/TestMainScene' };
				},
				validate: (result) => result.includes('Found 3 ShaderMaterial(s):')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SharedSpriteA')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SharedSpriteB')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SoloSprite')
					&& result.includes('material: res://test_runtime_material.tres')
					&& result.includes('material: res://test_main_scene.tscn::ShaderMaterial_shared')
					&& result.includes('shader: res://test_runtime_material.gdshader')
					&& result.includes('sharing: 2 user(s)'),
				requiresRuntime: true
			},
			{
				tool: 'shader_get_uniforms',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SharedSpriteA', material_slot: 'material' };
				},
				validate: (result) => result.includes('Shader: res://test_runtime_material.gdshader on /root/TestMainScene/ShaderVisuals/SharedSpriteA (slot: material)')
					&& result.includes('Uniforms (9):')
					&& result.includes('- speed (float)')
					&& result.includes('- tint (color)')
					&& result.includes('- offset (vec2)'),
				requiresRuntime: true
			},
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'speed', value: 3.5 };
				},
				validate: (result) => result.includes("Set uniform 'speed' on /root/TestMainScene/ShaderVisuals/SoloSprite (slot: material)")
					&& result.includes('new: 3.5')
					&& result.includes('sharing: 1 user(s)'),
				requiresRuntime: true
			},
			// Shared-material refusal: SharedSpriteA and SharedSpriteB share one
			// ShaderMaterial sub-resource, so without allow_shared the game must
			// refuse the write with an error that names the sharing.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SharedSpriteA', uniform_name: 'speed', value: 2.5 };
				},
				validate: (result) => true,
				requiresRuntime: true,
				expectError: true,
				expectErrorContains: 'is shared by 2 nodes'
			},
			// The same write with allow_shared=true must succeed and report both users.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SharedSpriteA', uniform_name: 'speed', value: 2.5, allow_shared: true };
				},
				validate: (result) => result.includes("Set uniform 'speed' on /root/TestMainScene/ShaderVisuals/SharedSpriteA")
					&& result.includes('new: 2.5')
					&& result.includes('sharing: 2 user(s)'),
				requiresRuntime: true
			},
			// Unknown uniform names must be rejected by the running game.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'missing_uniform', value: 1.0 };
				},
				validate: (result) => true,
				requiresRuntime: true,
				expectError: true,
				expectErrorContains: "Unknown uniform 'missing_uniform'"
			},
			// Scalar strings must not be silently coerced to zero.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'speed', value: 'not-a-number' };
				},
				validate: (result) => true,
				requiresRuntime: true,
				expectError: true,
				expectErrorContains: "not valid for uniform type 'float'"
			},
			// Texture paths are restricted to project resources.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'albedo_tex', value: 'user://outside.png' };
				},
				validate: (result) => true,
				requiresRuntime: true,
				expectError: true,
				expectErrorContains: 'Texture path must stay inside res://'
			},
			// Fixed-size arrays must round-trip and reject the wrong element count.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'weights', value: [0.125, 0.25, 0.5] };
				},
				validate: (result) => result.includes("Set uniform 'weights' on /root/TestMainScene/ShaderVisuals/SoloSprite")
					&& result.includes('new: [0.125,0.25,0.5]'),
				requiresRuntime: true
			},
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'weights', value: [1, 2] };
				},
				validate: (result) => true,
				requiresRuntime: true,
				expectError: true,
				expectErrorContains: 'Expected exactly 3 array values, received 2'
			},
			// Color round-trip: set a color uniform, then re-read it via get_uniforms.
			// Binary-exact components (0.5/0.25/0.125) keep the JSON assertion stable.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'tint', value: { r: 0.5, g: 0.25, b: 0.125, a: 1 } };
				},
				validate: (result) => {
					// Color dict keys may be reordered by the debugger round-trip,
					// so parse the JSON and compare components by name.
					const match = result.match(/new: (\{[^{}]*\})/);
					if (!match) {
						return false;
					}
					try {
						const value = JSON.parse(match[1]);
						return value.r === 0.5 && value.g === 0.25 && value.b === 0.125 && value.a === 1;
					} catch (e) {
						return false;
					}
				},
				requiresRuntime: true
			},
			// Vec2 round-trip: set a vec2 uniform, then re-read it via get_uniforms.
			// Values serialize canonically as {x,y} dicts in replies.
			{
				tool: 'shader_set_uniform',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', uniform_name: 'offset', value: [0.5, 0.25] };
				},
				validate: (result) => result.includes("Set uniform 'offset' on /root/TestMainScene/ShaderVisuals/SoloSprite")
					&& result.includes('new: {"x":0.5,"y":0.25}'),
				requiresRuntime: true
			},
			{
				tool: 'shader_get_uniforms',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', material_slot: 'material' };
				},
				validate: (result) => {
					const tintMatch = result.match(/tint \(color\) value=(\{[^{}]*\})/);
					const offsetMatch = result.match(/offset \(vec2\) value=(\{[^{}]*\})/);
					if (!tintMatch || !offsetMatch) {
						return false;
					}
					try {
						const tint = JSON.parse(tintMatch[1]);
						const offset = JSON.parse(offsetMatch[1]);
						return tint.r === 0.5 && tint.g === 0.25 && tint.b === 0.125 && tint.a === 1
							&& offset.x === 0.5 && offset.y === 0.25;
					} catch (e) {
						return false;
					}
				},
				requiresRuntime: true
			},
			// Shader debug snapshot (Phase B): read-only full material snapshot.
			{
				tool: 'shader_debug_snapshot',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', material_slot: 'material' };
				},
				validate: (result) => result.includes('Shader: res://test_runtime_material.gdshader (type: canvas_item) on /root/TestMainScene/ShaderVisuals/SoloSprite (slot: material)')
					&& result.includes('Uniforms (9):')
					&& result.includes('- speed (float)')
					&& result.includes('- tint (color)')
					&& result.includes('sharing: 1 user(s)'),
				requiresRuntime: true
			},
			// Shader hot reload (Phase B): re-applying the file's own content is a
			// no-op change, so the shader and its file stay untouched, while the
			// affected-materials enumeration and rollback previous_code are validated.
			{
				tool: 'shader_hot_reload',
				get params() {
					const content = readFileSync(path.join(PROJECT_ROOT, 'test_runtime_material.gdshader'), 'utf8');
					return { shader_path: 'res://test_runtime_material.gdshader', content };
				},
				validate: (result) => result.includes('Hot-reloaded shader res://test_runtime_material.gdshader')
					&& result.includes('affected materials (3):')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SharedSpriteA')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SoloSprite')
					&& result.includes('file_written: true')
					&& result.includes('compile_errors: none')
					&& result.includes('previous_code'),
				requiresRuntime: true
			},
			// Shader debug overlay (T5): toggles Viewport debug-draw modes in
			// the running game. "off" resets to the default and works on every
			// renderer, so it also leaves the game in a clean state.
			{
				tool: 'shader_debug_overlay',
				params: { mode: 'off', viewport_index: 0 },
				validate: (result) => result.includes("Debug overlay mode 'off' applied")
					&& result.includes('renderer:'),
				requiresRuntime: true
			},
			// Phase D editor-side tools: static warnings need no running game.
			// The Phase B test shader deliberately leaves 7 of its 9 uniforms
			// unused, so shader_get_warnings must report exactly 7 warnings.
			{
				tool: 'shader_get_warnings',
				get params() {
					return { script_path: 'res://test_runtime_material.gdshader', wait_ms: 10 };
				},
				validate: (result) => result.includes('warnings_enabled: true')
					&& result.includes('warnings (7):')
					&& result.includes("The uniform 'steps' is declared but never used.")
					&& result.includes('errors (0):')
					&& result.includes('total: 7')
			},
			{
				tool: 'shader_project_health',
				get params() {
					return { wait_ms: 10 };
				},
				validate: (result) => result.includes('Shader project health scan (1 file(s)):')
					&& result.includes('test_runtime_material.gdshader')
					&& result.includes('files_with_errors: 0')
					&& result.includes('enabled_warnings: true')
			},
			// Phase D runtime tools. shader_debug_visualize injects a temporary
			// visualization, then mode=off restores the original code, so the
			// scene is left clean for the tests that follow. The sequence
			// uv -> world_pos -> off -> snapshot protects the world_pos
			// compilation path (regression: varying was inserted after the
			// functions, and vec4(VERTEX, 1.0) is invalid for canvas_item)
			// and the baseline restoration path (regression: a mode switch
			// overwrote the registry baseline, so off restored the previous
			// injected shader instead of the true original).
			{
				tool: 'shader_debug_visualize',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', mode: 'uv' };
				},
				validate: (result) => result.includes("Visualization mode 'uv' applied")
					&& result.includes('injected:')
					&& result.includes('compile_errors: none'),
				requiresRuntime: true
			},
			{
				tool: 'shader_debug_visualize',
				get params() {
					// Mode switch without an intervening off: world_pos must
					// compile on canvas_item and the baseline must be kept.
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', mode: 'world_pos' };
				},
				validate: (result) => result.includes("Visualization mode 'world_pos' applied")
					&& result.includes('compile_errors: none'),
				requiresRuntime: true
			},
			{
				tool: 'shader_debug_visualize',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', mode: 'off' };
				},
				validate: (result) => result.includes("Visualization mode 'off' applied")
					&& result.includes('restored: true'),
				requiresRuntime: true
			},
			{
				tool: 'shader_debug_snapshot',
				get params() {
					// After off, the full source must be the true original:
					// COLOR = tint; present, no injected mcp_world_pos left.
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', material_slot: 'material' };
				},
				validate: (result) => result.includes('COLOR = tint;')
					&& !result.includes('mcp_world_pos'),
				requiresRuntime: true
			},
			// Resetting uniforms restores the shader defaults (speed defaults to 2.0).
			{
				tool: 'shader_reset_uniforms',
				get params() {
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite', material_slot: 'material' };
				},
				validate: (result) => result.includes('Reset 9 uniform(s)')
					&& result.includes('- speed = 2')
					&& result.includes('count: 9'),
				requiresRuntime: true
			},
			// Reloading the file's own content is a no-op change (unchanged: true),
			// but the affected-materials enumeration is still validated.
			{
				tool: 'shader_reload_from_disk',
				get params() {
					return { shader_path: 'res://test_runtime_material.gdshader' };
				},
				validate: (result) => result.includes('Reloaded shader res://test_runtime_material.gdshader from disk')
					&& result.includes('affected materials (3):')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SoloSprite')
					&& result.includes('compile_errors: none'),
				requiresRuntime: true
			},
			// Shader-wide uniform set (shader_path): applies to every material
			// using the shader. allow_shared=true so the two sprites sharing one
			// material are affected too (without it they are reported under
			// skipped instead and affected would be 1).
			{
				tool: 'shader_set_uniform',
				get params() {
					return { shader_path: 'res://test_runtime_material.gdshader', uniform_name: 'speed', value: 2.5, allow_shared: true };
				},
				validate: (result) => result.includes("Set uniform 'speed' via shader res://test_runtime_material.gdshader")
					&& result.includes('affected (3):')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SharedSpriteA')
					&& result.includes('/root/TestMainScene/ShaderVisuals/SoloSprite')
					&& result.includes('skipped (0):')
					&& result.includes('count: 3'),
				requiresRuntime: true
			},
			// Render-time measurement: enable=true must flip the viewport flag and
			// report numeric gpu_ms/cpu_ms values.
			{
				tool: 'shader_measure_frame_time',
				get params() {
					return { enable: true, viewport_index: 0 };
				},
				validate: (result) => result.includes('Render-time measurement')
					&& result.includes('gpu_ms:')
					&& result.includes('cpu_ms:')
					&& result.includes('enabled: true'),
				requiresRuntime: true
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
								allow_unsafe: true,
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
			},
			{
				tool: 'validate_scene',
				params: { scene_path: 'res://test_main_scene.tscn' },
				validate: (result) => result.includes('valid') && result.includes('0 issues')
			},
			{
				tool: 'validate_scene',
				// Optimized branch: skips PackedScene.instantiate, structural/dependency checks only
				params: { scene_path: 'res://test_main_scene.tscn', check_instantiate: false },
				validate: (result) => result.includes('valid') && result.includes('0 issues')
			},
			{
				tool: 'capture_scene',
				params: { scene_path: 'res://test_main_scene.tscn', width: 320, height: 180 },
				validate: (result) => {
					try {
						const parsed = JSON.parse(result);
						const imageBlock = parsed.content.find((block) => block.type === 'image');
						if (!imageBlock) {
							return false;
						}
						const buffer = Buffer.from(imageBlock.data, 'base64');
						if (buffer.length < 4 || buffer.subarray(0, 4).toString('hex') !== '89504e47') {
							return false;
						}
						const textBlock = parsed.content.find((block) => block.type === 'text');
						return !!(textBlock && textBlock.text && textBlock.text.includes('captured'));
					} catch (e) {
						return false;
					}
				}
			},
			{
				tool: 'capture_running_game',
				params: {},
				validate: (result) => {
					try {
						const parsed = JSON.parse(result);
						const imageBlock = parsed.content.find((block) => block.type === 'image');
						if (!imageBlock) {
							return false;
						}
						const buffer = Buffer.from(imageBlock.data, 'base64');
						if (buffer.length < 4 || buffer.subarray(0, 4).toString('hex') !== '89504e47') {
							return false;
						}
						const textBlock = parsed.content.find((block) => block.type === 'text');
						return !!(textBlock && textBlock.text && textBlock.text.includes('captured'));
					} catch (e) {
						return false;
					}
				},
				requiresRuntime: true
			},
			{
				tool: 'capture_running_game',
				get params() {
					// 2D node-path crop: the reply text must report the crop and the
					// original frame dimensions.
					return { node_path: '/root/TestMainScene/ShaderVisuals/SoloSprite' };
				},
				validate: (result) => {
					try {
						const parsed = JSON.parse(result);
						const imageBlock = parsed.content.find((block) => block.type === 'image');
						if (!imageBlock) {
							return false;
						}
						const buffer = Buffer.from(imageBlock.data, 'base64');
						if (buffer.length < 4 || buffer.subarray(0, 4).toString('hex') !== '89504e47') {
							return false;
						}
						const textBlock = parsed.content.find((block) => block.type === 'text');
						return !!(textBlock && textBlock.text && textBlock.text.includes('captured')
							&& textBlock.text.includes('Cropped to the requested node region'));
					} catch (e) {
						return false;
					}
				},
				requiresRuntime: true
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
			},
			{
				tool: 'generate_project_guidance',
				params: { include_agents_md: false },
				validate: (result) => result.includes('project_guide.md'),
				cleanup: async () => {
					const tool = toolMap.get('execute_editor_script');
					if (tool) {
						try {
							await tool.execute({
								allow_unsafe: true,
								code: `
var ai_dir = DirAccess.open("res://addons/godot_mcp/ai")
if ai_dir:
	ai_dir.remove("project_guide.md")
	# Remove the ai directory only when it is now empty
	ai_dir.list_dir_begin()
	var has_entries = false
	var entry = ai_dir.get_next()
	while entry != "":
		if entry != "." and entry != "..":
			has_entries = true
			break
		entry = ai_dir.get_next()
	ai_dir.list_dir_end()
	if not has_entries:
		var parent_dir = DirAccess.open("res://addons/godot_mcp")
		if parent_dir:
			parent_dir.remove("ai")
print("Cleaned up test project guide")
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
	editor: {
		name: 'Editor Tools',
		tests: [
			{
				tool: 'execute_editor_script',
				params: { code: 'print("MCP Test")', allow_unsafe: true },
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
				params: { action: 'stop' },
				validate: (result) => result.includes('Stream') || result.includes('stream') || result.includes('Output') || result.includes('output') || result.includes('unsubscribed') || result.includes('subscribed')
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
			},
			{
				tool: 'update_node_transform',
				params: { node_path: '.', position: [1, 2] },
				validate: (result) => result.includes('Node transform updated') || result.includes('updated')
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
			if (test.expectErrorContains && !error.message.includes(test.expectErrorContains)) {
				log(`  [FAIL] ${toolName}: Expected error containing "${test.expectErrorContains}" but got: ${error.message}`, 'red');
				results.failed++;
				results.errors.push({ tool: toolName, error: `Expected error containing "${test.expectErrorContains}"`, result: error.message });
				return { tool: toolName, status: 'failed', error: error.message };
			}
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
			allow_unsafe: true,
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
