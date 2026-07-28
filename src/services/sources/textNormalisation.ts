import {
  MAX_PASTED_TEXT_CHARACTERS,
  SourceImportError,
} from './sourceImportTypes';

function validateTextContent(text: string): void {
  let suspiciousControls = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0) throw new SourceImportError('INVALID_TEXT_CONTENT');
    if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) {
      suspiciousControls += 1;
    }
  }
  if (text.length > 0 && suspiciousControls / text.length > 0.1) {
    throw new SourceImportError('INVALID_TEXT_CONTENT');
  }
}

export function decodeUtf8Strict(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SourceImportError('INVALID_TEXT_ENCODING', false, { cause: error });
  }
}

export function normalizeImportedText(
  input: string,
  options: { pasted?: boolean } = {},
): string {
  if (options.pasted && input.length > MAX_PASTED_TEXT_CHARACTERS) {
    throw new SourceImportError('PASTED_TEXT_TOO_LARGE');
  }
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const normalized = withoutBom.replace(/\r\n?/g, '\n');
  validateTextContent(normalized);
  if (!normalized.trim()) throw new SourceImportError('EMPTY_TEXT');
  return normalized;
}

export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
