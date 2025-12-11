import { getGodotConnection } from '../utils/godot_connection.js';

/**
 * Resource for accessing current debugger state including breakpoints and execution status
 */
export const debuggerStateResource = {
  uri: 'godot://debugger/state',
  name: 'Debugger State',
  description: 'Current state of the Godot debugger including breakpoints, sessions, and execution status',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();

    try {
      const result = await godot.sendCommand('debugger_get_current_state', {});
      return {
        text: JSON.stringify(result)
      };
    } catch (error) {
      throw new Error(`Failed to get debugger state: ${(error as Error).message}`);
    }
  }
};

/**
 * Resource for accessing active debugger breakpoints
 */
export const debuggerBreakpointsResource = {
  uri: 'godot://debugger/breakpoints',
  name: 'Debugger Breakpoints',
  description: 'List of all currently set breakpoints in the debugger',
  mimeType: 'application/json',
  async load() {
    const godot = getGodotConnection();

    try {
      const result = await godot.sendCommand('debugger_get_breakpoints', {});
      return {
        text: JSON.stringify(result)
      };
    } catch (error) {
      throw new Error(`Failed to get debugger breakpoints: ${(error as Error).message}`);
    }
  }
};

/**
 * Resource template for accessing debugger call stack information
 */
export const debuggerCallStackResourceTemplate = {
  uriTemplate: 'godot://debugger/call-stack/{sessionId?}',
  name: 'Debugger Call Stack',
  description: 'Call stack information for a specific debug session (or active session if not specified)',
  mimeType: 'application/json',
  arguments: [
    {
      name: 'sessionId' as const,
      description: 'Optional debug session ID (will use active session if not provided)',
      required: false
    }
  ],
  async load({ sessionId }: { sessionId?: string }) {
    const godot = getGodotConnection();

    try {
      const params = sessionId !== undefined ? { session_id: sessionId } : {};
      const result = await godot.sendCommand('debugger_get_call_stack', params);

      return {
        text: JSON.stringify(result)
      };
    } catch (error) {
      throw new Error(`Failed to get debugger call stack: ${(error as Error).message}`);
    }
  }
};

/**
 * Resource template for accessing debugger session information
 */
export const debuggerSessionResourceTemplate = {
  uriTemplate: 'godot://debugger/session/{sessionId}',
  name: 'Debugger Session',
  description: 'Detailed information about a specific debugger session',
  mimeType: 'application/json',
  arguments: [
    {
      name: 'sessionId' as const,
      description: 'Debug session ID',
      required: true
    }
  ],
  async load({ sessionId }: { sessionId: string }) {
    const godot = getGodotConnection();

    try {
      const result = await godot.sendCommand('debugger_get_current_state', {});

      // Filter the state to return only the requested session
      if (result.active_sessions && result.active_sessions.includes(sessionId)) {
        const sessionData = {
          sessionId: sessionId,
          isActive: result.current_session_id === sessionId,
          paused: result.paused,
          currentScript: result.current_script,
          currentLine: result.current_line,
        };

        return {
          text: JSON.stringify(sessionData)
        };
      } else {
        throw new Error(`Session ${sessionId} not found or not active`);
      }
    } catch (error) {
      throw new Error(`Failed to get debugger session info: ${(error as Error).message}`);
    }
  }
};
