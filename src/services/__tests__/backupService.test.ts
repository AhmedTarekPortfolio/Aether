import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AetherDatabase,
  CANONICAL_ACHIEVEMENT_DEFINITIONS,
} from '../../db/database';
import {
  getKnownProviderProfileIds,
  LOCAL_PROVIDER_ID,
} from '../ai/providerProfiles';
import {
  createUniqueDatabaseName,
  deleteTestDatabase,
  openTestDatabase,
} from '../../test/indexedDbHarness';
import {
  AETHER_BACKUP_FORMAT,
  AETHER_BACKUP_VERSION,
  AETHER_DATABASE_SCHEMA_VERSION,
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  type AetherBackupDataV2,
  type AetherBackupV2,
  type PersistenceTableName,
} from '../../types';
import {
  BackupValidationError,
  buildBackupV2,
  calculateBackupRecordCounts,
  createBackupFilename,
  downloadBackupJson,
  exportFullBackup,
  getBackupErrorMessage,
  readBackupSnapshot,
  serializeBackupV2,
  validateBackupSnapshot,
  validateBackupV2,
} from '../backupService';

const databasesToClean = new Set<string>();

function validSnapshot(): AetherBackupDataV2 {
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
      content: 'Traversal summary',
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
    goals: [{
      id: 'goal-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      title: 'Finish review',
      description: 'Complete the graph unit',
      type: 'task_completion',
      targetValue: 1,
      currentValue: 0,
      unit: 'task',
      deadline: null,
      status: 'active',
      createdAt: 900,
      completedAt: null,
    }],
    ai_conversations: [{
      id: 'ai-1',
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: 'task-1',
      role: 'assistant',
      mode: 'tutor',
      prompt: 'Explain BFS',
      response: 'BFS explores level by level.',
      content: 'BFS explores level by level.',
      timestamp: 1000,
      generationStatus: 'complete',
      explanation: { confidence: 0.9, factors: ['local context'] },
    }],
    statistics: [{
      id: 'statistic-1',
      userId: 'user-1',
      metricKey: 'focus_minutes',
      periodStart: 1000,
      periodEnd: 2000,
      value: 25,
      computedAt: 2100,
    }],
    achievement_definitions: structuredClone(CANONICAL_ACHIEVEMENT_DEFINITIONS),
    user_achievements: [{
      id: 'user-achievement-1',
      userId: 'user-1',
      achievementId: 'ach_first_task',
      progress: 1,
      unlockedAt: null,
    }],
    notifications: [{
      id: 'notification-1',
      userId: 'user-1',
      type: 'deadline',
      title: 'Due soon',
      message: 'Review is due soon.',
      relatedTaskId: 'task-1',
      relatedSubjectId: 'subject-1',
      read: false,
      createdAt: 1100,
    }],
  };
}

function cloneSnapshot(): AetherBackupDataV2 {
  return structuredClone(validSnapshot());
}

function asMutableRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function emptySnapshot(): AetherBackupDataV2 {
  return Object.fromEntries(
    PERSISTENCE_TABLES.map((table) => [table, []]),
  ) as unknown as AetherBackupDataV2;
}

async function createProductionSchemaTestDatabase(): Promise<AetherDatabase> {
  const productionMetadata = new AetherDatabase();
  const stores = Object.fromEntries(productionMetadata.tables.map((table) => [
    table.name,
    [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(', '),
  ]));
  const name = createUniqueDatabaseName('wp04-backup');
  databasesToClean.add(name);
  const database = new Dexie(name);
  database.version(productionMetadata.verno).stores(stores);
  await openTestDatabase(database);
  return database as unknown as AetherDatabase;
}

async function replaceDatabaseContents(
  database: AetherDatabase,
  snapshot: AetherBackupDataV2,
): Promise<void> {
  await database.transaction(
    'rw',
    PERSISTENCE_TABLES.map((table) => database.table(table)),
    async () => {
      for (const table of PERSISTENCE_TABLES) {
        await database.table(table).clear();
        await database.table(table).bulkAdd(snapshot[table]);
      }
    },
  );
}

async function captureDatabaseContents(
  database: AetherDatabase,
): Promise<AetherBackupDataV2> {
  return readBackupSnapshot(database);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  await Promise.all([...databasesToClean].map((name) => deleteTestDatabase(name)));
  databasesToClean.clear();
});

