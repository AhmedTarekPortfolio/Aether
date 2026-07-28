import { describe, expect, it } from 'vitest';
import {
  identifySupportedSourceFile,
  sanitizeOriginalFilename,
  validateSourceSignature,
} from '../services/sources/source-file-validation';

const signatures = {
  pdf: Buffer.from('%PDF-1.7\n'),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  webp: Buffer.from('RIFF1234WEBP', 'ascii'),
};

describe('source file type and signature validation', () => {
  it.each([
    ['notes.txt', 'text', 'txt', 'text/plain'],
    ['notes.md', 'markdown', 'md', 'text/markdown'],
    ['notes.markdown', 'markdown', 'markdown', 'text/markdown'],
    ['paper.pdf', 'pdf', 'pdf', 'application/pdf'],
    ['scan.PNG', 'image', 'png', 'image/png'],
    ['photo.jpeg', 'image', 'jpg', 'image/jpeg'],
    ['photo.webp', 'image', 'webp', 'image/webp'],
  ])('recognizes %s without parsing it', (filename, kind, extension, mimeType) => {
    expect(identifySupportedSourceFile(filename)).toEqual({ kind, extension, mimeType });
  });

  it('rejects unsupported extensions and extension/signature contradictions', () => {
    expect(() => identifySupportedSourceFile('notes.docx')).toThrow();
    expect(() => validateSourceSignature(
      identifySupportedSourceFile('fake.pdf'),
      signatures.png,
    )).toThrow();
  });

  it('accepts required binary signatures and rejects binary-looking text', () => {
    validateSourceSignature(identifySupportedSourceFile('a.pdf'), signatures.pdf);
    validateSourceSignature(identifySupportedSourceFile('a.png'), signatures.png);
    validateSourceSignature(identifySupportedSourceFile('a.jpg'), signatures.jpg);
    validateSourceSignature(identifySupportedSourceFile('a.webp'), signatures.webp);
    validateSourceSignature(identifySupportedSourceFile('a.txt'), Buffer.from('مرحبا\nstudy'));
    expect(() => validateSourceSignature(
      identifySupportedSourceFile('a.md'),
      Buffer.from([0, 1, 2, 3]),
    )).toThrow();
  });

  it('preserves Unicode while removing controls and path separators from display names', () => {
    expect(sanitizeOriginalFilename('دراسة\u0000:الفصل?.txt')).toBe('دراسة_الفصل_.txt');
    expect(sanitizeOriginalFilename('folder/name.txt')).toBe('name.txt');
  });
});
