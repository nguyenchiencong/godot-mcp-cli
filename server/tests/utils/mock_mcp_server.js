#!/usr/bin/env node

/**
 * Minimal MCP server for CLI tests. Provides a couple of tools over stdio.
 */

import { FastMCP } from 'fastmcp';
import { z } from 'zod';

async function main() {
  const server = new FastMCP({
    name: 'MockCliServer',
    version: '1.0.0',
  });

  server.addTool({
    name: 'echo_text',
    description: 'Echo a text value',
    parameters: z.object({
      text: z.string(),
    }),
    execute: async args => {
      return String(args.text);
    },
  });

  server.addTool({
    name: 'add_numbers',
    description: 'Add two numbers',
    parameters: z.object({
      a: z.number(),
      b: z.number(),
    }),
    execute: async args => {
      return String(args.a + args.b);
    },
  });

  server.addTool({
    name: 'progress_task',
    description: 'Emits progress before finishing',
    parameters: z.object({
      label: z.string().default('working'),
    }),
    execute: async (args, { reportProgress }) => {
      reportProgress({ progress: 0, total: 2, label: args.label });
      await new Promise(resolve => setTimeout(resolve, 50));
      reportProgress({ progress: 1, total: 2, label: args.label });
      return `${args.label} done`;
    },
  });

  await server.start({
    transportType: 'stdio',
  });
}

main().catch(error => {
  console.error('Mock CLI server failed:', error);
  process.exit(1);
});
