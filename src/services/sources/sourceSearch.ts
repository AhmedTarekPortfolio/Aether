import { db, type AetherDatabase } from '../../db/database';
import type {
  SourceChunk,
  SourceSegment,
  SourceVersion,
  StudySource,
} from '../../types';
import type {
  PreparedEvidenceExcerpt,
  SourceEvidenceSelection,
} from '../ai/types';
import { sha256Text } from './textNormalisation';

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
    physicalPage: number | null;
    printedPageLabel: string | null;
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

function scoreGroundingText(text: string, normalizedQuery: string, terms: string[]): {
  score: number;
  firstMatch: number;
} {
  const normalized = text.toLocaleLowerCase();
  let score = normalized.includes(normalizedQuery) ? 20 : 0;
  let firstMatch = normalized.length;
  let matched = 0;
  for (const term of terms) {
    const count = occurrenceCount(normalized, term);
    if (count === 0) continue;
    matched += 1;
    score += Math.min(count, 10) * 5;
    firstMatch = Math.min(firstMatch, normalized.indexOf(term));
  }
  if (matched === 0) return { score: 0, firstMatch: -1 };
  if (matched === terms.length && terms.length > 1) score += 8;
  score += Math.max(0, 5 - Math.floor(firstMatch / 100));
  return { score, firstMatch };
}

export interface SourceGroundingCandidate {
  source: StudySource;
  version: SourceVersion;
  segment: SourceSegment;
  excerpt: string;
  score: number;
  locator: string;
  sourceOrder: number;
}

export interface SourceGroundingCandidateRequest {
  userId: string;
  subjectId: string;
  query: string;
  selections: SourceEvidenceSelection[];
  maximumCandidateSegments: number;
}

function isSelectedSegment(
  segment: SourceSegment,
  selection: SourceEvidenceSelection,
): boolean {
  if (selection.segmentIds?.length && !selection.segmentIds.includes(segment.id)) return false;
  if (selection.pageRanges?.length) {
    if (segment.physicalPage === null) return false;
    return selection.pageRanges.some(
      (range) => segment.physicalPage! >= range.start && segment.physicalPage! <= range.end,
    );
  }
  return true;
}

export function groundingLocator(segment: SourceSegment): string {
  if (segment.physicalPage !== null) {
    return `Physical page ${segment.physicalPage}${
      segment.printedPageLabel ? ` (printed label ${segment.printedPageLabel})` : ''
    }`;
  }
  if (segment.lineStart !== null) {
    return segment.lineEnd !== null && segment.lineEnd !== segment.lineStart
      ? `Lines ${segment.lineStart}–${segment.lineEnd}`
      : `Line ${segment.lineStart}`;
  }
  return segment.heading ? `Section: ${segment.heading}` : `Segment ${segment.ordinal}`;
}

