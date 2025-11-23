#!/usr/bin/env node

/**
 * CLI smoke tests against a mock MCP server.
 * Requires `npm run build` beforehand so dist/cli.js exists.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cliPath = path.join(__dirname, '../dist/cli.js');
const mockServer = path.join(__dirname, 'utils/mock_mcp_server.js');
const repoAddonPath = path.resolve(__dirname, '..', '..', 'addons', 'godot_mcp');

async function runCli(args) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
      env: process.env,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (error) {
    const err = error;
    return {
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
      code: err.code ?? 1,
    };
  }
}

async function testListTools() {
  const { stdout } = await runCli([
    '--list-tools',
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  if (!stdout.includes('echo_text') || !stdout.includes('add_numbers')) {
    throw new Error('List tools missing expected entries');
  }
}

async function testEchoText() {
  const { stdout } = await runCli([
    'echo_text',
    '--text',
    'hello',
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  if (!stdout.includes('hello')) {
    throw new Error('echo_text did not echo expected output');
  }
}

async function testParamsJson() {
  const payload = { text: 'json hello' };
  const { stdout } = await runCli([
    'echo_text',
    '--params-json',
    JSON.stringify(payload),
    '--raw',
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  const parsed = JSON.parse(stdout);
  const text = parsed?.content?.[0]?.text;

  if (text !== payload.text) {
    throw new Error('Raw output did not match params JSON payload');
  }
}

async function testProgressVerbose() {
  const { stderr } = await runCli([
    'progress_task',
    '--label',
    'demo',
    '--verbose',
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  if (!stderr.includes('[progress]')) {
    throw new Error('Progress logs missing in verbose mode');
  }
}

async function testMissingToolFails() {
  const result = await runCli([
    'nonexistent_tool',
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  if (result.code === 0) {
    throw new Error('Missing tool should fail with non-zero exit code');
  }

  if (!result.stderr.toLowerCase().includes('tool not found')) {
    throw new Error('Missing tool error message not found');
  }
}

async function testInvalidParamsFails() {
  const result = await runCli([
    'add_numbers',
    '--a',
    '1',
    // missing b
    '--server-cmd',
    'node',
    '--server-args',
    JSON.stringify([mockServer]),
  ]);

  if (result.code === 0) {
    throw new Error('Invalid params should fail with non-zero exit code');
  }

  if (!result.stderr.toLowerCase().includes('invalid')) {
    throw new Error('Invalid params error message not found');
  }
}

async function testInstallAddon() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'godot-mcp-cli-'));
  const projectPath = path.join(tmpDir, 'project');
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(path.join(projectPath, 'project.godot'), '');

  const result = await runCli(['install-addon', projectPath]);
  if (result.code !== 0) {
    throw new Error(`install-addon failed: ${result.stderr}`);
  }

  const installedFile = path.join(
    projectPath,
    'addons',
    'godot_mcp',
    'mcp_debugger_bridge.gd'
  );
  const exists = await fs
    .access(installedFile)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    throw new Error('Addon files were not installed');
  }

  // Clean up temp dir
  await fs.rm(tmpDir, { recursive: true, force: true });
}

async function main() {
  await testListTools();
  await testEchoText();
  await testParamsJson();
  await testProgressVerbose();
  await testMissingToolFails();
  await testInvalidParamsFails();
  await testInstallAddon();
  console.log('CLI tests passed');
}

main().catch(error => {
  console.error('CLI tests failed:', error);
  process.exit(1);
});
