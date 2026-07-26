import { getNotes } from '../../api/noteApi';
import { getSubjects } from '../../api/subjectApi';
import { PreparedResourceExcerpt, RetrievalOutcome } from './types';

export const MAX_GROUNDING_SOURCES = 5;
export const MAX_EXCERPT_CHARACTERS = 600;
export const MAX_TOTAL_GROUNDING_CHARACTERS = 2_400;
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

    const excerpts: PreparedResourceExcerpt[] = [];
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
        noteId: note.id,
        subjectId: note.subjectId,
        sourceId: `R${excerpts.length + 1}`,
        title: note.title || 'Untitled Note',
        excerpt,
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
