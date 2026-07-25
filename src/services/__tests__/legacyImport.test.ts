import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AetherDatabase, CANONICAL_ACHIEVEMENT_DEFINITIONS } from '../../db/database';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../test/indexedDbHarness';
import {
  LEGACY_BACKUP_TABLES,
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  type AetherBackupDataV2,
  type LegacyBackupTableName,
} from '../../types';
import {
  BackupValidationError,
  LegacyImportCommittedError,
  buildLegacyPostMergeView,
  classifyBackupFormat,
  getLegacyImportErrorMessage,
  importLegacyBackup,
  parseBackupJson,
  prepareLegacyImport,
  readLegacySnapshot,
  validateLegacyBackup,
  validateLegacyRelationships,
  validateLegacyUniqueIndexes,
  type LegacyBackupData,
} from '../backupService';

const databasesToClean = new Set<string>();

function legacyData(): LegacyBackupData {
  return {
    users: [{
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.test',
      academicLevel: 'Undergraduate',
      createdAt: 100,
      updatedAt: 200,
    }],
    settings: [{
      id: 'settings-1',
      userId: 'user-1',
      theme: 'dark',
      soundEnabled: true,
      aiProvider: 'local',
      notificationsEnabled: true,
      studyGoalHoursWeekly: 20,
      updatedAt: 200,
    }],
    subjects: [{
      id: 'subject-1',
      userId: 'user-1',
      name: 'Algorithms',
      color: '#123456',
      confidenceRating: 70,
      createdAt: 300,
    }],
    topics: [{
      id: 'topic-1',
      subjectId: 'subject-1',
      title: 'Graphs',
      masteryLevel: 60,
      lastReviewedAt: 400,
    }],
    tasks: [{
      id: 'task-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      title: 'Review graphs',
      priority: 'high',
      estimatedMinutes: 30,
      completedMinutes: 10,
      status: 'in_progress',
      createdAt: 500,
      dueDate: 900,
    }],
    notes: [{
      id: 'note-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      topicId: 'topic-1',
      title: 'Graph notes',
      content: 'Bearer token authentication is used by APIs.',
      tags: ['graphs'],
      updatedAt: 600,
    }],
    flashcards: [{
      id: 'flashcard-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      topicId: 'topic-1',
      front: 'BFS',
      back: 'Breadth-first search',
      easeFactor: 2.5,
      interval: 3,
      repetitions: 1,
      nextReviewDate: 700,
    }],
    sessions: [{
      id: 'session-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: 'task-1',
      type: 'pomodoro',
      durationMinutes: 25,
      distractionCount: 0,
      reflectionRating: 5,
      completedAt: 800,
    }],
  };
}

function legacyFile(): Record<string, unknown> {
  return {
    ...structuredClone(legacyData()),
    exportedAt: '2026-07-25T00:00:00.000Z',
  };
}

function emptyLegacyData(): LegacyBackupData {
  return Object.fromEntries(
    LEGACY_BACKUP_TABLES.map((table) => [table, []]),
  ) as unknown as LegacyBackupData;
}

function fullSnapshot(): AetherBackupDataV2 {
  return {
    ...structuredClone(legacyData()),
    goals: [{
      id: 'goal-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      title: 'Finish review',
      description: 'Complete the unit',
      type: 'task_completion',
      targetValue: 1,
      currentValue: 0,
      unit: 'task',
      status: 'active',
      createdAt: 900,
    }],
    ai_conversations: [{
      id: 'ai-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: 'task-1',
      mode: 'tutor',
      prompt: 'Explain BFS',
      response: 'Breadth-first traversal.',
      timestamp: 1000,
      generationStatus: 'complete',
    }],
    statistics: [{
      id: 'stat-1',
      userId: 'user-1',
      metricKey: 'focus',
      periodStart: 1,
      periodEnd: 2,
      value: 25,
      computedAt: 3,
    }],
    achievement_definitions: structuredClone(CANONICAL_ACHIEVEMENT_DEFINITIONS),
    user_achievements: [{
      id: 'user-achievement-1',
      userId: 'user-1',
      achievementId: 'ach_first_task',
      progress: 1,
    }],
    notifications: [{
      id: 'notification-1',
      userId: 'user-1',
      type: 'system',
      title: 'Saved',
      message: 'Workspace saved.',
      read: false,
      createdAt: 1100,
    }],
  };
}

