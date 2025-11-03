import WebSocket from 'ws';
import { EventEmitter } from 'events';

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

    let retries = 0;

    const tryConnect = (): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        console.error(`Connecting to Godot WebSocket server at ${this.url}... (Attempt ${retries + 1}/${this.maxRetries + 1})`);

        this.ws = new WebSocket(this.url, {
          perMessageDeflate: false,
          handshakeTimeout: 10000,
          maxPayload: 64 * 1024 * 1024, // 64MB to match Godot
          followRedirects: true,
          skipUTF8Validation: true,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Host': '127.0.0.1:9080'
          }
        });

        // Use on() instead of event properties for better error handling
        this.ws.on('open', () => {
          console.error('WebSocket connection established');
          this.connected = true;
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const response: GodotResponse = JSON.parse(data.toString());
            console.error('Received response:', response);

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

        this.ws.on('error', (error: Error) => {
          console.error('WebSocket error:', error);
          if (!this.connected) {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          console.error(`WebSocket closed (code: ${code}, reason: ${reason || 'No reason provided'})`);
          this.connected = false;
          this.ws = null;

          // Reject pending commands
          this.commandQueue.forEach((command, id) => {
            clearTimeout(command.timeout);
            command.reject(new Error('Connection closed'));
          });
          this.commandQueue.clear();

          if (!this.reconnecting && this.connected) {
            this.reconnecting = true;
            setTimeout(() => {
              this.reconnecting = false;
              this.connect().catch(() => {
                // Silent catch for reconnect failure
              });
            }, this.retryDelay);
          }
        });

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (!this.connected) {
            if (this.ws) {
              this.ws.terminate();
              this.ws = null;
            }
            reject(new Error('Connection timeout'));
          }
        }, this.timeout);

        // Clear timeout when connected
        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
        });
      });
    };

    while (retries <= this.maxRetries) {
      try {
        await tryConnect();
        return;
      } catch (error) {
        retries++;
        
        if (retries <= this.maxRetries) {
          console.error(`Connection attempt failed. Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        } else {
          throw error;
        }
      }
    }
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
      const commandId = `cmd_${this.commandId++}`;
      const command: GodotCommand = { type, params, commandId };

      const timeoutId = setTimeout(() => {
        if (this.commandQueue.has(commandId)) {
          this.commandQueue.delete(commandId);
          reject(new Error(`Command timed out: ${type}`));
        }
      }, this.timeout);

      this.commandQueue.set(commandId, {
        resolve,
        reject,
        timeout: timeoutId
      });

      if (this.ws?.readyState === WebSocket.OPEN) {
        const data = JSON.stringify(command);
        console.error('Sending command:', data);
        this.ws.send(data);
      } else {
        clearTimeout(timeoutId);
        this.commandQueue.delete(commandId);
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.commandQueue.forEach((command, commandId) => {
        clearTimeout(command.timeout);
        command.reject(new Error('Connection closed'));
        this.commandQueue.delete(commandId);
      });

      try {
        this.ws.close(1000, 'Client disconnecting');
      } catch (error) {
        console.error('Error during disconnect:', error);
      }
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

let connectionInstance: GodotConnection | null = null;

export function getGodotConnection(): GodotConnection {
  if (!connectionInstance) {
    connectionInstance = new GodotConnection();
  }
  return connectionInstance;
}
