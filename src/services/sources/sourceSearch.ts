import { db, type AetherDatabase } from '../../db/database';
import type {
  SourceChunk,
  SourceSegment,
  SourceVersion,
  StudySource,
} from '../../types';

export const MAX_SOURCE_SEARCH_RESULTS = 25;
export const MAX_SOURCE_SEARCH_CANDIDATE_CHUNKS = 5_000;

export interface SourceSearchRequest {
  userId: string;
  subjectId: string;
  query: string;
  sourceIds?: string[];
  maximumResults?: number;
  maximumCandidateChunks?: number;
}

export interface SourceSearchResult {
  source: StudySource;
  version: SourceVersion;
  segment: SourceSegment;
  chunk: SourceChunk;
  excerpt: string;
  score: number;
  locator: {
    charStart: number;
    charEnd: number;
    lineStart: number | null;
    lineEnd: number | null;
  };
}

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []),
  ).slice(0, 12);
}

function occurrenceCount(haystack: string, needle: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor < haystack.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    count += 1;
    cursor = found + Math.max(needle.length, 1);
  }
  return count;
}

function scoreChunk(text: string, normalizedQuery: string, terms: string[]): {
  score: number;
  firstMatch: number;
} {
  const normalized = text.toLocaleLowerCase();
  let score = normalized.includes(normalizedQuery) ? 20 : 0;
  let firstMatch = normalized.length;
  let orderedCursor = -1;
  let ordered = true;
  for (const term of terms) {
    const count = occurrenceCount(normalized, term);
    if (count === 0) return { score: 0, firstMatch: -1 };
    score += Math.min(count, 10) * 5;
    const index = normalized.indexOf(term);
    firstMatch = Math.min(firstMatch, index);
    if (index < orderedCursor) ordered = false;
    orderedCursor = index;
  }
  if (ordered && terms.length > 1) score += 8;
  score += Math.max(0, 5 - Math.floor(firstMatch / 100));
  return { score, firstMatch };
}

function excerptFor(text: string, match: number): string {
  const maximum = 240;
  if (text.length <= maximum) return text;
  const start = Math.max(0, match - 80);
  const end = Math.min(text.length, start + maximum);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export async function searchImportedSources(
  request: SourceSearchRequest,
  database: AetherDatabase = db,
): Promise<SourceSearchResult[]> {
  const trimmed = request.query.trim();
  const terms = queryTerms(trimmed);
  if (!trimmed || terms.length === 0 || !request.subjectId) return [];
  const maximumResults = Math.min(
    MAX_SOURCE_SEARCH_RESULTS,
    Math.max(1, request.maximumResults ?? 10),
  );
  const maximumCandidateChunks = Math.min(
    MAX_SOURCE_SEARCH_CANDIDATE_CHUNKS,
    Math.max(1, request.maximumCandidateChunks ?? MAX_SOURCE_SEARCH_CANDIDATE_CHUNKS),
  );
  const subjectSourceIds = new Set(
    (await database.source_associations
      .where('[targetType+targetId]')
      .equals(['subject', request.subjectId])
      .toArray())
      .filter((association) => association.userId === request.userId)
      .map((association) => association.sourceId),
  );
  const requestedIds = request.sourceIds?.length ? new Set(request.sourceIds) : null;
  const sources = (await database.study_sources.where('userId').equals(request.userId).toArray())
    .filter((source) =>
      source.status === 'active'
      && source.currentVersionId
      && subjectSourceIds.has(source.id)
      && (!requestedIds || requestedIds.has(source.id))
      && (source.sourceType === 'txt'
        || source.sourceType === 'markdown'
        || source.sourceType === 'pasted-text'))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
      || left.id.localeCompare(right.id));

  const results: SourceSearchResult[] = [];
  let candidateCount = 0;
  for (const source of sources) {
    if (candidateCount >= maximumCandidateChunks) break;
    const version = await database.source_versions.get(source.currentVersionId!);
    if (!version || version.status !== 'ready' || version.userId !== request.userId) continue;
    const chunks = (await database.source_chunks
      .where('sourceVersionId')
      .equals(version.id)
      .limit(maximumCandidateChunks - candidateCount)
      .toArray())
      .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id));
    candidateCount += chunks.length;
    for (const chunk of chunks) {
      const scored = scoreChunk(chunk.text, trimmed.toLocaleLowerCase(), terms);
      if (scored.score <= 0) continue;
      const segment = await database.source_segments.get(chunk.segmentId);
      if (!segment || segment.userId !== request.userId) continue;
      results.push({
        source,
        version,
        segment,
        chunk,
        excerpt: excerptFor(chunk.text, scored.firstMatch),
        score: scored.score,
        locator: {
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          lineStart: segment.lineStart,
          lineEnd: segment.lineEnd,
        },
      });
    }
  }

  return results
    .sort((left, right) =>
      right.score - left.score
      || left.source.displayName.localeCompare(right.source.displayName)
      || left.chunk.ordinal - right.chunk.ordinal
      || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, maximumResults);
}