describe('WP-04 Version 2 envelope and serialization', () => {
  it('builds and revalidates the exact complete 14-table envelope', () => {
    const snapshot = cloneSnapshot();
    const backup = buildBackupV2(snapshot, '2026-07-25T12:34:56.789Z');
    const json = serializeBackupV2(backup);
    const reparsed: unknown = JSON.parse(json);

    validateBackupV2(reparsed);
    expect(backup.format).toBe(AETHER_BACKUP_FORMAT);
    expect(backup.version).toBe(AETHER_BACKUP_VERSION);
    expect(backup.schemaVersion).toBe(AETHER_DATABASE_SCHEMA_VERSION);
    expect(backup.applicationVersion.trim()).not.toBe('');
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    expect(Object.keys(backup.data)).toEqual(PERSISTENCE_TABLES);
    expect(Object.keys(backup.recordCounts)).toEqual(PERSISTENCE_TABLES);
    expect(backup.recordCounts).toEqual(calculateBackupRecordCounts(snapshot));
    expect(createBackupFilename(backup.exportedAt)).toMatch(
      /^Aether_Backup_V2_[0-9A-Za-z_-]+\.json$/,
    );
  });

  it('accepts an empty workspace and canonical definitions with empty user-owned tables', () => {
    const snapshot = emptySnapshot();
    snapshot.achievement_definitions = cloneSnapshot().achievement_definitions;
    const backup = buildBackupV2(snapshot, '2026-07-25T00:00:00.000Z');

    expect(backup.recordCounts.achievement_definitions).toBe(4);
    for (const table of PERSISTENCE_TABLES.filter(
      (table) => table !== 'achievement_definitions',
    )) {
      expect(backup.recordCounts[table]).toBe(0);
    }
  });

  it('rejects unknown, missing, additional, and mismatched envelope keys and counts', () => {
    const valid = buildBackupV2(cloneSnapshot(), '2026-07-25T00:00:00.000Z');
    const cases: unknown[] = [];

    const unknownTop = structuredClone(valid) as AetherBackupV2 & { extra?: boolean };
    unknownTop.extra = true;
    cases.push(unknownTop);

    const unknownCount = structuredClone(valid) as AetherBackupV2 & {
      recordCounts: AetherBackupV2['recordCounts'] & { extra?: number };
    };
    unknownCount.recordCounts.extra = 0;
    cases.push(unknownCount);

    const missingCount = structuredClone(valid);
    delete asMutableRecord(missingCount.recordCounts).users;
    cases.push(missingCount);

    const mismatchedCount = structuredClone(valid);
    mismatchedCount.recordCounts.users = 99;
    cases.push(mismatchedCount);

    const unknownTable = structuredClone(valid);
    asMutableRecord(unknownTable.data).extra = [];
    cases.push(unknownTable);

    const missingTable = structuredClone(valid);
    delete asMutableRecord(missingTable.data).users;
    cases.push(missingTable);

    cases.forEach((candidate) => expect(() => validateBackupV2(candidate)).toThrow(
      BackupValidationError,
    ));
  });

  it.each([
    '2024-02-29T23:59:59.999Z',
    '2026-07-25T00:00:00.000Z',
  ])('accepts canonical semantic UTC timestamp %s', (exportedAt) => {
    expect(() => buildBackupV2(cloneSnapshot(), exportedAt)).not.toThrow();
  });

  it.each([
    '2026-02-31T00:00:00.000Z',
    '2025-02-29T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z',
    '2026-01-01T25:00:00.000Z',
    '2026-01-01T00:00:00.000',
    '2026-01-01T00:00:00.000+00:00',
    '2026-01-01T00:00:00Z',
    'not-a-date',
    '',
  ])('rejects non-semantic or non-canonical envelope timestamp %j', (exportedAt) => {
    const invalidTimestamp = buildBackupV2(cloneSnapshot(), '2026-07-25T00:00:00.000Z');
    invalidTimestamp.exportedAt = exportedAt;
    expect(() => validateBackupV2(invalidTimestamp)).toThrow(/timestamp/i);
  });

  it('rejects a credential-shaped application version', () => {
    const secretVersion = buildBackupV2(
      cloneSnapshot(),
      '2026-07-25T00:00:00.000Z',
    );
    secretVersion.applicationVersion = 'sk-syntheticCredential123';
    expect(() => validateBackupV2(secretVersion)).toThrow(BackupValidationError);
  });
});

