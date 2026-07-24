/**
 * Robust SSE Stream Parser handling split network chunks, multiple lines per chunk,
 * `data: [DONE]`, malformed JSON, and UTF-8 buffer boundaries.
 */
export class SSEStreamParser {
  private buffer: string = '';
  private decoder: TextDecoder = new TextDecoder('utf-8');

  /**
   * Processes raw Uint8Array chunk value from ReadableStream.
   * Returns parsed data strings (e.g. JSON strings or token text).
   */
  public parseChunk(chunkValue: Uint8Array): { tokens: string[]; isDone: boolean } {
    const text = this.decoder.decode(chunkValue, { stream: true });
    this.buffer += text;

    const tokens: string[] = [];
    let isDone = false;

    // Split on newlines
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line === 'data: [DONE]') {
        isDone = true;
        continue;
      }

      if (line.startsWith('data: ')) {
        const jsonContent = line.slice(6).trim();
        if (!jsonContent) continue;

        try {
          const parsed = JSON.parse(jsonContent);
          const deltaToken =
            parsed.choices?.[0]?.delta?.content ||
            parsed.choices?.[0]?.text ||
            parsed.delta?.text ||
            '';

          if (deltaToken) {
            tokens.push(deltaToken);
          }
        } catch {
          // Ignore malformed or incomplete JSON events
        }
      }
    }

    return { tokens, isDone };
  }

  /**
   * Flush remaining buffer upon stream end.
   */
  public flush(): string[] {
    const tokens: string[] = [];
    const line = this.buffer.trim();
    this.buffer = '';

    if (line && line.startsWith('data: ') && line !== 'data: [DONE]') {
      try {
        const parsed = JSON.parse(line.slice(6));
        const deltaToken = parsed.choices?.[0]?.delta?.content || '';
        if (deltaToken) tokens.push(deltaToken);
      } catch {
        // Ignore
      }
    }
    return tokens;
  }
}
