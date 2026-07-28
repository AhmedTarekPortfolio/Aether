import type { SourceChunk } from '../../types';
import { SourceImportError } from './sourceImportTypes';

export interface SourceChunkingConfig {
  maximumCharacters: number;
  overlapCharacters: number;
  minimumBoundaryRatio: number;
}

export const DEFAULT_SOURCE_CHUNKING_CONFIG = Object.freeze({
  maximumCharacters: 4_000,
  overlapCharacters: 400,
  minimumBoundaryRatio: 0.6,
}) satisfies SourceChunkingConfig;

export const SOURCE_CHUNKER_FINGERPRINT =
  'aether-text-chunker:v1:max=4000;overlap=400;boundary=paragraph-sentence;units=utf16';

export interface DerivedTextChunk {
  ordinal: number;
  text: string;
  tokenEstimate: number;
  charStart: number;
  charEnd: number;
}

function beforeLowSurrogate(text: string, index: number): number {
  if (
    index > 0
    && index < text.length
    && text.charCodeAt(index) >= 0xdc00
    && text.charCodeAt(index) <= 0xdfff
    && text.charCodeAt(index - 1) >= 0xd800
    && text.charCodeAt(index - 1) <= 0xdbff
  ) {
    return index - 1;
  }
  return index;
}

function preferredBoundary(text: string, start: number, hardEnd: number, minimum: number): number {
  // The second newline must also remain inside the hard maximum. Searching from
  // hardEnd - 1 can match a delimiter that straddles hardEnd and create a
  // maximumCharacters + 1 chunk.
  const paragraph = text.lastIndexOf('\n\n', Math.max(start, hardEnd - 2));
  if (paragraph >= minimum) return paragraph + 2;

  for (let index = hardEnd - 1; index >= minimum; index -= 1) {
    const character = text[index];
    const next = text[index + 1];
    if (
      (character === '.' || character === '!' || character === '?' || character === '؟')
      && (next === undefined || /\s/u.test(next))
    ) {
      return index + 1;
    }
    if (character === '\n') return index + 1;
  }
  return hardEnd;
}

export function deriveTextChunks(
  text: string,
  config: SourceChunkingConfig = DEFAULT_SOURCE_CHUNKING_CONFIG,
): DerivedTextChunk[] {
  if (!text.length) throw new SourceImportError('EMPTY_TEXT');
  if (
    !Number.isSafeInteger(config.maximumCharacters)
    || !Number.isSafeInteger(config.overlapCharacters)
    || config.maximumCharacters < 32
    || config.overlapCharacters < 0
    || config.overlapCharacters >= config.maximumCharacters
    || config.minimumBoundaryRatio <= 0
    || config.minimumBoundaryRatio > 1
  ) {
    throw new SourceImportError('INVALID_REQUEST');
  }

  const chunks: DerivedTextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = beforeLowSurrogate(
      text,
      Math.min(text.length, start + config.maximumCharacters),
    );
    const minimum = start + Math.floor(config.maximumCharacters * config.minimumBoundaryRatio);
    let end = hardEnd === text.length
      ? hardEnd
      : preferredBoundary(text, start, hardEnd, Math.min(minimum, hardEnd));
    end = beforeLowSurrogate(text, end);
    if (end <= start) end = hardEnd;

    const chunkText = text.slice(start, end);
    chunks.push({
      ordinal: chunks.length,
      text: chunkText,
      tokenEstimate: Math.max(1, Math.ceil(Array.from(chunkText).length / 4)),
      charStart: start,
      charEnd: end,
    });
    if (end >= text.length) break;
    const nextStart = beforeLowSurrogate(text, Math.max(start + 1, end - config.overlapCharacters));
    start = nextStart > start ? nextStart : end;
  }
  return chunks;
}

export function materializeSourceChunks(
  derived: DerivedTextChunk[],
  input: {
    userId: string;
    sourceVersionId: string;
    segmentId: string;
    createdAt: number;
    createId: () => string;
  },
): SourceChunk[] {
  return derived.map((chunk) => ({
    id: input.createId(),
    userId: input.userId,
    sourceVersionId: input.sourceVersionId,
    segmentId: input.segmentId,
    chunkerFingerprint: SOURCE_CHUNKER_FINGERPRINT,
    ordinal: chunk.ordinal,
    text: chunk.text,
    tokenEstimate: chunk.tokenEstimate,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    createdAt: input.createdAt,
  }));
}