describe('WP-04 strict record, ID, timestamp, and AI validation', () => {
  it('derives provider IDs from supplied non-secret metadata without exposing profile contents', () => {
    const profileMetadata = [
      { id: LOCAL_PROVIDER_ID, name: 'not returned' },
      { id: 'profile-safe-id', apiKey: 'not inspected' },
    ];

    expect(getKnownProviderProfileIds(profileMetadata)).toEqual([
      LOCAL_PROVIDER_ID,
      'profile-safe-id',
    ]);
  });

  it('rejects missing, empty, non-string, and duplicate primary keys', () => {
    const missing = cloneSnapshot();
    delete asMutableRecord(missing.users[0]).id;
    expect(() => validateBackupSnapshot(missing)).toThrow(BackupValidationError);

    const empty = cloneSnapshot();
    empty.users[0].id = '';
    expect(() => validateBackupSnapshot(empty)).toThrow(BackupValidationError);

    const nonString = cloneSnapshot();
    asMutableRecord(nonString.users[0]).id = 42;
    expect(() => validateBackupSnapshot(nonString)).toThrow(BackupValidationError);

    const duplicate = cloneSnapshot();
    duplicate.users.push(structuredClone(duplicate.users[0]));
    expect(() => validateBackupSnapshot(duplicate)).toThrow(/duplicate id/i);
  });

  it('rejects unknown record properties without stripping them', () => {
    const snapshot = cloneSnapshot();
    asMutableRecord(snapshot.tasks[0]).unexpected = 'value';
    expect(() => validateBackupSnapshot(snapshot)).toThrow(/unknown field/i);
    expect(asMutableRecord(snapshot.tasks[0]).unexpected).toBe('value');
  });

  it.each([
    ['users', 'createdAt'],
    ['settings', 'updatedAt'],
    ['subjects', 'createdAt'],
    ['tasks', 'createdAt'],
    ['notes', 'updatedAt'],
    ['flashcards', 'nextReviewDate'],
    ['sessions', 'completedAt'],
    ['goals', 'createdAt'],
    ['ai_conversations', 'timestamp'],
    ['statistics', 'computedAt'],
    ['notifications', 'createdAt'],
  ] as const)('rejects invalid required timestamps in %s.%s', (table, field) => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, '2026-01-01']) {
      const snapshot = cloneSnapshot();
      asMutableRecord(snapshot[table][0])[field] = invalid;
      expect(() => validateBackupSnapshot(snapshot)).toThrow(BackupValidationError);
    }
  });

  it('accepts omitted optional timestamps and supported nullable timestamps', () => {
    const snapshot = cloneSnapshot();
    delete snapshot.topics[0].lastReviewedAt;
    delete snapshot.tasks[0].dueDate;
    delete snapshot.tasks[0].completedAt;
    snapshot.goals[0].deadline = null;
    snapshot.goals[0].completedAt = null;
    snapshot.user_achievements[0].unlockedAt = null;
    expect(() => validateBackupSnapshot(snapshot)).not.toThrow();
  });

  it('rejects invalid statistic period ordering', () => {
    const snapshot = cloneSnapshot();
    snapshot.statistics[0].periodEnd = snapshot.statistics[0].periodStart - 1;
    expect(() => validateBackupSnapshot(snapshot)).toThrow(/period ordering/i);
  });

  it('accepts known statuses and both legacy missing-status content forms', () => {
    for (const status of ['complete', 'stopped', 'failed'] as const) {
      const snapshot = cloneSnapshot();
      snapshot.ai_conversations[0].generationStatus = status;
      expect(() => validateBackupSnapshot(snapshot)).not.toThrow();
    }

    const assistantContent = cloneSnapshot();
    delete assistantContent.ai_conversations[0].generationStatus;
    assistantContent.ai_conversations[0].prompt = '';
    assistantContent.ai_conversations[0].response = 'Meaningful response';
    expect(() => validateBackupSnapshot(assistantContent)).not.toThrow();

    const promptOnly = cloneSnapshot();
    delete promptOnly.ai_conversations[0].generationStatus;
    delete promptOnly.ai_conversations[0].content;
    delete promptOnly.ai_conversations[0].response;
    promptOnly.ai_conversations[0].prompt = 'Stored prompt';
    expect(() => validateBackupSnapshot(promptOnly)).not.toThrow();
  });

  it('rejects missing status without meaningful content and unknown statuses', () => {
    const emptyLegacy = cloneSnapshot();
    delete emptyLegacy.ai_conversations[0].generationStatus;
    emptyLegacy.ai_conversations[0].content = ' ';
    emptyLegacy.ai_conversations[0].prompt = '';
    emptyLegacy.ai_conversations[0].response = '';
    expect(() => validateBackupSnapshot(emptyLegacy)).toThrow(/meaningful legacy content/i);

    const unknown = cloneSnapshot();
    asMutableRecord(unknown.ai_conversations[0]).generationStatus = 'pending';
    expect(() => validateBackupSnapshot(unknown)).toThrow(/generationStatus/i);
  });
});