export async function getSourceGroundingCandidates(
  request: SourceGroundingCandidateRequest,
  database: AetherDatabase = db,
): Promise<SourceGroundingCandidate[]> {
  const normalizedQuery = request.query.trim().toLocaleLowerCase();
  const terms = queryTerms(request.query);
  if (!request.subjectId || !normalizedQuery || terms.length === 0) return [];
  const subject = await database.subjects.get(request.subjectId);
  if (!subject || (subject.userId ?? 'default_user') !== request.userId) return [];
  const maximumCandidateSegments = Math.max(1, request.maximumCandidateSegments);
  const associatedSourceIds = new Set(
    (await database.source_associations
      .where('[targetType+targetId]')
      .equals(['subject', request.subjectId])
      .toArray())
      .filter((association) => association.userId === request.userId)
      .map((association) => association.sourceId),
  );

  const candidates: SourceGroundingCandidate[] = [];
  let candidateSegments = 0;
  for (const [sourceOrder, selection] of request.selections.entries()) {
    if (candidateSegments >= maximumCandidateSegments) break;
    const source = await database.study_sources.get(selection.sourceId);
    if (
      !source
      || source.userId !== request.userId
      || source.status !== 'active'
      || !source.currentVersionId
      || !associatedSourceIds.has(source.id)
      || !['txt', 'markdown', 'pdf', 'pasted-text'].includes(source.sourceType)
    ) continue;
    const version = await database.source_versions.get(source.currentVersionId);
    if (
      !version
      || version.userId !== request.userId
      || version.sourceId !== source.id
      || !['ready', 'partially_ready'].includes(version.status)
    ) continue;
    const segments = (await database.source_segments
      .where('sourceVersionId')
      .equals(version.id)
      .sortBy('ordinal'))
      .filter((segment) =>
        segment.userId === request.userId
        && segment.sourceId === source.id
        && isSelectedSegment(segment, selection));

    for (const segment of segments) {
      if (candidateSegments >= maximumCandidateSegments) break;
      candidateSegments += 1;
      const chunks = await database.source_chunks.where('segmentId').equals(segment.id).toArray();
      const texts = chunks.length > 0
        ? chunks
          .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id))
          .map((chunk) => chunk.text)
        : [segment.text];
      let best: { text: string; score: number; firstMatch: number } | null = null;
      for (const text of texts) {
        const scored = scoreGroundingText(text, normalizedQuery, terms);
        if (
          scored.score > 0
          && (!best || scored.score > best.score
            || (scored.score === best.score && text.localeCompare(best.text) < 0))
        ) {
          best = { text, ...scored };
        }
      }
      if (!best) continue;
      candidates.push({
        source,
        version,
        segment,
        excerpt: excerptFor(best.text, best.firstMatch),
        score: best.score,
        locator: groundingLocator(segment),
        sourceOrder,
      });
    }
  }

  return candidates.sort((left, right) =>
    right.score - left.score
    || left.sourceOrder - right.sourceOrder
    || left.segment.ordinal - right.segment.ordinal
    || left.segment.id.localeCompare(right.segment.id));
}

export async function validateSourceGroundingEvidence(
  evidence: PreparedEvidenceExcerpt[],
  userId: string,
  subjectId: string,
  database: AetherDatabase = db,
): Promise<boolean> {
  const subject = await database.subjects.get(subjectId);
  if (!subject || (subject.userId ?? 'default_user') !== userId) return false;
  for (const item of evidence) {
    if (
      item.evidenceType !== 'source_segment'
      || !item.importedSourceId
      || !item.sourceVersionId
      || !item.segmentId
    ) return false;
    const [source, version, segment, association] = await Promise.all([
      database.study_sources.get(item.importedSourceId),
      database.source_versions.get(item.sourceVersionId),
      database.source_segments.get(item.segmentId),
      database.source_associations
        .where('[sourceId+targetType+targetId]')
        .equals([item.importedSourceId, 'subject', subjectId])
        .first(),
    ]);
    if (
      !source || source.userId !== userId || source.status !== 'active'
      || source.currentVersionId !== item.sourceVersionId
      || !version || version.userId !== userId || version.sourceId !== source.id
      || !['ready', 'partially_ready'].includes(version.status)
      || !segment || segment.userId !== userId || segment.sourceId !== source.id
      || segment.sourceVersionId !== version.id
      || segment.textHash !== item.contentHash
      || await sha256Text(segment.text) !== item.contentHash
      || item.title !== source.displayName
      || item.locator !== groundingLocator(segment)
      || item.sourceType !== source.sourceType
      || item.physicalPage !== segment.physicalPage
      || item.printedPageLabel !== segment.printedPageLabel
      || !association || association.userId !== userId
    ) return false;
  }
  return true;
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
        || source.sourceType === 'pdf'
        || source.sourceType === 'pasted-text'))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
      || left.id.localeCompare(right.id));

  const results: SourceSearchResult[] = [];
  let candidateCount = 0;
  for (const source of sources) {
    if (candidateCount >= maximumCandidateChunks) break;
    const version = await database.source_versions.get(source.currentVersionId!);
    if (
      !version
      || (version.status !== 'ready' && version.status !== 'partially_ready')
      || version.userId !== request.userId
    ) continue;
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
          physicalPage: segment.physicalPage,
          printedPageLabel: segment.printedPageLabel,
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
