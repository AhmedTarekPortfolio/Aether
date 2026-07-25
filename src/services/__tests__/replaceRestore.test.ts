import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AetherDatabase, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../test/indexedDbHarness';
import { PERSISTENCE_TABLES, type AetherBackupDataV2 } from '../../types';
import {
  BackupValidationError,
  REPLACE_RESTORE_CLEAR_ORDER,
  REPLACE_RESTORE_INSERT_ORDER,
  buildBackupV2,
  createPreRestoreSafetyBackup,
  prepareReplaceRestore,
  readBackupSnapshot,
  replaceRestore,
  type ReplaceRestoreHooks,
} from '../backupService';

const cleanup = new Set<string>();
function snapshot(prefix: string): AetherBackupDataV2 {
  const user = `${prefix}-user`;
  const subject = `${prefix}-subject`;
  const topic = `${prefix}-topic`;
  const task = `${prefix}-task`;
  return {
    users: [{ id: user, name: prefix, email: `${prefix}@example.test`, academicLevel: 'UG', createdAt: 1, updatedAt: 2 }],
    settings: [{ id: `${prefix}-settings`, userId: user, theme: 'dark', soundEnabled: true, aiProvider: 'local', notificationsEnabled: true, studyGoalHoursWeekly: 10, updatedAt: 2 }],
    subjects: [{ id: subject, userId: user, name: prefix, color: '#123456', confidenceRating: 50, createdAt: 3 }],
    topics: [{ id: topic, subjectId: subject, title: prefix, masteryLevel: 20 }],
    tasks: [{ id: task, userId: user, subjectId: subject, title: prefix, priority: 'low', estimatedMinutes: 10, completedMinutes: 0, status: 'todo', createdAt: 4 }],
    notes: [{ id: `${prefix}-note`, userId: user, subjectId: subject, topicId: topic, title: prefix, content: 'safe', tags: [], updatedAt: 5 }],
    flashcards: [{ id: `${prefix}-card`, userId: user, subjectId: subject, topicId: topic, front: 'Q', back: 'A', easeFactor: 2.5, interval: 1, repetitions: 0, nextReviewDate: 6 }],
    sessions: [{ id: `${prefix}-session`, userId: user, subjectId: subject, taskId: task, type: 'pomodoro', durationMinutes: 25, distractionCount: 0, completedAt: 7 }],
    goals: [{ id: `${prefix}-goal`, userId: user, subjectId: subject, title: prefix, description: 'safe', type: 'custom', targetValue: 1, currentValue: 0, unit: 'item', status: 'active', createdAt: 8 }],
    ai_conversations: [{ id: `${prefix}-ai`, userId: user, subjectId: subject, taskId: task, role: 'assistant', mode: 'tutor', prompt: 'safe prompt', response: 'safe response', timestamp: 9, generationStatus: 'complete' }],
    statistics: [{ id: `${prefix}-stat`, userId: user, metricKey: 'focus', periodStart: 1, periodEnd: 2, value: 1, computedAt: 3 }],
    achievement_definitions: structuredClone(CANONICAL_ACHIEVEMENT_DEFINITIONS),
    user_achievements: [{ id: `${prefix}-achievement`, userId: user, achievementId: 'ach_first_task', progress: 1 }],
    notifications: [{ id: `${prefix}-notification`, userId: user, type: 'system', title: 'safe', message: 'safe', relatedTaskId: task, relatedSubjectId: subject, read: false, createdAt: 10 }],
  };
}

async function database(): Promise<AetherDatabase> {
  const metadata = new AetherDatabase();
  const stores = Object.fromEntries(metadata.tables.map((table) => [
    table.name,
    [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', '),
  ]));
  const name = createUniqueDatabaseName('wp06-replace');
  cleanup.add(name);
  const testDb = new Dexie(name);
  testDb.version(metadata.verno).stores(stores);
  await openTestDatabase(testDb);
  return testDb as unknown as AetherDatabase;
}

async function seed(database: AetherDatabase, data: AetherBackupDataV2): Promise<void> {
  await database.transaction('rw', PERSISTENCE_TABLES.map((table) => database.table(table)), async () => {
    for (const table of PERSISTENCE_TABLES) {
      if (data[table].length) await database.table(table).bulkAdd(data[table]);
    }
  });
}

const ROLLBACK_FAILURE_CASES: Array<[string, ReplaceRestoreHooks]> = [
  ...REPLACE_RESTORE_CLEAR_ORDER.map((target): [string, ReplaceRestoreHooks] => [
    `clear:${target}`,
    { afterClear: (table) => { if (table === target) throw new Error('injected'); } },
  ]),
  ...REPLACE_RESTORE_INSERT_ORDER.map((target): [string, ReplaceRestoreHooks] => [
    `insert:${target}`,
    { afterInsert: (table) => { if (table === target) throw new Error('injected'); } },
  ]),
  ...PERSISTENCE_TABLES.map((target): [string, ReplaceRestoreHooks] => [
    `count:${target}`,
    { beforeTableCountVerification: (table) => { if (table === target) throw new Error('injected'); } },
  ]),
  ['relationship verification', { beforeRelationshipVerification: () => { throw new Error('injected'); } }],
  ['count verification', { beforeCountVerification: () => { throw new Error('injected'); } }],
];

afterEach(async () => {
  localStorage.clear();
  for (const name of cleanup) await deleteTestDatabase(name);
  cleanup.clear();
});

