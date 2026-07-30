import { getNotes } from '../../api/noteApi';
import { getSubjects } from '../../api/subjectApi';
import {
  getSourceGroundingCandidates,
  validateSourceGroundingEvidence,
} from '../sources/sourceSearch';
import { sha256Text } from '../sources/textNormalisation';
import {
  PreparedEvidenceExcerpt,
  RetrievalOutcome,
  SourceEvidenceSelection,
} from './types';

export const MAX_GROUNDING_SOURCES = 5;
export const MAX_EXCERPT_CHARACTERS = 600;
export const MAX_TOTAL_GROUNDING_CHARACTERS = 2_400;
export const MAX_SELECTED_IMPORTED_SOURCES = 5;
export const MAX_SOURCE_CANDIDATE_SEGMENTS = 200;
export const MAX_SOURCE_EVIDENCE_ITEMS = 5;
export const MAX_SOURCE_EXCERPT_CHARACTERS = 1_200;
export const MAX_TOTAL_SOURCE_CHARACTERS = 4_800;
export const MAX_TOTAL_EVIDENCE_ITEMS = 8;
export const MAX_TOTAL_EVIDENCE_CHARACTERS = 7_200;
export const DEFAULT_PROVIDER_CONTEXT_TOKENS = 8_192;
export const APPROXIMATE_CHARACTERS_PER_TOKEN = 4;
export const EVIDENCE_CONTEXT_FRACTION = 0.75;
const RETRIEVAL_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'does', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where',
  'which', 'who', 'why', 'with',
]);

export interface LocalRetrievalOptions {
  selectedNoteIds: string[];
  subjectId: string;
  userId: string;
  signal?: AbortSignal;
}

export interface SourceRetrievalOptions {
  selections: SourceEvidenceSelection[];
  subjectId: string;
  userId: string;
  signal?: AbortSignal;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError');
}

export function normalizeRetrievalTokens(value: string): string[] {
  return [...new Set(
    value.normalize('NFKC').toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length > 1 && !RETRIEVAL_STOP_WORDS.has(token)) ?? [],
  )];
}

function countMatches(value: string, tokens: string[]): number {
  const normalized = value.normalize('NFKC').toLocaleLowerCase();
  return tokens.reduce((total, token) => total + (normalized.includes(token) ? 1 : 0), 0);
}

function matchingWindow(content: string, tokens: string[]): string {
  const normalized = content.normalize('NFKC').toLocaleLowerCase();
  const positions = tokens
    .map((token) => normalized.indexOf(token))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);
  const center = positions[0] ?? 0;
  const start = Math.max(0, center - Math.floor(MAX_EXCERPT_CHARACTERS / 3));
  const end = Math.min(content.length, start + MAX_EXCERPT_CHARACTERS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

export async function performLocalRetrieval(
  query: string,
  options: LocalRetrievalOptions,
): Promise<RetrievalOutcome> {
  abortIfNeeded(options.signal);
  const tokens = normalizeRetrievalTokens(query);
  if (tokens.length === 0 || options.selectedNoteIds.length === 0) {
    return { status: 'no-evidence', excerpts: [] };
  }

  try {
    const [notes, subjects] = await Promise.all([getNotes(), getSubjects()]);
    abortIfNeeded(options.signal);
    const subject = subjects.find((candidate) => candidate.id === options.subjectId);
    if (!subject || (subject.userId && subject.userId !== options.userId)) {
      return { status: 'no-evidence', excerpts: [] };
    }
    const selectedIds = new Set(options.selectedNoteIds);
    const seen = new Set<string>();
    const candidates = notes
      .filter((note) => selectedIds.has(note.id))
      .filter((note) => note.subjectId === options.subjectId)
      .filter((note) => !note.userId || note.userId === options.userId)
      .map((note) => {
        const titleScore = countMatches(note.title, tokens) * 6;
        const tagScore = countMatches(note.tags.join(' '), tokens) * 4;
        const contentScore = countMatches(note.content, tokens) * 2;
        return { note, score: titleScore + tagScore + contentScore };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score
        || left.note.title.localeCompare(right.note.title)
        || left.note.id.localeCompare(right.note.id));

    const excerpts: PreparedEvidenceExcerpt[] = [];
    let totalCharacters = 0;
    for (const { note, score } of candidates) {
      abortIfNeeded(options.signal);
      if (excerpts.length >= MAX_GROUNDING_SOURCES) break;
      let excerpt = matchingWindow(note.content || note.title, tokens);
      if (!excerpt || seen.has(excerpt)) continue;
      const remaining = MAX_TOTAL_GROUNDING_CHARACTERS - totalCharacters;
      if (remaining <= 0) break;
      if (excerpt.length > remaining) excerpt = `${excerpt.slice(0, Math.max(0, remaining - 1)).trim()}…`;
      if (!excerpt || seen.has(excerpt)) continue;
      seen.add(excerpt);
      totalCharacters += excerpt.length;
      excerpts.push({
        id: note.id,
        evidenceType: 'note',
        label: `R${excerpts.length + 1}`,
        noteId: note.id,
        importedSourceId: null,
        sourceVersionId: null,
        segmentId: null,
        subjectId: note.subjectId,
        title: note.title || 'Untitled Note',
        locator: 'Note',
        excerpt,
        excerptHash: await sha256Text(excerpt),
        contentHash: await sha256Text(note.content),
        score,
        order: excerpts.length + 1,
      });
    }
    return excerpts.length > 0
      ? { status: 'success', excerpts }
      : { status: 'no-evidence', excerpts: [] };
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      return { status: 'cancelled', excerpts: [] };
    }
    return { status: 'error', excerpts: [], error };
  }
}

function boundedSourceExcerpt(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_SOURCE_EXCERPT_CHARACTERS) return trimmed;
  return `${trimmed.slice(0, MAX_SOURCE_EXCERPT_CHARACTERS - 1).trimEnd()}…`;
}

