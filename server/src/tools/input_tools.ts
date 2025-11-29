// File: /server/src/tools/input_tools.ts
import { z } from 'zod';
import { getGodotConnection } from '../utils/godot_connection.js';
import { MCPTool } from '../utils/types.js';

/**
 * Input simulation tools for testing Godot games in real-time.
 * These tools allow AI to simulate user input (button presses, mouse clicks,
 * drag operations) in a running Godot game via the debugger.
 */

interface InputResult {
  success?: boolean;
  error?: string;
  action?: string;
  type?: string;
  position?: number[];
  start?: number[];
  end?: number[];
  duration_ms?: number;
  steps?: number;
  key?: string;
  steps_executed?: number;
  results?: unknown[];
  errors?: string[];
  actions?: InputAction[];
  count?: number;
}

interface InputAction {
  name: string;
  events: string[];
  deadzone: number;
}

interface SequenceStep {
  type: 'press' | 'release' | 'tap' | 'wait' | 'click';
  action?: string;
  duration_ms?: number;
  strength?: number;
  x?: number;
  y?: number;
  button?: string;
}

function formatInputResult(result: InputResult): string {
  if (!result.success) {
    return `Input simulation failed: ${result.error || 'Unknown error'}`;
  }

  const parts: string[] = [];

  switch (result.type) {
    case 'press':
      parts.push(`Action "${result.action}" pressed.`);
      break;
    case 'release':
      parts.push(`Action "${result.action}" released.`);
      break;
    case 'tap':
      parts.push(`Action "${result.action}" tapped for ${result.duration_ms}ms.`);
      break;
    case 'mouse_click':
      parts.push(`Mouse clicked at (${result.position?.[0]}, ${result.position?.[1]}).`);
      break;
    case 'mouse_move':
      parts.push(`Mouse moved to (${result.position?.[0]}, ${result.position?.[1]}).`);
      break;
    case 'drag':
      parts.push(`Dragged from (${result.start?.[0]}, ${result.start?.[1]}) to (${result.end?.[0]}, ${result.end?.[1]}).`);
      parts.push(`Duration: ${result.duration_ms}ms, Steps: ${result.steps}`);
      break;
    case 'key_press':
      parts.push(`Key "${result.key}" pressed for ${result.duration_ms}ms.`);
      break;
    case 'sequence':
      parts.push(`Input sequence completed: ${result.steps_executed} steps executed.`);
      if (result.errors && result.errors.length > 0) {
        parts.push(`Warnings: ${result.errors.join(', ')}`);
      }
      break;
    case 'input_actions':
      parts.push(`Found ${result.count} input actions:`);
      if (result.actions) {
        for (const action of result.actions.slice(0, 20)) {
          const events = action.events.length > 0 ? action.events.join(', ') : 'No bindings';
          parts.push(`  - ${action.name}: ${events}`);
        }
        if (result.actions.length > 20) {
          parts.push(`  ... and ${result.actions.length - 20} more`);
        }
      }
      break;
    default:
      parts.push('Input simulation completed successfully.');
  }

  return parts.join('\n');
}

