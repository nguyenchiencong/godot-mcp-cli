/** A bounded cursor buffer for asynchronous Godot debug-output events.
 * Stdout is reserved for MCP transport frames; frames are retained here.
 */
export interface DebugOutputRead {
  lines: string[];
  text: string;
  reset: boolean;
  truncated: boolean;
  dropped_lines: number;
  next_cursor: number;
}

interface Entry { cursor: number; text: string; }

export class DebugOutputBuffer {
  private entries: Entry[] = [];
  private bytes = 0;
  private cursor = 0;
  private droppedLines = 0;
  private resetPending = false;

  constructor(readonly maxLines = 1000, readonly maxBytes = 128 * 1024) {
    if (!Number.isInteger(maxLines) || maxLines < 1) throw new Error('maxLines must be positive');
    if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be positive');
  }

  appendFrame(frame: unknown): void {
    if (!frame || typeof frame !== 'object') return;
    const value = frame as Record<string, unknown>;
    if (value.reset === true) this.resetPending = true;
    const lines = Array.isArray(value.lines)
      ? value.lines.map(String)
      : typeof value.chunk === 'string' ? value.chunk.split(/\r?\n/) : [];
    lines.filter(line => line.length > 0).forEach(line => this.append(line));
  }

  append(line: string): void {
    const text = String(line);
    this.cursor += 1;
    this.entries.push({ cursor: this.cursor, text });
    this.bytes += Buffer.byteLength(text, 'utf8');
    while (this.entries.length > this.maxLines || this.bytes > this.maxBytes) {
      const removed = this.entries.shift();
      if (!removed) break;
      this.bytes -= Buffer.byteLength(removed.text, 'utf8');
      this.droppedLines += 1;
    }
  }

  clear(): void {
    // Dropping entries starts a fresh stream: zero the drop counter too, while
    // still flagging the reset for readers holding old cursors.
    this.entries = [];
    this.bytes = 0;
    this.droppedLines = 0;
    this.resetPending = true;
  }

  read(afterCursor?: number): DebugOutputRead {
    const requested = afterCursor === undefined ? 0 : Math.max(0, Math.floor(afterCursor));
    const firstCursor = this.entries[0]?.cursor ?? this.cursor + 1;
    const truncated = requested > 0 && requested < firstCursor - 1;
    const selected = this.entries.filter(entry => entry.cursor > requested);
    const result: DebugOutputRead = {
      lines: selected.map(entry => entry.text),
      text: selected.map(entry => entry.text).join('\n'),
      reset: this.resetPending,
      truncated,
      dropped_lines: this.droppedLines,
      next_cursor: this.cursor,
    };
    this.resetPending = false;
    return result;
  }

  snapshot(): DebugOutputRead { return this.read(0); }
}

