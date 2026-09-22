import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Gated full-payload logging: only enabled with GODOT_MCP_DEBUG=1 to avoid
// stringifying multi-MB payloads (base64 captures, full script sources) to stderr.
const DEBUG_PAYLOADS = process.env.GODOT_MCP_DEBUG === '1';

/** Conservative protocol bounds. Captures should use file-based transfer. */
export const GODOT_MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
export const GODOT_MAX_PENDING_COMMANDS = 64;

export interface GodotResponse {
  status: 'success' | 'error';
  result?: any;
  message?: string;
  commandId?: string;
}

export interface GodotCommand {
  type: string;
  params: Record<string, any>;
  commandId: string;
}

export class GodotConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private intentionalClose = false;
  private connectionPromise: Promise<void> | null = null;
  private commandQueue: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private commandId = 0;

  constructor(
    private url: string = 'ws://127.0.0.1:9080',  // Use explicit IP
    private timeout: number = 20000,
    private maxRetries: number = 3,
    private retryDelay: number = 2000
  ) {
    super();
    console.error('GodotConnection created with URL:', this.url);
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connectionPromise) return this.connectionPromise;
    // A (re)connect attempt resets the intentional-close flag, but only when
    // starting a fresh loop - never for a caller joining an existing loop.
    this.intentionalClose = false;
    const promise = this.runConnectLoop();
    // Assignment MUST exist before any socket handler can inspect it: a
    // temporary socket's 'close' fires during the loop and must see a
    // non-null connectionPromise to avoid scheduling a parallel reconnect.
    this.connectionPromise = promise;
    // Use the two-arg then (NOT a bare .finally, which would create an
    // unhandled rejection when the loop fails).
    promise.then(
      () => { if (this.connectionPromise === promise) this.connectionPromise = null; },
      () => { if (this.connectionPromise === promise) this.connectionPromise = null; }
    );
    return promise;
  }

  private async runConnectLoop(): Promise<void> {
    let retries = 0;
    while (retries <= this.maxRetries) {
      // If disconnect() was requested while a (re)connect attempt was
      // already in flight, stop retrying so an explicit disconnect can
      // never leave a live (zombie) socket behind.
      if (this.intentionalClose) {
        return;
      }
      try {
        await this.tryConnect(retries);
        return;
      } catch (error) {
        retries++;
        // disconnect() during an in-flight attempt stops retries
        // immediately instead of sleeping first.
        if (this.intentionalClose) {
          return;
        }
        if (retries <= this.maxRetries) {
          console.error(`Connection attempt failed. Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Schedule exactly one automatic reconnect cycle after `retryDelay`.
   *
   * This is the SINGLE entry point for auto-reconnection, invoked only from an
   * established socket's 'close' handler. It replaces the previous inline
   * setTimeout block and closes the reliability gap where a single exhausted
   * retry loop left the connection down forever.
   *
   * Invariants:
   *  - No-op if disconnect() set intentionalClose, we are already connected, or
   *    a cycle is already pending (reconnectTimer !== null). This guarantees
   *    exactly one outstanding reconnect timer at any time (no fan-out).
   *  - `reconnecting` stays true across ALL automatic cycles: it is cleared only
   *    on a successful connect() (the .then) or by disconnect(). On rejection
   *    (a cycle exhausted while still down) the NEXT cycle is scheduled without
   *    clearing it, so retries repeat until success or explicit disconnect().
   *  - The timer callback re-checks intentional/connected before running, so a
   *    disconnect() or an explicit connect() that succeeds during the delay is
   *    honored instead of opening a redundant socket.
   *  - connect() shares the single connectionPromise: if a loop is already in
   *    flight the callback JOINS it rather than starting a parallel loop.
   */
  private scheduleReconnect(): void {
    if (this.intentionalClose || this.connected || this.reconnectTimer) {
      return;
    }
    this.reconnecting = true;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // disconnect() during the delay, or an explicit connect() already
      // re-established the connection: stop cleanly without a new socket.
      if (this.intentionalClose || this.connected) {
        if (this.connected) {
          this.reconnecting = false;
        }
        return;
      }
      // Invoke the shared connect(). If a loop is already in flight (e.g. an
      // explicit connect() during the delay) this JOINS it via connectionPromise
      // instead of fanning out into a second live retry routine.
      this.connect()
        .then(() => {
          this.reconnecting = false;
        })
        .catch(() => {
          // Cycle exhausted while still down: schedule the next cycle. We do
          // NOT clear reconnecting here, so it stays true across all automatic
          // cycles until success or disconnect().
          this.scheduleReconnect();
        });
    }, this.retryDelay);
  }

  private tryConnect(attempt: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.error(`Connecting to Godot WebSocket server at ${this.url}... (Attempt ${attempt + 1}/${this.maxRetries + 1})`);

      const socket = new WebSocket(this.url, {
        perMessageDeflate: false,
        handshakeTimeout: 10000,
        maxPayload: GODOT_MAX_MESSAGE_BYTES,
        followRedirects: true,
        skipUTF8Validation: true,
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Host': '127.0.0.1:9080'
        }
      });

      this.ws = socket;

      // Declared before `settle` to avoid TDZ. This timeout is owned by the
      // attempt: it terminates THIS socket only and can never touch a newer
      // attempt's socket (stale-attempt safety).
      const connectionTimeout = setTimeout(() => {
        if (!settled) {
          socket.terminate();
          settle(() => reject(new Error('Connection timeout')));
        }
      }, this.timeout);

      let settled = false;
      let connected = false; // local flag for THIS attempt, not this.connected

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectionTimeout); // own and clear its timeout on open/error/close
        fn();
      };

      // Use on() instead of event properties for better error handling.
      // All handlers attach to the LOCAL `socket` only and never touch a
      // different attempt's socket.
      socket.on('open', () => {
        console.error('WebSocket connection established');
        connected = true;
        settle(() => resolve());
        if (this.ws === socket) this.connected = true;
      });

      socket.on('message', (data: Buffer) => {
        try {
          const raw = data.toString();
          if (Buffer.byteLength(raw, 'utf8') > GODOT_MAX_MESSAGE_BYTES) {
            console.error(`Ignoring oversized Godot response (${Buffer.byteLength(raw, 'utf8')} bytes)`);
            return;
          }
          const response: GodotResponse = JSON.parse(raw);
          const responseId = 'commandId' in response
            ? (response.commandId as string)
            : ('event' in response ? String((response as any).event) : 'unknown');
          if (DEBUG_PAYLOADS) {
            console.error('Received response:', response.status, responseId);
            console.error('Payload:', raw.slice(0, 1000) + (raw.length > 1000 ? `... (${raw.length} bytes)` : ''));
          }

          if ('commandId' in response) {
            const commandId = response.commandId as string;
            const pendingCommand = this.commandQueue.get(commandId);

            if (pendingCommand) {
              clearTimeout(pendingCommand.timeout);
              this.commandQueue.delete(commandId);

              if (response.status === 'success') {
                pendingCommand.resolve(response.result);
              } else {
                pendingCommand.reject(new Error(response.message || 'Unknown error'));
              }
            }
          } else if ('event' in response) {
            const eventName = (response as any).event;
            const payload = (response as any).data ?? response;
            this.emit(eventName, payload);
          }
        } catch (error) {
          console.error('Error parsing response:', error);
        }
      });

      socket.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        settle(() => reject(error));
      });

      socket.on('close', (code: number, reason: string) => {
        console.error(`WebSocket closed (code: ${code}, reason: ${reason || 'No reason provided'})`);
        // Settle the attempt if it never opened (prevents a hang).
        settle(() => reject(new Error(`WebSocket closed before connection established (code: ${code})`)));
        // Stale close from an older attempt: complete no-op.
        if (this.ws !== socket) return;
        this.connected = false;
        this.ws = null;

        // Reject pending commands
        this.commandQueue.forEach((command, id) => {
          clearTimeout(command.timeout);
          command.reject(new Error('Connection closed'));
        });
        this.commandQueue.clear();

        // Only an ESTABLISHED socket dropping triggers auto-reconnect. The
        // local `connected` flag is true only for a socket that fired 'open';
        // temporary sockets that fail mid-handshake (local connected === false)
        // are retried by runConnectLoop itself and must NOT schedule a reconnect
        // (that would both fan out and make an initial explicit connect() keep
        // looping forever). scheduleReconnect's guards ensure no overlap.
        if (connected) {
          this.scheduleReconnect();
        }
      });
    });
  }

  async sendCommand<T = any>(type: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.ws || !this.connected) {
      try {
        await this.connect();
      } catch (error) {
        throw new Error(`Failed to connect: ${(error as Error).message}`);
      }
    }

    return new Promise<T>((resolve, reject) => {
      if (this.commandQueue.size >= GODOT_MAX_PENDING_COMMANDS) {
        reject(new Error(`Too many pending Godot commands (limit ${GODOT_MAX_PENDING_COMMANDS}); retry after existing requests complete`));
        return;
      }
      const commandId = `cmd_${this.commandId++}`;
      const command: GodotCommand = { type, params, commandId };
      const data = JSON.stringify(command);
      const payloadBytes = Buffer.byteLength(data, 'utf8');
      if (payloadBytes > GODOT_MAX_MESSAGE_BYTES) {
        reject(new Error(`Godot command ${type} is ${payloadBytes} bytes; maximum is ${GODOT_MAX_MESSAGE_BYTES} bytes`));
        return;
      }

      const timeoutId = setTimeout(() => {
        if (this.commandQueue.has(commandId)) {
          this.commandQueue.delete(commandId);
          reject(new Error(`Response deadline elapsed for ${type}; Godot work may still be running because cancellation is not supported`));
        }
      }, this.timeout);

      this.commandQueue.set(commandId, {
        resolve,
        reject,
        timeout: timeoutId
      });

      if (this.ws?.readyState === WebSocket.OPEN) {
        if (DEBUG_PAYLOADS) {
          console.error('Sending command:', type);
          console.error('Payload:', data.slice(0, 1000) + (data.length > 1000 ? `... (${data.length} bytes)` : ''));
        }
        this.ws.send(data, error => {
          if (!error) return;
          const pending = this.commandQueue.get(commandId);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.commandQueue.delete(commandId);
          pending.reject(new Error(`Failed to send Godot command ${type}: ${error.message}`));
        });
      } else {
        clearTimeout(timeoutId);
        this.commandQueue.delete(commandId);
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  disconnect(): void {
    // 1) Signal intent first so any in-flight loop / pending reconnect timer
    //    stops without spawning a new socket.
    this.intentionalClose = true;
    // 2) Cancel any pending automatic reconnect cycle.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // 3) Reset the auto-reconnect status flag.
    this.reconnecting = false;
    // 4) Close the current socket (if any). Nulling this.ws before the socket's
    //    'close' fires makes the close handler's stale guard a no-op for it.
    const socket = this.ws;
    if (socket) {
      this.commandQueue.forEach((command, commandId) => {
        clearTimeout(command.timeout);
        command.reject(new Error('Connection closed'));
        this.commandQueue.delete(commandId);
      });

      try {
        socket.close(1000, 'Client disconnecting');
      } catch (error) {
        console.error('Error during disconnect:', error);
      }
      // Nulling this.ws BEFORE the socket's 'close' fires makes the close
      // handler's `this.ws !== socket` guard a no-op for this socket.
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

let connectionInstance: GodotConnection | null = null;

/**
 * Mirrors the plugin-side GODOT_MCP_PORT override (websocket_server.gd):
 * the client must dial the same port the editor listens on. Only plain
 * digits in 1024-65535 are accepted; anything else falls back to 9080.
 */
export function resolveWebSocketUrl(host = '127.0.0.1'): string {
  const raw = process.env.GODOT_MCP_PORT?.trim() ?? '';
  const valid = /^\d+$/.test(raw) && Number(raw) >= 1024 && Number(raw) <= 65535;
  return `ws://${host}:${valid ? Number(raw) : 9080}`;
}

export function getGodotConnection(): GodotConnection {
  if (!connectionInstance) {
    connectionInstance = new GodotConnection(resolveWebSocketUrl());
  }
  return connectionInstance;
}
