import { describe, it, expect } from 'vitest';
import { SSEStreamParser } from '../streaming/sseParser';

describe('SSE Stream Parser (src/services/ai/streaming/sseParser.ts)', () => {
  it('1. Parses single data line chunk correctly', () => {
    const parser = new SSEStreamParser();
    const encoder = new TextEncoder();

    const chunk = encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
    const { tokens, isDone } = parser.parseChunk(chunk);

    expect(tokens).toEqual(['Hello']);
    expect(isDone).toBe(false);
  });

  it('2. Handles split lines across chunks', () => {
    const parser = new SSEStreamParser();
    const encoder = new TextEncoder();

    const part1 = encoder.encode('data: {"choices":[{"delta":{"content":"Wor');
    const part2 = encoder.encode('ld"}}]}\n\n');

    const res1 = parser.parseChunk(part1);
    expect(res1.tokens).toEqual([]);

    const res2 = parser.parseChunk(part2);
    expect(res2.tokens).toEqual(['World']);
  });

  it('3. Handles multiple SSE events in a single chunk', () => {
    const parser = new SSEStreamParser();
    const encoder = new TextEncoder();

    const chunk = encoder.encode(
      'data: {"choices":[{"delta":{"content":"Foo"}}]}\n' +
      'data: {"choices":[{"delta":{"content":" Bar"}}]}\n\n'
    );

    const { tokens } = parser.parseChunk(chunk);
    expect(tokens).toEqual(['Foo', ' Bar']);
  });

  it('4. Detects data: [DONE] stream termination token', () => {
    const parser = new SSEStreamParser();
    const encoder = new TextEncoder();

    const chunk = encoder.encode('data: [DONE]\n\n');
    const { isDone } = parser.parseChunk(chunk);

    expect(isDone).toBe(true);
  });

  it('5. Handles malformed JSON chunks gracefully without crashing', () => {
    const parser = new SSEStreamParser();
    const encoder = new TextEncoder();

    const chunk = encoder.encode('data: {malformed json chunk}\n\n');
    const { tokens } = parser.parseChunk(chunk);

    expect(tokens).toEqual([]);
  });
});