async function createProductionSchemaTestDatabase(): Promise<AetherDatabase> {
  const productionMetadata = new AetherDatabase();
  const stores = Object.fromEntries(productionMetadata.tables.map((table) => [
    table.name,
    [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', '),
  ]));
  const name = createUniqueDatabaseName('wp05-legacy');
  databasesToClean.add(name);
  const database = new Dexie(name);
  database.version(productionMetadata.verno).stores(stores);
  await openTestDatabase(database);
  return database as unknown as AetherDatabase;
}

async function seedAllTables(
  database: AetherDatabase,
  snapshot: AetherBackupDataV2,
): Promise<void> {
  await database.transaction(
    'rw',
    PERSISTENCE_TABLES.map((table) => database.table(table)),
    async () => {
      for (const table of PERSISTENCE_TABLES) {
        if (snapshot[table].length > 0) await database.table(table).bulkAdd(snapshot[table]);
      }
    },
  );
}

async function captureAllTables(database: AetherDatabase): Promise<Record<string, unknown[]>> {
  return database.transaction(
    'r',
    PERSISTENCE_TABLES.map((table) => database.table(table)),
    async () => Object.fromEntries(await Promise.all(PERSISTENCE_TABLES.map(async (table) => [
      table,
      await database.table(table).toArray(),
    ]))),
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...databasesToClean].map((name) => deleteTestDatabase(name)));
  databasesToClean.clear();
});

describe('WP-05 legacy format classification and parsing', () => {
  it('accepts the real unversioned eight-array format without requiring version 1', () => {
    const value = legacyFile();
    expect(classifyBackupFormat(value)).toBe('legacy-v1');
    const parsed = parseBackupJson(JSON.stringify(value));
    expect(classifyBackupFormat(parsed)).toBe('legacy-v1');
    expect(validateLegacyBackup(parsed).data).toEqual(legacyData());
  });

  it('accepts version 1 and a canonical informational exportedAt', () => {
    const value = { ...legacyFile(), version: 1 };
    expect(validateLegacyBackup(value).warnings).toEqual([]);
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'not-a-date'],
    ['noncanonical', '2026-07-25T00:00:00Z'],
  ])('continues with a safe warning when exportedAt is %s', (_label, exportedAt) => {
    const value = legacyFile();
    if (exportedAt === undefined) delete value.exportedAt;
    else value.exportedAt = exportedAt;
    expect(validateLegacyBackup(value).warnings.join(' ')).toMatch(/exportedAt/i);
  });

  it('does not classify Version 2 as legacy', () => {
    const value = { ...legacyFile(), format: 'aether-backup', version: 2 };
    expect(classifyBackupFormat(value)).toBe('version-2');
    expect(() => validateLegacyBackup(value)).toThrow(/Version 2/i);
  });

  it('rejects missing tables, non-array tables, unsupported versions, and non-object roots', () => {
    const missing = legacyFile();
    delete missing.users;
    expect(() => validateLegacyBackup(missing)).toThrow(/missing.*users/i);

    const nonArray = legacyFile();
    nonArray.tasks = {};
    expect(() => validateLegacyBackup(nonArray)).toThrow(/tasks.*array/i);

    expect(() => validateLegacyBackup({ ...legacyFile(), version: 3 })).toThrow(/version/i);
    expect(() => validateLegacyBackup([])).toThrow(/object/i);
  });

  it('rejects malformed JSON without echoing file content', () => {
    expect(() => parseBackupJson('{"apiKey":"synthetic-secret"')).toThrow(/valid JSON/i);
    try {
      parseBackupJson('{"apiKey":"synthetic-secret"');
    } catch (error) {
      expect(getLegacyImportErrorMessage(error)).not.toContain('synthetic-secret');
    }
  });
});