describe('WP-04 relationships and achievement definitions', () => {
  it('accepts every valid required and present optional relationship', () => {
    expect(() => validateBackupSnapshot(cloneSnapshot())).not.toThrow();
  });

  it('rejects every dangling required or present optional relationship', () => {
    for (const relationship of RELATIONSHIP_CONTRACTS) {
      const snapshot = cloneSnapshot();
      const record = snapshot[relationship.childTable][0] as unknown as Record<string, unknown>;
      record[String(relationship.childField)] = 'missing-parent';
      expect(
        () => validateBackupSnapshot(snapshot),
        `${relationship.childTable}.${String(relationship.childField)}`,
      ).toThrow(/relationship/i);
    }
  });

  it('preserves and validates exact null-versus-omitted relationship behavior', () => {
    const valid = cloneSnapshot();
    delete valid.subjects[0].userId;
    valid.sessions[0].subjectId = null;
    valid.sessions[0].taskId = null;
    valid.goals[0].subjectId = null;
    valid.ai_conversations[0].subjectId = null;
    valid.ai_conversations[0].taskId = null;
    expect(() => validateBackupSnapshot(valid)).not.toThrow();

    const invalidNull = cloneSnapshot();
    asMutableRecord(invalidNull.notes[0]).subjectId = null;
    expect(() => validateBackupSnapshot(invalidNull)).toThrow(BackupValidationError);
  });

  it('accepts exact, compatible-subset, and empty canonical definition states', () => {
    expect(() => validateBackupSnapshot(cloneSnapshot())).not.toThrow();

    const subset = cloneSnapshot();
    subset.achievement_definitions = subset.achievement_definitions.slice(0, 1);
    expect(() => validateBackupSnapshot(subset)).not.toThrow();

    const empty = cloneSnapshot();
    empty.achievement_definitions = [];
    expect(() => validateBackupSnapshot(empty)).not.toThrow();
  });

  it('rejects duplicate definition IDs, duplicate keys, and unsupported progress references', () => {
    const duplicateId = cloneSnapshot();
    duplicateId.achievement_definitions.push(
      structuredClone(duplicateId.achievement_definitions[0]),
    );
    expect(() => validateBackupSnapshot(duplicateId)).toThrow(/duplicate id/i);

    const duplicateKey = cloneSnapshot();
    duplicateKey.achievement_definitions.push({
      ...structuredClone(duplicateKey.achievement_definitions[0]),
      id: 'achievement-2',
    });
    expect(() => validateBackupSnapshot(duplicateKey)).toThrow(/duplicate key/i);

    const unsupported = cloneSnapshot();
    unsupported.user_achievements[0].achievementId = 'unsupported';
    expect(() => validateBackupSnapshot(unsupported)).toThrow(/relationship/i);
  });

  it.each([
    ['id', 'unsupported-achievement'],
    ['key', 'unsupported_key'],
    ['title', 'Changed title'],
    ['description', 'Changed description'],
    ['category', 'changed-category'],
    ['targetValue', 999],
    ['icon', 'ChangedIcon'],
  ] as const)('rejects a non-canonical achievement %s', (field, value) => {
    const snapshot = cloneSnapshot();
    asMutableRecord(snapshot.achievement_definitions[0])[field] = value;
    expect(() => validateBackupSnapshot(snapshot)).toThrow(/canonical/i);
  });

  it('rejects an achievement ID/key mismatch', () => {
    const snapshot = cloneSnapshot();
    snapshot.achievement_definitions[0].key = CANONICAL_ACHIEVEMENT_DEFINITIONS[1].key;
    expect(() => validateBackupSnapshot(snapshot)).toThrow(/canonical/i);
  });
});

