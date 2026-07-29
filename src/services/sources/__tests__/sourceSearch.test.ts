import { afterEach, describe, expect, it } from 'vitest';
import type { AetherDatabase } from '../../../db/database';
import { importPastedText, searchImportedSources } from '..';
import {
  createSourceTestDatabase,
  deleteSourceTestDatabase,
} from './sourceTestUtils';

const databases: AetherDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(deleteSourceTestDatabase));
});

async function databaseWithSources(): Promise<{
  database: AetherDatabase;
  firstId: string;
  secondId: string;
  otherSubjectId: string;
}> {
  const database = await createSourceTestDatabase();
  databases.push(database);
  const now = 1_700_000_000_000;
  await database.subjects.add({
    id: 'subject-other',
    userId: 'user-a',
    name: 'Chemistry',
    color: '#00ff00',
    confidenceRating: 50,
    createdAt: now,
  });
  const first = await importPastedText({
    userId: 'user-a',
    subjectId: 'subject-a',
    displayTitle: 'Motion basics',
  }, 'Velocity describes motion. Velocity velocity appears often. Acceleration follows.', {
    database,
  });
  const second = await importPastedText({
    userId: 'user-a',
    subjectId: 'subject-a',
    displayTitle: 'Motion advanced',
  }, 'Acceleration and velocity are ordered terms in this motion source.', { database });
  const other = await importPastedText({
    userId: 'user-a',
    subjectId: 'subject-other',
    displayTitle: 'Chemistry source',
  }, 'Velocity is used here only to test subject isolation.', { database });
  return {
    database,
    firstId: first.sourceId,
    secondId: second.sourceId,
    otherSubjectId: other.sourceId,
  };
}

describe('local imported-source search', () => {
  it('matches case-insensitively with stable occurrence-based relevance', async () => {
    const { database, firstId } = await databaseWithSources();
    const results = await searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      query: 'VELOCITY',
      maximumResults: 10,
    }, database);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].source.id).toBe(firstId);
    expect(results[0]).toMatchObject({
      excerpt: expect.stringMatching(/Velocity/i),
      locator: {
        charStart: expect.any(Number),
        charEnd: expect.any(Number),
        lineStart: 1,
        lineEnd: 1,
      },
    });
    expect(results.map((result) => result.chunk.id)).toEqual(
      [...results].sort((left, right) =>
        right.score - left.score
        || left.source.displayName.localeCompare(right.source.displayName)
        || left.chunk.ordinal - right.chunk.ordinal
        || left.chunk.id.localeCompare(right.chunk.id))
        .map((result) => result.chunk.id),
    );
  });

  it('supports multiple terms, subject scope, source scope, and bounded results', async () => {
    const { database, secondId, otherSubjectId } = await databaseWithSources();
    const results = await searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      sourceIds: [secondId, otherSubjectId],
      query: 'acceleration velocity',
      maximumResults: 1,
    }, database);
    expect(results).toHaveLength(1);
    expect(results[0].source.id).toBe(secondId);
    expect(results[0].source.id).not.toBe(otherSubjectId);
  });

  it('bounds the number of candidate chunks examined in stable source order', async () => {
    const { database, secondId } = await databaseWithSources();
    const results = await searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      query: 'velocity',
      maximumCandidateChunks: 1,
    }, database);
    expect(results).toHaveLength(1);
    expect(results[0].source.id).toBe(secondId);
  });

  it('excludes inactive sources and non-ready versions', async () => {
    const { database, firstId, secondId } = await databaseWithSources();
    await database.study_sources.update(firstId, { status: 'archived' });
    const second = await database.study_sources.get(secondId);
    await database.source_versions.update(second!.currentVersionId!, { status: 'failed' });
    await expect(searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      query: 'velocity',
    }, database)).resolves.toEqual([]);
  });

  it('excludes archived and trashed sources from default local search', async () => {
    const { database, firstId, secondId } = await databaseWithSources();
    await database.study_sources.update(firstId, { status: 'archived' });
    await database.study_sources.update(secondId, { status: 'trashed' });
    await expect(searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      query: 'velocity',
    }, database)).resolves.toEqual([]);
  });

  it('returns no results for blank queries or missing subject scope', async () => {
    const { database } = await databaseWithSources();
    await expect(searchImportedSources({
      userId: 'user-a',
      subjectId: 'subject-a',
      query: '   ',
    }, database)).resolves.toEqual([]);
    await expect(searchImportedSources({
      userId: 'user-a',
      subjectId: '',
      query: 'velocity',
    }, database)).resolves.toEqual([]);
  });
});