export const inputTools: MCPTool[] = [
  {
    name: 'simulate_action_press',
    description: 'Press and hold a Godot input action (ui_left, ui_right, ui_accept, jump, etc.) in the running game. The action will remain pressed until released with simulate_action_release.',
    parameters: z.object({
      action: z.string().describe('The action name (e.g., "ui_accept", "ui_left", "ui_right", "ui_up", "ui_down", "jump", "attack")'),
      strength: z.number().min(0).max(1).optional().describe('Action strength from 0 to 1 (default: 1.0). Useful for analog inputs.')
    }),
    execute: async ({ action, strength }): Promise<string> => {
      const godot = getGodotConnection();
      const params: Record<string, unknown> = { action };
      if (strength !== undefined) params.strength = strength;

      try {
        const result = await godot.sendCommand('simulate_action_press', params) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to press action: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_action_release',
    description: 'Release a previously pressed input action in the running game.',
    parameters: z.object({
      action: z.string().describe('The action name to release')
    }),
    execute: async ({ action }): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('simulate_action_release', { action }) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to release action: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_action_tap',
    description: 'Briefly press and release an input action (like pressing a button). This is equivalent to pressing and then releasing after a short duration.',
    parameters: z.object({
      action: z.string().describe('The action name (e.g., "ui_accept", "jump")'),
      duration_ms: z.number().int().min(16).max(2000).optional()
        .describe('How long to hold the action in milliseconds (default: 100ms)')
    }),
    execute: async ({ action, duration_ms }): Promise<string> => {
      const godot = getGodotConnection();
      const params: Record<string, unknown> = { action };
      if (duration_ms !== undefined) params.duration_ms = duration_ms;

      try {
        const result = await godot.sendCommand('simulate_action_tap', params) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to tap action: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_mouse_click',
    description: 'Simulate a mouse click at a specific screen position in the running game.',
    parameters: z.object({
      x: z.number().describe('X coordinate in screen/viewport space'),
      y: z.number().describe('Y coordinate in screen/viewport space'),
      button: z.enum(['left', 'right', 'middle']).optional()
        .describe('Mouse button to click (default: "left")'),
      double_click: z.boolean().optional()
        .describe('Whether to perform a double-click (default: false)')
    }),
    execute: async ({ x, y, button, double_click }): Promise<string> => {
      const godot = getGodotConnection();
      const params: Record<string, unknown> = { x, y };
      if (button !== undefined) params.button = button;
      if (double_click !== undefined) params.double_click = double_click;

      try {
        const result = await godot.sendCommand('simulate_mouse_click', params) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to simulate mouse click: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_mouse_move',
    description: 'Move the mouse cursor to a specific screen position in the running game.',
    parameters: z.object({
      x: z.number().describe('X coordinate in screen/viewport space'),
      y: z.number().describe('Y coordinate in screen/viewport space')
    }),
    execute: async ({ x, y }): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('simulate_mouse_move', { x, y }) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to move mouse: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_drag',
    description: 'Simulate a drag operation from one position to another (for drag-and-drop interactions).',
    parameters: z.object({
      start_x: z.number().describe('Starting X coordinate'),
      start_y: z.number().describe('Starting Y coordinate'),
      end_x: z.number().describe('Ending X coordinate'),
      end_y: z.number().describe('Ending Y coordinate'),
      duration_ms: z.number().int().min(50).max(5000).optional()
        .describe('Total drag duration in milliseconds (default: 200ms)'),
      steps: z.number().int().min(2).max(100).optional()
        .describe('Number of intermediate mouse positions during drag (default: 10)'),
      button: z.enum(['left', 'right', 'middle']).optional()
        .describe('Mouse button to use for dragging (default: "left")')
    }),
    execute: async ({ start_x, start_y, end_x, end_y, duration_ms, steps, button }): Promise<string> => {
      const godot = getGodotConnection();
      const params: Record<string, unknown> = { start_x, start_y, end_x, end_y };
      if (duration_ms !== undefined) params.duration_ms = duration_ms;
      if (steps !== undefined) params.steps = steps;
      if (button !== undefined) params.button = button;

      try {
        const result = await godot.sendCommand('simulate_drag', params) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to simulate drag: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_key_press',
    description: 'Simulate pressing a keyboard key in the running game.',
    parameters: z.object({
      key: z.string().describe('Key to press (e.g., "SPACE", "ENTER", "A", "1", "F1", "ESCAPE", "UP", "DOWN", "LEFT", "RIGHT")'),
      duration_ms: z.number().int().min(16).max(2000).optional()
        .describe('How long to hold the key in milliseconds (default: 100ms)'),
      modifiers: z.object({
        shift: z.boolean().optional().describe('Hold Shift'),
        ctrl: z.boolean().optional().describe('Hold Ctrl'),
        alt: z.boolean().optional().describe('Hold Alt'),
        meta: z.boolean().optional().describe('Hold Meta/Command')
      }).optional().describe('Modifier keys to hold during the key press')
    }),
    execute: async ({ key, duration_ms, modifiers }): Promise<string> => {
      const godot = getGodotConnection();
      const params: Record<string, unknown> = { key };
      if (duration_ms !== undefined) params.duration_ms = duration_ms;
      if (modifiers !== undefined) params.modifiers = modifiers;

      try {
        const result = await godot.sendCommand('simulate_key_press', params) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to simulate key press: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'simulate_input_sequence',
    description: 'Execute a sequence of input actions with precise timing. Useful for combos, multi-step interactions, or automated testing.',
    parameters: z.object({
      sequence: z.array(z.object({
        type: z.enum(['press', 'release', 'tap', 'wait', 'click'])
          .describe('Type of input step'),
        action: z.string().optional()
          .describe('Action name for press/release/tap steps'),
        duration_ms: z.number().int().optional()
          .describe('Duration for tap steps or wait steps'),
        strength: z.number().min(0).max(1).optional()
          .describe('Action strength for press steps'),
        x: z.number().optional()
          .describe('X coordinate for click steps'),
        y: z.number().optional()
          .describe('Y coordinate for click steps'),
        button: z.enum(['left', 'right', 'middle']).optional()
          .describe('Mouse button for click steps')
      })).describe('Array of input steps to execute in order')
    }),
    execute: async ({ sequence }): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('simulate_input_sequence', { sequence }) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to execute input sequence: ${(error as Error).message}`);
      }
    }
  },
  {
    name: 'get_input_actions',
    description: 'List all available input actions defined in the Godot project. This helps discover what actions can be simulated.',
    parameters: z.object({}),
    execute: async (): Promise<string> => {
      const godot = getGodotConnection();

      try {
        const result = await godot.sendCommand('get_input_actions', {}) as InputResult;
        return formatInputResult(result);
      } catch (error) {
        throw new Error(`Failed to get input actions: ${(error as Error).message}`);
      }
    }
  }
];
