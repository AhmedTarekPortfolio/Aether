import path from 'node:path';
import type { SourceFileKind } from '../../types/source-storage.js';
import { SourceStorageError } from './source-storage-errors.js';

export interface SupportedSourceFile {
  kind: SourceFileKind;
  extension: string;
  mimeType: string;
}

const FILE_TYPES: Record<string, SupportedSourceFile> = {
  '.txt': { kind: 'text', extension: 'txt', mimeType: 'text/plain' },
  '.md': { kind: 'markdown', extension: 'md', mimeType: 'text/markdown' },
  '.markdown': { kind: 'markdown', extension: 'markdown', mimeType: 'text/markdown' },
  '.pdf': { kind: 'pdf', extension: 'pdf', mimeType: 'application/pdf' },
  '.png': { kind: 'image', extension: 'png', mimeType: 'image/png' },
  '.jpg': { kind: 'image', extension: 'jpg', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', extension: 'jpg', mimeType: 'image/jpeg' },
  '.webp': { kind: 'image', extension: 'webp', mimeType: 'image/webp' },
};

export const SUPPORTED_SOURCE_EXTENSIONS = Object.freeze(Object.keys(FILE_TYPES)
  .map((extension) => extension.slice(1)));

export function identifySupportedSourceFile(filename: string): SupportedSourceFile {
  const result = FILE_TYPES[path.extname(filename).toLowerCase()];
  if (!result) throw new SourceStorageError('UNSUPPORTED_FILE_TYPE');
  return result;
}

function startsWith(bytes: Buffer, signature: readonly number[]): boolean {
  return bytes.length >= signature.length
    && signature.every((value, index) => bytes[index] === value);
}

function validateTextSample(sample: Buffer): boolean {
  if (sample.length === 0) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) suspicious += 1;
  }
  return suspicious / sample.length <= 0.1;
}

export function validateSourceSignature(type: SupportedSourceFile, sample: Buffer): void {
  let valid = false;
  if (type.kind === 'text' || type.kind === 'markdown') {
    valid = validateTextSample(sample);
  } else if (type.extension === 'pdf') {
    valid = startsWith(sample, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  } else if (type.extension === 'png') {
    valid = startsWith(sample, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  } else if (type.extension === 'jpg') {
    valid = startsWith(sample, [0xff, 0xd8, 0xff]);
  } else if (type.extension === 'webp') {
    valid = sample.length >= 12
      && sample.subarray(0, 4).toString('ascii') === 'RIFF'
      && sample.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (!valid) throw new SourceStorageError('FILE_SIGNATURE_MISMATCH');
}

export function sanitizeOriginalFilename(filename: string): string {
  const displayName = path.basename(filename)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!displayName) throw new SourceStorageError('UNSUPPORTED_FILE_TYPE');
  return [...displayName].slice(0, 255).join('');
}