describe('WP-05 legacy record validation and sanitization', () => {
  it('accepts valid runtime records and benign academic prose', () => {
    const value = legacyFile();
    (value.notes as LegacyBackupData['notes'])[0].content = [
      'Bearer market',
      'secret: spaced-repetition',
      'password = variable',
      'const token = response.token',
      'authorization is a security concept',
    ].join('\n');
    expect(() => validateLegacyBackup(value)).not.toThrow();
  });

  it('rejects missing, empty, non-string, and duplicate IDs', () => {
    const cases = [
      () => {
        const value = legacyFile();
        delete ((value.tasks as unknown[])[0] as Record<string, unknown>).id;
        return value;
      },
      () => {
        const value = legacyFile();
        (value.tasks as LegacyBackupData['tasks'])[0].id = '';
        return value;
      },
      () => {
        const value = legacyFile();
        ((value.tasks as unknown[])[0] as Record<string, unknown>).id = 42;
        return value;
      },
      () => {
        const value = legacyFile();
        const tasks = value.tasks as LegacyBackupData['tasks'];
        tasks.push(structuredClone(tasks[0]));
        return value;
      },
    ];
    cases.forEach((makeValue) => expect(() => validateLegacyBackup(makeValue())).toThrow(
      BackupValidationError,
    ));
  });

  it('rejects missing required fields, invalid field types, and invalid timestamps', () => {
    const missing = legacyFile();
    delete ((missing.notes as unknown[])[0] as Record<string, unknown>).content;
    expect(() => validateLegacyBackup(missing)).toThrow(/required field/i);

    const invalidType = legacyFile();
    ((invalidType.notes as unknown[])[0] as Record<string, unknown>).tags = 'graphs';
    expect(() => validateLegacyBackup(invalidType)).toThrow(/tags/i);

    for (const timestamp of [Number.NaN, Number.POSITIVE_INFINITY, '2026-01-01']) {
      const invalidTimestamp = legacyFile();
      ((invalidTimestamp.tasks as unknown[])[0] as Record<string, unknown>).createdAt = timestamp;
      expect(() => validateLegacyBackup(invalidTimestamp)).toThrow(/createdAt/i);
    }
  });

  it('strips benign unknown top-level and record fields with safe warnings', () => {
    const value = legacyFile();
    value.futureMetadata = { harmless: true };
    ((value.notes as unknown[])[0] as Record<string, unknown>).legacyDisplayHint = 'wide';
    const result = validateLegacyBackup(value);

    expect(result.warnings.join(' ')).toMatch(/unknown top-level/i);
    expect(result.warnings.join(' ')).toMatch(/notes/i);
    expect(result.data.notes[0]).not.toHaveProperty('legacyDisplayHint');
    expect(result.data).not.toHaveProperty('futureMetadata');
  });

  it.each(['apiKey', 'authorizationHeader', 'accessToken', 'clientSecret', 'password'])(
    'rejects explicit credential field %s without exposing its value',
    (field) => {
      const value = legacyFile();
      const secret = 'synthetic-private-value';
      ((value.notes as unknown[])[0] as Record<string, unknown>)[field] = secret;
      let error: unknown;
      try {
        validateLegacyBackup(value);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BackupValidationError);
      expect(getLegacyImportErrorMessage(error)).not.toContain(secret);
    },
  );

  it.each([
    'sk-synthetic_credential_1234567890abcdef',
    'nvapi-synthetic_credential_1234567890abcdef',
    'Bearer SyntheticCredential1234567890._-',
  ])('rejects credential-shaped value without echoing it', (secret) => {
    const value = legacyFile();
    (value.notes as LegacyBackupData['notes'])[0].content = secret;
    expect(() => validateLegacyBackup(value)).toThrow(BackupValidationError);
    try {
      validateLegacyBackup(value);
    } catch (error) {
      expect(getLegacyImportErrorMessage(error)).not.toContain(secret);
    }
  });
});