describe('WP-06 Version 2 prevalidation', () => {
  it('accepts Version 2 and rejects legacy, unsupported, missing, extra, counts, ids, timestamps, secrets, unique indexes, and relationships', () => {
    const valid = buildBackupV2(snapshot('incoming'));
    expect(prepareReplaceRestore(valid).format).toBe('version-2');
    const invalid: unknown[] = [
      { users: [] },
      { ...valid, version: 3 },
      { ...valid, schemaVersion: 4 },
      { ...valid, data: { ...valid.data, notifications: undefined } },
      { ...valid, data: { ...valid.data, extra: [] } },
      { ...valid, recordCounts: { ...valid.recordCounts, users: 99 } },
      { ...valid, data: { ...valid.data, users: [...valid.data.users, valid.data.users[0]] } },
      { ...valid, data: { ...valid.data, users: [{ ...valid.data.users[0], createdAt: 'bad' }] } },
      { ...valid, data: { ...valid.data, users: [{ ...valid.data.users[0], apiKey: 'secret' }] } },
      { ...valid, data: { ...valid.data, users: [...valid.data.users, { ...valid.data.users[0], id: 'other' }] } },
      { ...valid, data: { ...valid.data, topics: [{ ...valid.data.topics[0], subjectId: 'missing' }] } },
    ];
    invalid.forEach((value) => expect(() => prepareReplaceRestore(value)).toThrow(BackupValidationError));
  });

  it('accepts exact, subset, and empty canonical definitions but rejects incompatible definitions', () => {
    for (const definitions of [
      CANONICAL_ACHIEVEMENT_DEFINITIONS,
      CANONICAL_ACHIEVEMENT_DEFINITIONS.slice(0, 1),
      [],
    ]) {
      const data = snapshot(`accepted-${definitions.length}`);
      data.achievement_definitions = structuredClone(definitions);
      expect(() => prepareReplaceRestore(buildBackupV2(data))).not.toThrow();
    }
    const data = snapshot('invalid-achievement');
    data.achievement_definitions[0].title = 'Changed';
    expect(() => buildBackupV2(data)).toThrow(BackupValidationError);
  });
});

describe('WP-06 safety and atomic replacement', () => {
  it('requires successful safety delivery and deliberate confirmation', async () => {
    const db = await database();
    await seed(db, snapshot('before'));
    await expect(createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(false),
    }, db)).rejects.toThrow();
    const prepared = prepareReplaceRestore(buildBackupV2(snapshot('incoming')));
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, db);
    await expect(replaceRestore(prepared, {
      safetyReceipt: safety,
      confirmed: false,
      database: db,
      refresh: vi.fn(),
    }))
      .rejects.toThrow();
    expect((await readBackupSnapshot(db)).users[0].id).toBe('before-user');
  });

  it('rejects a structurally similar plain-object safety receipt', async () => {
    const db = await database();
    await seed(db, snapshot('before'));
    const before = await readBackupSnapshot(db);
    const prepared = prepareReplaceRestore(buildBackupV2(snapshot('incoming')));
    const forged = {
      kind: 'verified-safety-backup',
      runtime: 'browser',
      completedAt: new Date().toISOString(),
      token: Symbol('verified-safety-backup'),
    } as const;

    await expect(replaceRestore(prepared, {
      database: db,
      safetyReceipt: forged,
      confirmed: true,
      refresh: vi.fn(),
    })).rejects.toThrow(/completed safety backup/i);
    expect(await readBackupSnapshot(db)).toEqual(before);
  });

  it('delivers safety backup before replacement and follows explicit orders', async () => {
    const db = await database();
    await seed(db, snapshot('before'));
    const events: string[] = [];
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: async () => { events.push('safety'); return true; },
    }, db);
    const prepared = prepareReplaceRestore(buildBackupV2(snapshot('incoming')));
    await replaceRestore(prepared, {
      database: db,
      safetyReceipt: safety,
      confirmed: true,
      refresh: vi.fn(),
      hooks: {
        beforeClear: (table) => { events.push(`clear:${table}`); },
        beforeInsert: (table) => { events.push(`insert:${table}`); },
      },
    });
    expect(events).toEqual([
      'safety',
      ...REPLACE_RESTORE_CLEAR_ORDER.map((table) => `clear:${table}`),
      ...REPLACE_RESTORE_INSERT_ORDER.map((table) => `insert:${table}`),
    ]);
    const restored = await readBackupSnapshot(db);
    expect(restored.users.map(({ id }) => id)).toEqual(['incoming-user']);
    expect(restored.achievement_definitions).toEqual(CANONICAL_ACHIEVEMENT_DEFINITIONS);
  });

  it.each(ROLLBACK_FAILURE_CASES)(
    'rolls back all 14 tables after %s failure',
    async (_label, hooks) => {
    const db = await database();
    await seed(db, snapshot('before'));
    const before = await readBackupSnapshot(db);
    const prepared = prepareReplaceRestore(buildBackupV2(snapshot('incoming')));
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, db);
    await expect(replaceRestore(prepared, {
      database: db,
      safetyReceipt: safety,
      confirmed: true,
      refresh: vi.fn(),
      hooks,
    })).rejects.toThrow(/rolled back/i);
    expect(await readBackupSnapshot(db)).toEqual(before);
    },
  );

  it('revalidates a corrupted prepared payload before the first clear', async () => {
    const db = await database();
    await seed(db, snapshot('before'));
    const before = await readBackupSnapshot(db);
    const prepared = prepareReplaceRestore(buildBackupV2(snapshot('incoming')));
    const safety = await createPreRestoreSafetyBackup({
      runtime: 'browser',
      deliver: vi.fn().mockResolvedValue(true),
    }, db);
    prepared.backup.data.topics[0].subjectId = 'corrupted';
    await expect(replaceRestore(prepared, {
      database: db,
      safetyReceipt: safety,
      confirmed: true,
      refresh: vi.fn(),
    })).rejects.toThrow();
    expect(await readBackupSnapshot(db)).toEqual(before);
  });
});
