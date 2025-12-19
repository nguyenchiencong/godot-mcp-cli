#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

type CliAction = 'list' | 'help' | 'call' | 'install';

type ParsedArgs = {
  action: CliAction;
  toolName?: string;
  raw: boolean;
  verbose: boolean;
  installTarget?: string;
  params: Record<string, unknown>;
  paramsJson?: Record<string, unknown>;
  timeoutMs?: number;
  serverCommand: string;
  serverArgs: string[];
};

type ToolSummary = {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<
      string,
      {
        type?: string;
        description?: string;
      }
    >;
    required?: string[];
  };
};

const DEFAULT_CLIENT_INFO = { name: pkg.name, version: pkg.version };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SERVER_ENTRY = path.join(__dirname, 'index.js');

function toToolSummary(tool: Record<string, unknown>): ToolSummary {
  const name =
    typeof tool.name === 'string'
      ? tool.name
      : tool.name !== undefined
      ? String(tool.name)
      : 'unknown';

  const rawProps =
    typeof (tool as { inputSchema?: { properties?: unknown } }).inputSchema === 'object'
      ? (tool as { inputSchema?: { properties?: unknown } }).inputSchema?.properties
      : undefined;

  const properties =
    rawProps && typeof rawProps === 'object'
      ? (rawProps as Record<string, { type?: string; description?: string }>)
      : undefined;

  const rawRequired =
    typeof (tool as { inputSchema?: { required?: unknown } }).inputSchema === 'object'
      ? (tool as { inputSchema?: { required?: unknown } }).inputSchema?.required
      : undefined;

  const required = Array.isArray(rawRequired)
    ? rawRequired.filter((value): value is string => typeof value === 'string')
    : undefined;

  return {
    name,
    description: typeof tool.description === 'string' ? tool.description : undefined,
    inputSchema: properties || required ? { properties, required } : undefined,
  };
}

