import { afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { AetherDatabase } from '../database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
} from '../../test/indexedDbHarness';

const VERSION_3_STORES = {
  users: 'id, &email',
  settings: 'id, &userId',
  subjects: 'id, userId, name, confidenceRating',
  topics: 'id, subjectId, title, masteryLevel',
  tasks: 'id, userId, subjectId, priority, status, dueDate',
  notes: 'id, userId, subjectId, topicId, title, updatedAt',
  flashcards: 'id, userId, subjectId, topicId, nextReviewDate',
  sessions: 'id, userId, subjectId, taskId, completedAt',
  goals: 'id, userId, subjectId, status',
  ai_conversations: 'id, userId, subjectId, mode, timestamp',
  statistics: 'id, userId, [userId+metricKey+periodStart]',
  achievement_definitions: 'id, &key',
  user_achievements: 'id, userId, [userId+achievementId]',
  notifications: 'id, userId, type, createdAt',
} as const;

const SOURCE_TABLES = [
  'study_sources',
  'source_assets',
  'source_versions',
  'source_segments',
  'source_associations',
  'source_chunks',
  'source_jobs',
  'ai_grounding_records',
] as const;

let databaseName: string | undefined;

afterEach(async () => {
  if (databaseName) await deleteTestDatabase(databaseName);
  databaseName = undefined;
});

describe('Dexie source-domain schema migration (Version 3 -> Version 4)', () => {
  it('preserves Version 3 rows and creates exactly eight empty additive tables', async () => {
    databaseName = createUniqueDatabaseName('wp-local-01-migration');
    const version3 = new Dexie(databaseName);
    version3.version(3).stores(VERSION_3_STORES);
    await version3.open();
    await version3.table('users').add({
      id: 'user-preserved',
      name: 'Preserved User',
      email: 'preserved@example.test',
      createdAt: 1,
      updatedAt: 2,
    });
    await version3.table('subjects').add({
      id: 'subject-preserved',
      userId: 'user-preserved',
      name: 'Preserved Subject',
      color: '#000000',
      confidenceRating: 50,
      createdAt: 3,
    });
    version3.close();

    const version4 = new AetherDatabase(databaseName);
    await version4.open();

    expect(version4.verno).toBe(4);
    expect(await version4.users.get('user-preserved')).toMatchObject({
      email: 'preserved@example.test',
    });
    expect(await version4.subjects.get('subject-preserved')).toMatchObject({
      name: 'Preserved Subject',
    });
    expect(version4.tables.map((table) => table.name).sort()).toEqual([
      ...Object.keys(VERSION_3_STORES),
      ...SOURCE_TABLES,
    ].sort());
    for (const table of SOURCE_TABLES) {
      expect(await version4.table(table).count()).toBe(0);
    }
    version4.close();
  });

  it('declares the contract-required compound unique indexes', async () => {
    databaseName = createUniqueDatabaseName('wp-local-01-indexes');
    const database = new AetherDatabase(databaseName);
    await database.open();

    const uniqueCompoundIndexes = [
      ['source_assets', '[userId+contentHash]'],
      ['source_versions', '[sourceId+versionNumber]'],
      ['source_segments', '[sourceVersionId+ordinal]'],
      ['source_associations', '[sourceId+targetType+targetId]'],
      ['source_chunks', '[segmentId+chunkerFingerprint+ordinal]'],
      ['ai_grounding_records', '[requestId+evidenceLabel]'],
    ] as const;

    for (const [tableName, indexName] of uniqueCompoundIndexes) {
      const index = database.table(tableName).schema.indexes.find(
        (candidate) => candidate.name === indexName,
      );
      expect(index, `${tableName}.${indexName}`).toMatchObject({
        compound: true,
        unique: true,
      });
    }
    database.close();
  });
});
