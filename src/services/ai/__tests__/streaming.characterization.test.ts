import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { SSEStreamParser } from '../streaming/sseParser.js';
import { OpenAIDesktopProvider } from '../../../../electron/services/ai/providers/openai.provider.js';
import { browserFallback } from '../../../desktop/browserFallback.js';

describe('Phase 0 Production Streaming Characterization Tests', () => {
  // 1. SSEStreamParser fragmented chunks & split JSON
  it('production path: SSEStreamParser parses fragmented Uint8Array chunks across read calls', () => {
    const parser = new SSEStreamParser();

    // Split 'data: {"choices":[{"delta":{"content":"Hello world"}}]}' across two byte chunks
    const chunk1 = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello');
    const res1 = parser.parseChunk(chunk1);
    expect(res1.tokens).toEqual([]);
    expect(res1.isDone).toBe(false);

    const chunk2 = new TextEncoder().encode(' world"}}]}\n\ndata: [DONE]\n\n');
    const res2 = parser.parseChunk(chunk2);
    expect(res2.tokens).toEqual(['Hello world']);
    expect(res2.isDone).toBe(true);
  });

  // 2. OpenAIDesktopProvider.stream production streaming loop
  it('production path: OpenAIDesktopProvider.stream parses OpenAI SSE stream events and notifies chunk callbacks', async () => {
    const provider = new OpenAIDesktopProvider();
    const mockChunks = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"World!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of mockChunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    );

    const tokens: string[] = [];
    const reasoning: string[] = [];

    const result = await provider.stream(
      {
        requestId: 'req_stream_1',
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Stream test' }],
      },
      'sk-test-key',
      (tokenText, tokenReasoning) => {
        if (tokenText) tokens.push(tokenText);
        if (tokenReasoning) reasoning.push(tokenReasoning);
      }
    );

    expect(tokens.join('')).toBe('Hello World!');
    expect(reasoning.join('')).toBe('Thinking...');
    expect(result.content).toBe('Hello World!');
    expect(result.reasoning).toBe('Thinking...');
  });

  // 3. browserFallback.stream browser proxy client stream parser
  it('production path: browserFallback.stream handles proxy EventSource events and dispatches onToken / onComplete', async () => {
    const onToken = vi.fn();
    const onReasoningToken = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"token","text":"Async "}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"reasoning","text":"reasoning step "}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"token","text":"Stream"}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"type":"done","content":"Async Stream","reasoning":"reasoning step "}\n\n'));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(mockStream, { status: 200 })
    );

    await browserFallback.stream(
      { profileId: 'p1', providerType: 'openai', baseUrl: 'http://localhost:3001/api/ai', model: 'gpt-4o', messages: [] },
      { onToken, onReasoningToken, onComplete, onError }
    );

    expect(onToken).toHaveBeenCalledWith('Async ');
    expect(onToken).toHaveBeenCalledWith('Stream');
    expect(onReasoningToken).toHaveBeenCalledWith('reasoning step ');
    expect(onComplete).toHaveBeenCalledWith('Async Stream', 'reasoning step ');
    expect(onError).not.toHaveBeenCalled();
  });

  // 4. Malformed JSON resilient handling
  it('production path: SSEStreamParser ignores malformed JSON chunks without breaking stream processing', () => {
    const parser = new SSEStreamParser();
    const chunk = new TextEncoder().encode('data: { bad json }\n\ndata: {"choices":[{"delta":{"content":"Valid"}}]}\n\n');
    const res = parser.parseChunk(chunk);
    expect(res.tokens).toEqual(['Valid']);
  });
});