function kebabToSnake(value: string): string {
  return value.replace(/-/g, '_');
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!Number.isNaN(Number(value)) && value.trim() !== '') {
    return Number(value);
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  let action: CliAction = 'call';
  let toolName: string | undefined;
  const params: Record<string, unknown> = {};
  let paramsJson: Record<string, unknown> | undefined;
  let raw = false;
  let quiet = true; // default to no progress
  let verbose = false;
  let timeoutMs: number | undefined;
  let serverCommand = process.execPath;
  let serverArgs = [DEFAULT_SERVER_ENTRY];
  let installTarget: string | undefined;

  // Command detection
  if (args[0] === '--list-tools') {
    action = 'list';
    args.shift();
  } else if (args[0] === 'install-addon') {
    action = 'install';
    if (!args[1]) {
      console.error('Missing target path for install-addon');
      process.exit(1);
    }
    installTarget = args[1];
    args.splice(0, 2);
  } else if (args[0] === '--help') {
    if (!args[1]) {
      console.error('Missing tool name for --help');
      process.exit(1);
    }
    action = 'help';
    toolName = args[1];
    args.splice(0, 2);
  } else {
    toolName = args.shift();
    if (!toolName) {
      console.error('Tool name is required');
      process.exit(1);
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = args[i + 1];

    switch (key) {
      case 'raw':
        raw = true;
        break;
      case 'verbose':
        verbose = true;
        quiet = false; // verbose implies progress
        break;
      case 'timeout':
        if (next === undefined) {
          console.error('--timeout requires a value (ms)');
          process.exit(1);
        }
        timeoutMs = Number(next);
        i += 1;
        break;
      case 'params-json':
        if (next === undefined) {
          console.error('--params-json requires a JSON object');
          process.exit(1);
        }
        try {
          const parsedJson = JSON.parse(next) as unknown;
          if (!parsedJson || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
            console.error('--params-json must be a JSON object');
            process.exit(1);
          }
          paramsJson = parsedJson as Record<string, unknown>;
        } catch (error) {
          console.error(`Invalid JSON for --params-json: ${(error as Error).message}`);
          process.exit(1);
        }
        i += 1;
        break;
      case 'server-cmd':
        if (next === undefined) {
          console.error('--server-cmd requires a value');
          process.exit(1);
        }
        serverCommand = next;
        i += 1;
        break;
      case 'server-args':
        if (next === undefined) {
          console.error('--server-args requires a value');
          process.exit(1);
        }
        try {
          const parsedArgs = JSON.parse(next);
          if (Array.isArray(parsedArgs)) {
            serverArgs = parsedArgs.map(arg => String(arg));
          } else {
            serverArgs = [String(parsedArgs)];
          }
        } catch {
          serverArgs = [next];
        }
        i += 1;
        break;
      default: {
        // Parameter flag
        if (next === undefined || next.startsWith('--')) {
          params[kebabToSnake(key)] = true;
          i += 0;
        } else {
          params[kebabToSnake(key)] = parseValue(next);
          i += 1;
        }
        break;
      }
    }
  }

  return {
    action,
    toolName,
    raw,
    verbose,
    installTarget,
    params,
    paramsJson,
    timeoutMs,
    serverCommand,
    serverArgs,
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyAddon(targetProjectPath: string): Promise<void> {
  const projectPath = path.resolve(targetProjectPath);
  const projectFile = path.join(projectPath, 'project.godot');
  if (!(await pathExists(projectFile))) {
    throw new Error(`Not a Godot project (project.godot not found at ${projectPath})`);
  }

  const addonCandidates = [
    path.resolve(__dirname, '..', 'addons', 'godot_mcp'),
    path.resolve(__dirname, '..', '..', 'addons', 'godot_mcp'),
  ];

  let sourceAddon: string | undefined;
  for (const candidate of addonCandidates) {
    if (await pathExists(candidate)) {
      sourceAddon = candidate;
      break;
    }
  }

  if (!sourceAddon) {
    throw new Error(`Source addon not found. Tried: ${addonCandidates.join(', ')}`);
  }

  const targetAddonDir = path.join(projectPath, 'addons', 'godot_mcp');
  await fs.mkdir(path.dirname(targetAddonDir), { recursive: true });

  // Remove existing install to ensure clean update
  if (await pathExists(targetAddonDir)) {
    await fs.rm(targetAddonDir, { recursive: true, force: true });
  }

  await fs.cp(sourceAddon, targetAddonDir, { recursive: true });
  console.log(`Installed addon to ${targetAddonDir}`);
}

async function connectClient(
  command: string,
  args: string[],
  timeoutMs: number | undefined,
  verbose: boolean
): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const transport = new StdioClientTransport({
    command,
    args,
    stderr: verbose ? 'inherit' : 'pipe',
    env: process.env as Record<string, string>,
  });

  const client = new Client(DEFAULT_CLIENT_INFO, {
    capabilities: {},
  });

  let timedOut = false;
  const timeout = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        void transport.close();
      }, timeoutMs)
    : undefined;

  await client.connect(transport);

  const cleanup = async () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    await client.close();
    await transport.close();
  };

  if (timedOut) {
    throw new Error('Connection to MCP server timed out');
  }

  return { client, cleanup };
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  godot-mcp --list-tools');
  console.error('  godot-mcp --help <tool>');
  console.error('  godot-mcp <tool> [--flag value] [--params-json JSON]');
  console.error('  godot-mcp install-addon <path-to-godot-project>');
  console.error('');
  console.error('Common flags:');
  console.error('  --raw             Print raw JSON responses');
  console.error('  --verbose         Show progress logs and server stderr diagnostics');
  console.error('  --timeout <ms>    Timeout for connecting and running the tool');
  console.error('  --server-cmd      Override server executable (default: node)');
  console.error('  --server-args     Override server args (default: dist/index.js)');
}

const color = {
  green: (text: string) => (process.stdout.isTTY ? `\u001b[32m${text}\u001b[0m` : text),
  cyan: (text: string) => (process.stdout.isTTY ? `\u001b[36m${text}\u001b[0m` : text),
  dim: (text: string) => (process.stdout.isTTY ? `\u001b[2m${text}\u001b[0m` : text),
  yellow: (text: string) => (process.stdout.isTTY ? `\u001b[33m${text}\u001b[0m` : text),
};