describe('WP-05 computed post-merge relationships', () => {
  const legacyRelationships = RELATIONSHIP_CONTRACTS.filter((relationship) => (
    (LEGACY_BACKUP_TABLES as readonly string[]).includes(relationship.childTable)
    && (LEGACY_BACKUP_TABLES as readonly string[]).includes(relationship.parentTable)
  ));

  it('covers the fourteen approved represented-table relationships', () => {
    expect(legacyRelationships).toHaveLength(14);
    expect(() => validateLegacyRelationships(legacyData())).not.toThrow();
  });

  it('resolves parents that already exist in the current database', () => {
    for (const relationship of legacyRelationships) {
      const current = legacyData();
      const incoming = legacyData();
      incoming[relationship.parentTable as LegacyBackupTableName] = [];
      expect(
        () => validateLegacyRelationships(buildLegacyPostMergeView(current, incoming)),
        `${relationship.childTable}.${String(relationship.childField)}`,
      ).not.toThrow();
    }
  });

  it('resolves parents that arrive in the same incoming file', () => {
    const postMerge = buildLegacyPostMergeView(emptyLegacyData(), legacyData());
    expect(() => validateLegacyRelationships(postMerge)).not.toThrow();
  });

  it('rejects every dangling required or present optional relationship', () => {
    for (const relationship of legacyRelationships) {
      const snapshot = legacyData();
      const child = snapshot[relationship.childTable as LegacyBackupTableName][0] as unknown as Record<string, unknown>;
      child[String(relationship.childField)] = 'missing-parent';
      expect(
        () => validateLegacyRelationships(snapshot),
        `${relationship.childTable}.${String(relationship.childField)}`,
      ).toThrow(/relationship/i);
    }
  });

  it('rejects empty strings for every relationship', () => {
    for (const relationship of legacyRelationships) {
      const snapshot = legacyData();
      const child = snapshot[relationship.childTable as LegacyBackupTableName][0] as unknown as Record<string, unknown>;
      child[String(relationship.childField)] = '';
      expect(
        () => validateLegacyRelationships(snapshot),
        `${relationship.childTable}.${String(relationship.childField)}`,
      ).toThrow(/relationship/i);
    }
  });

  it('rejects missing required parents before mutation', async () => {
    const database = await createProductionSchemaTestDatabase();
    const value = legacyFile();
    (value.subjects as LegacyBackupData['subjects']) = [];
    const before = await captureAllTables(database);
    await expect(prepareLegacyImport(value, database)).rejects.toThrow(/relationship/i);
    expect(await captureAllTables(database)).toEqual(before);
  });
});

describe('WP-05 unique-index prevalidation', () => {
  it('rejects duplicate incoming user emails', () => {
    const snapshot = legacyData();
    snapshot.users.push({ ...snapshot.users[0], id: 'user-2' });
    expect(() => validateLegacyUniqueIndexes(snapshot)).toThrow(/unique email/i);
  });

  it('rejects an incoming new ID that conflicts with a current user email', () => {
    const current = legacyData();
    const incoming = emptyLegacyData();
    incoming.users.push({ ...current.users[0], id: 'user-new' });
    expect(() => validateLegacyUniqueIndexes(
      buildLegacyPostMergeView(current, incoming),
    )).toThrow(/unique email/i);
  });

  it('rejects duplicate settings ownership without removing either record', () => {
    const snapshot = legacyData();
    snapshot.settings.push({ ...snapshot.settings[0], id: 'settings-2' });
    expect(() => validateLegacyUniqueIndexes(snapshot)).toThrow(/unique userId/i);
    expect(snapshot.settings).toHaveLength(2);
  });
});