describe('WP-04 secret exclusion and redacted errors', () => {
  it.each([
    ['apiKey', 'synthetic-value'],
    ['authorization', 'synthetic-value'],
    ['access_token', 'synthetic-value'],
    ['clientSecret', 'synthetic-value'],
    ['password', 'synthetic-value'],
  ])('rejects prohibited %s fields without exposing their values', (field, secret) => {
    const snapshot = cloneSnapshot();
    asMutableRecord(snapshot.settings[0])[field] = secret;
    let error: unknown;
    try {
      validateBackupSnapshot(snapshot);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BackupValidationError);
    expect(getBackupErrorMessage(error)).not.toContain(secret);
  });

  it.each([
    'sk-synthetic_credential_1234567890abcdef',
    'nvapi-synthetic_credential_1234567890abcdef',
    'Bearer SyntheticCredential1234567890._-',
    '-----BEGIN PRIVATE KEY-----',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.synthetic_signature_123456',
  ])('rejects prohibited string values without echoing them', (secret) => {
    const snapshot = cloneSnapshot();
    snapshot.notes[0].content = secret;
    expect(() => validateBackupSnapshot(snapshot)).toThrow(BackupValidationError);
    try {
      validateBackupSnapshot(snapshot);
    } catch (error) {
      expect(getBackupErrorMessage(error)).not.toContain(secret);
    }
  });

  it.each([
    'Bearer token authentication is used by APIs',
    'Bearer market',
    'secret: spaced-repetition',
    'password = variable',
    'const token = response.token',
    'The secret to revision is repetition.',
    'Authorization is a security concept studied in distributed systems.',
    'For every key in the matrix, calculate the eigenvalue and record the proof.',
  ])('accepts benign academic and programming content: %s', (content) => {
    const snapshot = cloneSnapshot();
    snapshot.notes[0].content = content;
    expect(() => validateBackupSnapshot(snapshot)).not.toThrow();
  });

  it('finds nested prohibited fields and values and redacts unexpected runtime failures', () => {
    const nestedField = cloneSnapshot();
    asMutableRecord(nestedField.ai_conversations[0].explanation).apiKey = 'nested-value';
    expect(() => validateBackupSnapshot(nestedField)).toThrow(BackupValidationError);

    const snapshot = cloneSnapshot();
    snapshot.ai_conversations[0].explanation = {
      confidence: 0.5,
      factors: ['sk-nested_synthetic_credential_1234567890'],
    };
    expect(() => validateBackupSnapshot(snapshot)).toThrow(BackupValidationError);
    expect(getBackupErrorMessage(new Error('sk-privateRuntimeValue'))).not.toContain(
      'sk-privateRuntimeValue',
    );
  });
});