export async function performSourceRetrieval(
  query: string,
  options: SourceRetrievalOptions,
): Promise<RetrievalOutcome> {
  abortIfNeeded(options.signal);
  if (options.selections.length > MAX_SELECTED_IMPORTED_SOURCES) {
    throw new Error(`Select at most ${MAX_SELECTED_IMPORTED_SOURCES} imported sources.`);
  }
  if (new Set(options.selections.map((selection) => selection.sourceId)).size !== options.selections.length) {
    throw new Error('Each imported source may be selected only once.');
  }
  for (const selection of options.selections) {
    for (const range of selection.pageRanges ?? []) {
      if (
        !Number.isSafeInteger(range.start)
        || !Number.isSafeInteger(range.end)
        || range.start < 1
        || range.end < range.start
      ) throw new Error('A selected PDF page range is invalid.');
    }
  }
  const selections = options.selections;
  if (
    normalizeRetrievalTokens(query).length === 0
    || selections.length === 0
    || !options.subjectId
  ) {
    return { status: 'no-evidence', excerpts: [] };
  }

  try {
    const candidates = await getSourceGroundingCandidates({
      userId: options.userId,
      subjectId: options.subjectId,
      query,
      selections,
      maximumCandidateSegments: MAX_SOURCE_CANDIDATE_SEGMENTS,
    });
    abortIfNeeded(options.signal);

    const excerpts: PreparedEvidenceExcerpt[] = [];
    let totalCharacters = 0;
    for (const candidate of candidates) {
      abortIfNeeded(options.signal);
      if (excerpts.length >= MAX_SOURCE_EVIDENCE_ITEMS) break;
      let excerpt = boundedSourceExcerpt(candidate.excerpt);
      const remaining = MAX_TOTAL_SOURCE_CHARACTERS - totalCharacters;
      if (remaining <= 0) break;
      if (excerpt.length > remaining) {
        excerpt = `${excerpt.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`;
      }
      if (!excerpt) continue;
      totalCharacters += excerpt.length;
      excerpts.push({
        id: candidate.segment.id,
        evidenceType: 'source_segment',
        label: `S${excerpts.length + 1}`,
        noteId: null,
        importedSourceId: candidate.source.id,
        sourceVersionId: candidate.version.id,
        segmentId: candidate.segment.id,
        subjectId: options.subjectId,
        title: candidate.source.displayName,
        locator: candidate.locator,
        excerpt,
        excerptHash: await sha256Text(excerpt),
        contentHash: candidate.segment.textHash,
        sourceType: candidate.source.sourceType as PreparedEvidenceExcerpt['sourceType'],
        physicalPage: candidate.segment.physicalPage,
        printedPageLabel: candidate.segment.printedPageLabel,
        score: candidate.score,
        order: excerpts.length + 1,
      });
    }
    return excerpts.length > 0
      ? { status: 'success', excerpts }
      : { status: 'no-evidence', excerpts: [] };
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') {
      return { status: 'cancelled', excerpts: [] };
    }
    return { status: 'error', excerpts: [], error };
  }
}

export function applyCombinedEvidenceLimits(
  noteExcerpts: PreparedEvidenceExcerpt[],
  sourceExcerpts: PreparedEvidenceExcerpt[],
  availableCharacters = MAX_TOTAL_EVIDENCE_CHARACTERS,
): PreparedEvidenceExcerpt[] {
  const limited: PreparedEvidenceExcerpt[] = [];
  let used = 0;
  for (const evidence of [...noteExcerpts, ...sourceExcerpts]) {
    if (limited.length >= MAX_TOTAL_EVIDENCE_ITEMS) break;
    const remaining = Math.min(MAX_TOTAL_EVIDENCE_CHARACTERS, availableCharacters) - used;
    if (remaining <= 0) break;
    const excerpt = evidence.excerpt;
    if (!excerpt || excerpt.length > remaining) continue;
    limited.push({
      ...evidence,
      excerpt,
      order: limited.length + 1,
    });
    used += excerpt.length;
  }
  return limited;
}

export async function validatePreparedEvidence(
  evidence: PreparedEvidenceExcerpt[],
  userId: string,
  subjectId: string,
): Promise<boolean> {
  const notes = await getNotes();
  for (const item of evidence.filter((candidate) => candidate.evidenceType === 'note')) {
    if (await sha256Text(item.excerpt) !== item.excerptHash) return false;
    const note = item.noteId ? notes.find((candidate) => candidate.id === item.noteId) : undefined;
    if (
      !note
      || (note.userId ?? 'default_user') !== userId
      || note.subjectId !== subjectId
      || await sha256Text(note.content) !== item.contentHash
    ) return false;
  }
  const sourceEvidence = evidence.filter((candidate) => candidate.evidenceType === 'source_segment');
  for (const item of sourceEvidence) {
    if (await sha256Text(item.excerpt) !== item.excerptHash) return false;
  }
  return validateSourceGroundingEvidence(sourceEvidence, userId, subjectId);
}