describe('WP-05 real Dexie merge, preservation, and rollback', () => {
  it('replaces matching IDs, inserts new IDs, preserves absent records, and clears nothing', async () => {
    const database = await createProductionSchemaTestDatabase();
    const current = fullSnapshot();
    current.tasks.push({
      id: 'task-keep',
      userId: 'user-1',
      subjectId: 'subject-1',
      title: 'Keep me',
      priority: 'low',
      estimatedMinutes: 10,
      completedMinutes: 0,
      status: 'todo',
      createdAt: 501,
    });
    await seedAllTables(database, current);
    const omittedBefore = await captureAllTables(database);

    const value = legacyFile();
    (value.tasks as LegacyBackupData['tasks'])[0].title = 'Replacement title';
    (value.tasks as LegacyBackupData['tasks']).push({
      id: 'task-new',
      userId: 'user-1',
      subjectId: 'subject-1',
      title: 'New task',
      priority: 'medium',
      estimatedMinutes: 20,
      completedMinutes: 0,
      status: 'todo',
      createdAt: 502,
    });
    (value.flashcards as LegacyBackupData['flashcards']) = [];
    ((value.notes as unknown[])[0] as Record<string, unknown>).ignoredLegacyField = 'strip me';

    const prepared = await prepareLegacyImport(value, database);
    const result = await importLegacyBackup(prepared, { database });
    const after = await readLegacySnapshot(database);
    const allAfter = await captureAllTables(database);

    expect(after.tasks.find((task) => task.id === 'task-1')?.title).toBe('Replacement title');
    expect(after.tasks.some((task) => task.id === 'task-new')).toBe(true);
    expect(after.tasks.some((task) => task.id === 'task-keep')).toBe(true);
    expect(after.flashcards).toEqual(current.flashcards);
    expect(after.notes[0]).not.toHaveProperty('ignoredLegacyField');
    expect(result.summary.replacementCounts.tasks).toBe(1);
    expect(result.summary.newCounts.tasks).toBe(1);
    for (const table of [
      'goals',
      'ai_conversations',
      'statistics',
      'achievement_definitions',
      'user_achievements',
      'notifications',
    ]) {
      expect(allAfter[table]).toEqual(omittedBefore[table]);
    }
  });

  it('calls refresh only after commit and verification', async () => {
    const database = await createProductionSchemaTestDatabase();
    const prepared = await prepareLegacyImport(legacyFile(), database);
    const refresh = vi.fn();
    await importLegacyBackup(prepared, { database, refresh });
    expect(refresh).toHaveBeenCalledOnce();
    expect((await database.users.get('user-1'))?.email).toBe('ada@example.test');
  });

  it('reports refresh failure as post-commit without claiming rollback', async () => {
    const database = await createProductionSchemaTestDatabase();
    const prepared = await prepareLegacyImport(legacyFile(), database);
    await expect(importLegacyBackup(prepared, {
      database,
      refresh: () => {
        throw new Error('refresh detail');
      },
    })).rejects.toBeInstanceOf(LegacyImportCommittedError);
    expect(await database.users.get('user-1')).toBeDefined();
  });

  it.each([
    ['first', 'users'],
    ['middle', 'tasks'],
    ['final', 'sessions'],
  ] as const)('rolls back all represented tables when the %s write fails', async (_position, table) => {
    const database = await createProductionSchemaTestDatabase();
    await seedAllTables(database, fullSnapshot());
    const prepared = await prepareLegacyImport(legacyFile(), database);
    const before = await captureAllTables(database);
    vi.spyOn(database.table(table), 'bulkPut').mockRejectedValue(new Error('injected write failure'));

    await expect(importLegacyBackup(prepared, { database })).rejects.toThrow(/rolled back/i);
    expect(await captureAllTables(database)).toEqual(before);
  });

  it('causes zero mutation for secret, duplicate, dangling, and conflicting validation failures', async () => {
    const database = await createProductionSchemaTestDatabase();
    await seedAllTables(database, fullSnapshot());
    const before = await captureAllTables(database);
    const invalidValues: Record<string, unknown>[] = [];

    const secret = legacyFile();
    ((secret.notes as unknown[])[0] as Record<string, unknown>).apiKey = 'private';
    invalidValues.push(secret);

    const duplicate = legacyFile();
    (duplicate.tasks as LegacyBackupData['tasks']).push(
      structuredClone((duplicate.tasks as LegacyBackupData['tasks'])[0]),
    );
    invalidValues.push(duplicate);

    const dangling = legacyFile();
    (dangling.notes as LegacyBackupData['notes'])[0].subjectId = 'missing';
    invalidValues.push(dangling);

    const conflict = legacyFile();
    (conflict.users as LegacyBackupData['users']).push({
      ...(conflict.users as LegacyBackupData['users'])[0],
      id: 'user-conflict',
    });
    invalidValues.push(conflict);

    for (const value of invalidValues) {
      await expect(prepareLegacyImport(value, database)).rejects.toThrow();
      expect(await captureAllTables(database)).toEqual(before);
    }
  });
});

describe('WP-05 production scope invariants', () => {
  it('uses an eight-table merge transaction with no clear or restore implementation', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/services/backupService.ts'), 'utf8');
    const start = source.indexOf('export async function importLegacyBackup');
    const end = source.indexOf('export function getLegacyImportErrorMessage', start);
    const importBody = source.slice(start, end);

    expect(LEGACY_BACKUP_TABLES).toEqual([
      'users',
      'settings',
      'subjects',
      'topics',
      'tasks',
      'notes',
      'flashcards',
      'sessions',
    ]);
    expect(importBody).toContain("database.transaction('rw', transactionTables");
    expect(importBody).toContain('.bulkPut(');
    expect(importBody).not.toContain('.clear(');
    expect(importBody).not.toMatch(/restore|safety backup|verification marker/i);
  });
});
