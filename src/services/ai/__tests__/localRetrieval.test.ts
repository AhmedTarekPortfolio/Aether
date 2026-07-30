import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../../db/database';
import * as noteApi from '../../../api/noteApi';
import {
  MAX_EXCERPT_CHARACTERS,
  MAX_GROUNDING_SOURCES,
  MAX_TOTAL_GROUNDING_CHARACTERS,
  normalizeRetrievalTokens,
  performLocalRetrieval,
} from '../localRetrieval';

const options = { selectedNoteIds: ['n1'], subjectId: 's1', userId: 'u1' };

describe('WP-02 deterministic local note retrieval', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
    await db.users.bulkAdd([
      { id: 'u1', name: 'One', email: 'one@test.dev', academicLevel: 'UG', createdAt: 1, updatedAt: 1 },
      { id: 'u2', name: 'Two', email: 'two@test.dev', academicLevel: 'UG', createdAt: 1, updatedAt: 1 },
    ]);
    await db.subjects.bulkAdd([
      { id: 's1', userId: 'u1', name: 'Biology', color: '#fff', confidenceRating: 0, createdAt: 1 },
      { id: 's2', userId: 'u1', name: 'Physics', color: '#fff', confidenceRating: 0, createdAt: 1 },
    ]);
  });
  afterEach(() => { vi.restoreAllMocks(); db.close(); });

  it('isolates explicitly selected notes, subject, and current user', async () => {
    await db.notes.bulkAdd([
      { id: 'n1', userId: 'u1', subjectId: 's1', title: 'Cells', content: 'Mitochondria creates ATP.', tags: [], updatedAt: 1 },
      { id: 'n2', userId: 'u1', subjectId: 's1', title: 'Secret', content: 'Mitochondria unselected.', tags: [], updatedAt: 2 },
      { id: 'n3', userId: 'u1', subjectId: 's2', title: 'Wrong subject', content: 'Mitochondria.', tags: [], updatedAt: 3 },
      { id: 'n4', userId: 'u2', subjectId: 's1', title: 'Wrong user', content: 'Mitochondria.', tags: [], updatedAt: 4 },
    ]);
    const result = await performLocalRetrieval('mitochondria', { ...options, selectedNoteIds: ['n1', 'n2', 'n3', 'n4'] });
    expect(result.status).toBe('success');
    expect(result.excerpts.map((excerpt) => excerpt.noteId)).toEqual(['n1', 'n2']);
    expect((await performLocalRetrieval('mitochondria', { ...options, userId: 'u2' })).status).toBe('no-evidence');
  });

  it('weights title above tags above content and orders deterministically', async () => {
    await db.notes.bulkAdd([
      { id: 'content', userId: 'u1', subjectId: 's1', title: 'Z', content: 'orbit', tags: [], updatedAt: 1 },
      { id: 'tag', userId: 'u1', subjectId: 's1', title: 'Z', content: 'tag evidence', tags: ['orbit'], updatedAt: 1 },
      { id: 'title', userId: 'u1', subjectId: 's1', title: 'Orbit', content: 'title evidence', tags: [], updatedAt: 1 },
    ]);
    const result = await performLocalRetrieval('orbit', { ...options, selectedNoteIds: ['content', 'tag', 'title'] });
    expect(result.excerpts.map((excerpt) => excerpt.noteId)).toEqual(['title', 'tag', 'content']);
    expect(result.excerpts.map((excerpt) => excerpt.label)).toEqual(['R1', 'R2', 'R3']);
  });

  it('extracts a matching window rather than the leading characters', async () => {
    await db.notes.add({ id: 'n1', userId: 'u1', subjectId: 's1', title: 'Long', content: `${'prefix '.repeat(150)}quantum evidence here`, tags: [], updatedAt: 1 });
    const result = await performLocalRetrieval('quantum', options);
    expect(result.status).toBe('success');
    expect(result.excerpts[0].excerpt).toContain('quantum evidence');
    expect(result.excerpts[0].excerpt.startsWith('…')).toBe(true);
  });

  it('normalizes Unicode and punctuation and handles empty input', async () => {
    expect(normalizeRetrievalTokens('  CAFÉ—العِلْم!!! ')).toEqual(['café', 'الع']);
    await db.notes.add({ id: 'n1', userId: 'u1', subjectId: 's1', title: 'Café', content: 'Café learning.', tags: [], updatedAt: 1 });
    expect((await performLocalRetrieval('CAFÉ!!!', options)).status).toBe('success');
    expect((await performLocalRetrieval('...', options)).status).toBe('no-evidence');
  });

  it('handles empty notes and deleted selected IDs without fallback', async () => {
    expect((await performLocalRetrieval('anything', options)).status).toBe('no-evidence');
    await db.notes.add({ id: 'other', userId: 'u1', subjectId: 's1', title: 'Anything', content: 'anything', tags: [], updatedAt: 1 });
    expect((await performLocalRetrieval('anything', options)).status).toBe('no-evidence');
  });

  it('enforces count, excerpt, total-character, and duplicate budgets', async () => {
    await db.notes.bulkAdd(Array.from({ length: 8 }, (_, index) => ({
      id: `n${index}`, userId: 'u1', subjectId: 's1', title: `Evidence ${index}`,
      content: `evidence ${index} ${'x'.repeat(800)}`, tags: [], updatedAt: index,
    })));
    const result = await performLocalRetrieval('evidence', { ...options, selectedNoteIds: Array.from({ length: 8 }, (_, index) => `n${index}`) });
    expect(result.excerpts.length).toBeLessThanOrEqual(MAX_GROUNDING_SOURCES);
    expect(result.excerpts.every((excerpt) => excerpt.excerpt.length <= MAX_EXCERPT_CHARACTERS + 1)).toBe(true);
    expect(result.excerpts.reduce((sum, excerpt) => sum + excerpt.excerpt.length, 0)).toBeLessThanOrEqual(MAX_TOTAL_GROUNDING_CHARACTERS);
    expect(new Set(result.excerpts.map((excerpt) => excerpt.excerpt)).size).toBe(result.excerpts.length);
  });

  it('distinguishes cancellation and database failure from no evidence', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(performLocalRetrieval('evidence', { ...options, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    vi.spyOn(noteApi, 'getNotes').mockRejectedValueOnce(new Error('database offline'));
    expect((await performLocalRetrieval('evidence', options)).status).toBe('error');
  });
});
