import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOURCE_CHUNKING_CONFIG,
  deriveTextChunks,
  SOURCE_CHUNKER_FINGERPRINT,
} from '..';

describe('deterministic local source chunking', () => {
  it('uses a documented stable fingerprint and deterministic output', () => {
    expect(SOURCE_CHUNKER_FINGERPRINT).toBe(
      'aether-text-chunker:v1:max=4000;overlap=400;boundary=paragraph-sentence;units=utf16',
    );
    const text = `${'First paragraph. '.repeat(80)}\n\n${'Second paragraph. '.repeat(80)}`;
    expect(deriveTextChunks(text)).toEqual(deriveTextChunks(text));
  });

  it('keeps small documents in one exact chunk', () => {
    expect(deriveTextChunks('Small document.')).toEqual([{
      ordinal: 0,
      text: 'Small document.',
      tokenEstimate: 4,
      charStart: 0,
      charEnd: 15,
    }]);
  });

  it('prefers paragraph boundaries and applies configured overlap', () => {
    const config = { maximumCharacters: 80, overlapCharacters: 12, minimumBoundaryRatio: 0.5 };
    const text = `${'A'.repeat(48)}\n\n${'B'.repeat(48)}\n\n${'C'.repeat(48)}`;
    const chunks = deriveTextChunks(text, config);
    expect(chunks[0].text.endsWith('\n\n')).toBe(true);
    expect(chunks[1].charStart).toBe(chunks[0].charEnd - config.overlapCharacters);
  });

  it('covers every character without unintended gaps and preserves offsets', () => {
    const text = `${'Paragraph one. '.repeat(150)}\n\n${'Paragraph two? '.repeat(150)}`;
    const chunks = deriveTextChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text).toBe(text.slice(chunk.charStart, chunk.charEnd));
      expect(chunk.charEnd - chunk.charStart).toBeLessThanOrEqual(
        DEFAULT_SOURCE_CHUNKING_CONFIG.maximumCharacters,
      );
    }
    expect(chunks[0].charStart).toBe(0);
    expect(chunks.at(-1)?.charEnd).toBe(text.length);
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index].charStart).toBeLessThanOrEqual(chunks[index - 1].charEnd);
    }
  });

  it('does not let a paragraph delimiter straddle the hard maximum', () => {
    const text = `${'a'.repeat(3_999)}\n\n${'b'.repeat(500)}`;
    const chunks = deriveTextChunks(text);
    expect(chunks[0].charEnd).toBe(4_000);
    expect(chunks.every((chunk) =>
      chunk.charEnd - chunk.charStart <= DEFAULT_SOURCE_CHUNKING_CONFIG.maximumCharacters))
      .toBe(true);
  });

  it('never splits an emoji surrogate pair at a chunk boundary', () => {
    const text = `${'x'.repeat(63)}😀${'y'.repeat(100)}`;
    const chunks = deriveTextChunks(text, {
      maximumCharacters: 64,
      overlapCharacters: 8,
      minimumBoundaryRatio: 1,
    });
    for (const chunk of chunks) {
      expect(chunk.text).not.toMatch(/^[\uDC00-\uDFFF]/u);
      expect(chunk.text).not.toMatch(/[\uD800-\uDBFF]$/u);
      expect(() => new TextEncoder().encode(chunk.text)).not.toThrow();
    }
  });

  it('rejects empty input and invalid configurations', () => {
    expect(() => deriveTextChunks('')).toThrow(/non-whitespace/i);
    expect(() => deriveTextChunks('text', {
      maximumCharacters: 64,
      overlapCharacters: 64,
      minimumBoundaryRatio: 0.5,
    })).toThrow();
  });
});
