import { describe, expect, it } from 'vitest';
import {
  decodeUtf8Strict,
  MAX_PASTED_TEXT_CHARACTERS,
  normalizeImportedText,
  sha256Text,
} from '..';

describe('source text normalisation', () => {
  it('removes one UTF-8 BOM and normalises CRLF and CR to LF', () => {
    expect(normalizeImportedText('\ufeffone\r\ntwo\rthree\n')).toBe('one\ntwo\nthree\n');
  });

  it.each([
    'Arabic العربية محفوظة',
    'Mixed English والعربية together',
    'Emoji remain paired 😀🚀',
    `${'x'.repeat(20_000)}\nlong line`,
    '---\ntitle: Front matter\n---\n# Markdown',
  ])('preserves supported Unicode and document text: %s', (text) => {
    expect(normalizeImportedText(text)).toBe(text);
  });

  it.each(['', '   \n\t', '\ufeff\r\n  '])('rejects empty or whitespace-only text', (text) => {
    expect(() => normalizeImportedText(text)).toThrow(/non-whitespace/i);
  });

  it('rejects NUL-heavy or unsupported control content', () => {
    expect(() => normalizeImportedText('safe\0unsafe')).toThrow(/binary/i);
    expect(() => normalizeImportedText('\u0001\u0002\u0003x')).toThrow(/binary/i);
  });

  it('strictly decodes UTF-8 and rejects invalid byte sequences', () => {
    expect(decodeUtf8Strict(new TextEncoder().encode('مرحبا 😀'))).toBe('مرحبا 😀');
    expect(() => decodeUtf8Strict(new Uint8Array([0xc3, 0x28]))).toThrow(/UTF-8/i);
  });

  it('enforces the central pasted-text bound', () => {
    expect(() => normalizeImportedText('x'.repeat(MAX_PASTED_TEXT_CHARACTERS + 1), {
      pasted: true,
    })).toThrow(/million-character/i);
  });

  it('hashes normalized UTF-8 text deterministically', async () => {
    await expect(sha256Text('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