function printToolList(tools: ToolSummary[]): void {
  if (tools.length === 0) {
    console.log('No tools available');
    return;
  }

  const nameWidth = Math.min(
    Math.max(...tools.map(t => t.name.length), 'Tool'.length) + 2,
    40
  );

  console.log(`${color.cyan('Tool'.padEnd(nameWidth))}Description`);
  tools.forEach(tool => {
    const name = tool.name.padEnd(nameWidth);
    const desc = tool.description ? tool.description : '';
    console.log(`${color.green(name)}${desc}`);
  });
}

function printToolHelp(tool: ToolSummary): void {
  console.log(`Tool: ${tool.name}`);
  if (tool.description) {
    console.log(`Description: ${tool.description}`);
  }

  const properties = tool.inputSchema?.properties ?? {};
  const keys = Object.keys(properties);
  if (keys.length === 0) {
    console.log('Parameters: none');
    return;
  }

  console.log('Parameters:');
  keys.forEach(key => {
    const prop = properties[key] ?? {};
    const type = prop.type ?? 'unknown';
    const desc = prop.description ? ` - ${prop.description}` : '';
    console.log(`  --${key} (${type})${desc}`);
  });
}

function printContent(result: unknown, raw: boolean): void {
  if (raw) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (
    typeof result === 'object' &&
    result !== null &&
    'content' in (result as Record<string, unknown>)
  ) {
    const content = (result as { content?: Array<Record<string, unknown>> }).content;
    if (!content || content.length === 0) {
      console.log('(no content)');
      return;
    }

    content.forEach(item => {
      if (item.type === 'text') {
        console.log(`- ${String(item.text ?? '')}`);
      } else if (item.type === 'image') {
        console.log(
          `- ${color.cyan('[image]')} mime=${item.mimeType ?? 'unknown'} (${(item.data as string)?.length} bytes)`
        );
      } else if (item.type === 'resource') {
        console.log(`- ${color.cyan('[resource]')} ${JSON.stringify(item.resource)}`);
      } else {
        console.log(JSON.stringify(item));
      }
    });
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.action === 'install') {
    try {
      await copyAddon(parsed.installTarget as string);
      return;
    } catch (error) {
      const err = error as Error;
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  const { client, cleanup } = await connectClient(
    parsed.serverCommand,
    parsed.serverArgs,
    parsed.timeoutMs,
    parsed.verbose
  );

  try {
    if (parsed.action === 'list') {
      const { tools } = await client.listTools();
      const summaries = tools.map(tool => toToolSummary(tool as Record<string, unknown>));
      printToolList(summaries);
      return;
    }

    const { tools } = await client.listTools();
    const summaries = tools.map(tool => toToolSummary(tool as Record<string, unknown>));
    const target = summaries.find(tool => tool.name === parsed.toolName);

    if (!target) {
      throw new Error(`Tool not found: ${parsed.toolName}`);
    }

    if (parsed.action === 'help') {
      printToolHelp(target as ToolSummary);
      return;
    }

    const argumentsPayload = parsed.paramsJson ?? parsed.params;

    const requiredParams = target.inputSchema?.required ?? [];
    if (requiredParams.length > 0) {
      const missing = requiredParams.filter(
        key =>
          !Object.prototype.hasOwnProperty.call(argumentsPayload, key) ||
          argumentsPayload[key] === undefined
      );
      if (missing.length > 0) {
        const label = missing.length === 1 ? 'parameter' : 'parameters';
        throw new Error(`Invalid parameters: missing required ${label}: ${missing.join(', ')}`);
      }
    }

    const result = await client.callTool(
      {
        name: parsed.toolName as string,
        arguments: argumentsPayload,
      },
      undefined,
      parsed.verbose
        ? {
            onprogress: progress => {
              const progressText =
                progress.total !== undefined
                  ? `progress ${progress.progress}/${progress.total}`
                  : `progress ${progress.progress}`;
              console.error(`[progress] ${parsed.toolName}: ${progressText}`);
            },
          }
        : undefined
    );

    printContent(result, parsed.raw);
  } catch (error) {
    if (error instanceof McpError) {
      console.error(`MCP error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Unknown error');
    }
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch(error => {
  console.error('CLI failed:', error);
  process.exit(1);
});