describe('WP-04 browser download cleanup', () => {
  function installObjectUrlMocks() {
    const NativeURL = globalThis.URL;
    const createObjectURL = vi.fn(() => 'blob:wp04-backup');
    const revokeObjectURL = vi.fn();
    class MockURL extends NativeURL {}
    Object.defineProperties(MockURL, {
      createObjectURL: { value: createObjectURL, configurable: true },
      revokeObjectURL: { value: revokeObjectURL, configurable: true },
    });
    vi.stubGlobal('URL', MockURL);
    return { createObjectURL, revokeObjectURL };
  }

  it('creates, clicks, removes, and revokes a successful browser download exactly once', () => {
    const { createObjectURL, revokeObjectURL } = installObjectUrlMocks();
    const append = vi.spyOn(document.body, 'appendChild');
    const remove = vi.spyOn(document.body, 'removeChild');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBackupJson('{"ok":true}', 'Aether_Backup_V2_test.json');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="Aether_Backup_V2_test.json"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wp04-backup');
  });

  it('revokes the URL and propagates the original createElement error', () => {
    const { revokeObjectURL } = installObjectUrlMocks();
    const originalError = new Error('createElement failed');
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw originalError;
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(originalError);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('revokes the URL when appendChild fails', () => {
    const { revokeObjectURL } = installObjectUrlMocks();
    const originalError = new Error('appendChild failed');
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw originalError;
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(originalError);
    expect(document.querySelector('a[download="backup.json"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('removes the anchor and revokes the URL when click fails', () => {
    const { revokeObjectURL } = installObjectUrlMocks();
    const originalError = new Error('click failed');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw originalError;
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(originalError);
    expect(document.querySelector('a[download="backup.json"]')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('still revokes when anchor removal fails', () => {
    const { revokeObjectURL } = installObjectUrlMocks();
    const removalError = new Error('remove failed');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {
      throw removalError;
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(removalError);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('does not mask the original click error when removal also fails', () => {
    const { revokeObjectURL } = installObjectUrlMocks();
    const clickError = new Error('original click failed');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw clickError;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {
      throw new Error('secondary removal failed');
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(clickError);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('does not attempt revocation when URL creation fails', () => {
    const { createObjectURL, revokeObjectURL } = installObjectUrlMocks();
    const originalError = new Error('createObjectURL failed');
    createObjectURL.mockImplementation(() => {
      throw originalError;
    });

    expect(() => downloadBackupJson('{}', 'backup.json')).toThrow(originalError);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});

describe('WP-04 real Dexie export and no-mutation guarantees', () => {
  it('exports a populated all-table snapshot without mutating any database record', async () => {
    const database = await createProductionSchemaTestDatabase();
    const snapshot = cloneSnapshot();
    await replaceDatabaseContents(database, snapshot);
    const before = await captureDatabaseContents(database);
    const download = vi.fn();

    const result = await exportFullBackup({
      database,
      now: () => new Date('2026-07-25T12:34:56.789Z'),
      download,
    });
    const after = await captureDatabaseContents(database);

    expect(after).toEqual(before);
    expect(result.backup.data).toEqual(before);
    expect(result.backup.recordCounts).toEqual(calculateBackupRecordCounts(before));
    expect(download).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(result.json, result.filename);
    expect(result.filename).toContain('Aether_Backup_V2_');
    validateBackupV2(JSON.parse(result.json));
  });

  it('sanitizes current-writer-shaped historical provider subject IDs in the export copy only', async () => {
    const database = await createProductionSchemaTestDatabase();
    const snapshot = cloneSnapshot();
    snapshot.ai_conversations = [{
      id: 'ai-current-writer',
      mode: 'chat',
      prompt: 'Explain the lesson',
      response: 'A complete explanation',
      timestamp: 1200,
      subjectId: LOCAL_PROVIDER_ID,
    }];
    await replaceDatabaseContents(database, snapshot);
    const before = await captureDatabaseContents(database);

    const result = await exportFullBackup({ database, download: vi.fn() });

    expect(await captureDatabaseContents(database)).toEqual(before);
    expect(before.ai_conversations[0].subjectId).toBe(LOCAL_PROVIDER_ID);
    expect(result.backup.data.ai_conversations[0].subjectId).toBeNull();
    expect(result.json).not.toContain(LOCAL_PROVIDER_ID);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('ai-current-writer');
    expect(result.warnings[0]).toMatch(/historical AI provider association/i);
    expect(result.warnings[0]).not.toContain(LOCAL_PROVIDER_ID);
  });

  it('preserves legitimate AI subject IDs and rejects unknown dangling AI subject IDs', async () => {
    const validDatabase = await createProductionSchemaTestDatabase();
    await replaceDatabaseContents(validDatabase, cloneSnapshot());
    const validResult = await exportFullBackup({ database: validDatabase, download: vi.fn() });
    expect(validResult.backup.data.ai_conversations[0].subjectId).toBe('subject-1');
    expect(validResult.warnings).toEqual([]);

    const invalidDatabase = await createProductionSchemaTestDatabase();
    const invalid = cloneSnapshot();
    invalid.ai_conversations[0].subjectId = 'unknown-provider-or-subject';
    await replaceDatabaseContents(invalidDatabase, invalid);
    const before = await captureDatabaseContents(invalidDatabase);
    const download = vi.fn();

    await expect(exportFullBackup({ database: invalidDatabase, download })).rejects.toThrow(
      /relationship/i,
    );
    expect(download).not.toHaveBeenCalled();
    expect(await captureDatabaseContents(invalidDatabase)).toEqual(before);
  });

  it('exports canonical definitions with otherwise empty real tables', async () => {
    const database = await createProductionSchemaTestDatabase();
    const snapshot = emptySnapshot();
    snapshot.achievement_definitions = cloneSnapshot().achievement_definitions;
    await replaceDatabaseContents(database, snapshot);

    const result = await exportFullBackup({ database, download: vi.fn() });

    expect(result.backup.recordCounts.achievement_definitions).toBe(4);
    expect(result.backup.recordCounts.users).toBe(0);
  });

  it('blocks incompatible canonical definitions without mutating the database', async () => {
    const database = await createProductionSchemaTestDatabase();
    const invalid = cloneSnapshot();
    invalid.achievement_definitions[0].title = 'Modified title';
    await replaceDatabaseContents(database, invalid);
    const before = await captureDatabaseContents(database);
    const download = vi.fn();

    await expect(exportFullBackup({ database, download })).rejects.toThrow(/canonical/i);
    expect(download).not.toHaveBeenCalled();
    expect(await captureDatabaseContents(database)).toEqual(before);
  });

  it('blocks download on pre-export validation failure without repairing the database', async () => {
    const database = await createProductionSchemaTestDatabase();
    const invalid = cloneSnapshot();
    asMutableRecord(invalid.ai_conversations[0]).generationStatus = 'pending';
    await replaceDatabaseContents(database, invalid);
    const before = await captureDatabaseContents(database);
    const download = vi.fn();

    await expect(exportFullBackup({ database, download })).rejects.toThrow(
      BackupValidationError,
    );

    expect(download).not.toHaveBeenCalled();
    expect(await captureDatabaseContents(database)).toEqual(before);
  });

  it('blocks download when post-serialization revalidation fails', async () => {
    const database = await createProductionSchemaTestDatabase();
    await replaceDatabaseContents(database, cloneSnapshot());
    const download = vi.fn();
    const tampered = buildBackupV2(cloneSnapshot(), '2026-07-25T00:00:00.000Z');
    tampered.recordCounts.users = 999;
    const tamperedJson = JSON.stringify(tampered);
    vi.spyOn(JSON, 'stringify').mockReturnValueOnce(tamperedJson);

    await expect(exportFullBackup({ database, download })).rejects.toThrow(
      BackupValidationError,
    );
    expect(download).not.toHaveBeenCalled();
  });
});
