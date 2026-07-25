import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_DEFINITION_AUTHORITY,
  AETHER_BACKUP_FORMAT,
  AETHER_BACKUP_VERSION,
  AETHER_DATABASE_SCHEMA_VERSION,
  AI_EXPLANATION_FIELD_ALLOWLIST,
  AI_PERSISTENCE_OUTCOMES,
  BACKUP_TOP_LEVEL_KEYS,
  ENVELOPE_TIMESTAMP_RULE,
  GENERATION_STATUSES,
  GENERATION_STATUS_COMPATIBILITY,
  HISTORICAL_AI_SUBJECT_REFERENCE_COMPATIBILITY,
  LEGACY_BACKUP_TABLES,
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  RELATIONSHIP_VALIDATION_POLICY,
  RESTORE_CANCELLATION_CONTRACT,
  RESTORE_VERIFICATION_MARKER_CONTRACT,
  SAFETY_BACKUP_CONTRACTS,
  SECRET_EXCLUSION_POLICY,
  TABLE_FIELD_ALLOWLISTS,
  TABLE_TIMESTAMP_RULES,
  TIMESTAMP_ORDERING_RULES,
  UNKNOWN_FIELD_POLICY,
  type AetherBackupDataV2,
  type AetherBackupRecordCounts,
  type AetherBackupV2,
  type PersistedAIConversationRecord,
  type PersistenceRecordMap,
  type PersistenceTableName,
  type RestoreVerificationMarkerV1,
} from '..';
import type { AIConversation } from '..';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;
type RequiredKeys<T> = {
  [Key in keyof T]-?: object extends Pick<T, Key> ? never : Key;
}[keyof T];

type _AllTablesHaveRecordTypes = Assert<
  Equal<keyof PersistenceRecordMap, PersistenceTableName>
>;
type _DataHasExactlyAllTables = Assert<
  Equal<keyof AetherBackupDataV2, PersistenceTableName>
>;
type _CountsHaveExactlyAllTables = Assert<
  Equal<keyof AetherBackupRecordCounts, PersistenceTableName>
>;
type _AIRequiredWriterFields = Assert<
  Equal<
    RequiredKeys<PersistedAIConversationRecord>,
    | 'id'
    | 'userId'
    | 'role'
    | 'mode'
    | 'prompt'
    | 'response'
    | 'timestamp'
    | 'generationStatus'
  >
>;
type _GenerationStatusMatchesProduction = Assert<
  Equal<
    PersistedAIConversationRecord['generationStatus'],
    NonNullable<AIConversation['generationStatus']>
  >
>;

const emptyCounts = {
  users: 0,
  settings: 0,
  subjects: 0,
  topics: 0,
  tasks: 0,
  notes: 0,
  flashcards: 0,
  sessions: 0,
  goals: 0,
  ai_conversations: 0,
  statistics: 0,
  achievement_definitions: 0,
  user_achievements: 0,
  notifications: 0,
} satisfies AetherBackupRecordCounts;

const emptyData = {
  users: [],
  settings: [],
  subjects: [],
  topics: [],
  tasks: [],
  notes: [],
  flashcards: [],
  sessions: [],
  goals: [],
  ai_conversations: [],
  statistics: [],
  achievement_definitions: [],
  user_achievements: [],
  notifications: [],
} satisfies AetherBackupDataV2;

const validFixture = {
  format: AETHER_BACKUP_FORMAT,
  version: AETHER_BACKUP_VERSION,
  schemaVersion: AETHER_DATABASE_SCHEMA_VERSION,
  applicationVersion: '1.0.0',
  exportedAt: '2026-07-25T00:00:00.000Z',
  recordCounts: emptyCounts,
  data: emptyData,
} satisfies AetherBackupV2;

describe('WP-02 backup envelope and allowlists', () => {
  it('freezes the exact V2 envelope and all 14 table names', () => {
    expect(Object.keys(validFixture)).toEqual(BACKUP_TOP_LEVEL_KEYS);
    expect(PERSISTENCE_TABLES).toHaveLength(14);
    expect(Object.keys(TABLE_FIELD_ALLOWLISTS)).toEqual(PERSISTENCE_TABLES);
    expect(Object.keys(validFixture.recordCounts)).toEqual(PERSISTENCE_TABLES);
    expect(Object.keys(validFixture.data)).toEqual(PERSISTENCE_TABLES);
  });

  it('freezes the eight legacy represented tables', () => {
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
  });

  it('uses exact production field allowlists and a separate nested AI allowlist', () => {
    expect(TABLE_FIELD_ALLOWLISTS).toEqual({
      users: ['id', 'name', 'email', 'academicLevel', 'createdAt', 'updatedAt'],
      settings: ['id', 'userId', 'theme', 'soundEnabled', 'aiProvider', 'notificationsEnabled', 'studyGoalHoursWeekly', 'updatedAt'],
      subjects: ['id', 'userId', 'name', 'code', 'color', 'confidenceRating', 'targetGrade', 'instructor', 'createdAt'],
      topics: ['id', 'subjectId', 'title', 'masteryLevel', 'lastReviewedAt'],
      tasks: ['id', 'userId', 'title', 'description', 'subjectId', 'dueDate', 'priority', 'estimatedMinutes', 'completedMinutes', 'status', 'createdAt', 'completedAt'],
      notes: ['id', 'userId', 'subjectId', 'topicId', 'title', 'content', 'tags', 'updatedAt', 'isFavorite'],
      flashcards: ['id', 'userId', 'subjectId', 'topicId', 'front', 'back', 'easeFactor', 'interval', 'repetitions', 'nextReviewDate'],
      sessions: ['id', 'userId', 'subjectId', 'taskId', 'type', 'durationMinutes', 'distractionCount', 'reflectionRating', 'notes', 'completedAt'],
      goals: ['id', 'userId', 'subjectId', 'title', 'description', 'type', 'targetValue', 'currentValue', 'unit', 'deadline', 'status', 'createdAt', 'completedAt'],
      ai_conversations: ['id', 'userId', 'subjectId', 'taskId', 'role', 'mode', 'content', 'prompt', 'response', 'timestamp', 'explanation', 'providerId', 'providerName', 'modelId', 'generationStatus'],
      statistics: ['id', 'userId', 'metricKey', 'periodStart', 'periodEnd', 'value', 'computedAt'],
      achievement_definitions: ['id', 'key', 'title', 'description', 'category', 'targetValue', 'icon'],
      user_achievements: ['id', 'userId', 'achievementId', 'progress', 'unlockedAt'],
      notifications: ['id', 'userId', 'type', 'title', 'message', 'relatedTaskId', 'relatedSubjectId', 'read', 'createdAt'],
    });
    expect(AI_EXPLANATION_FIELD_ALLOWLIST).toEqual(['confidence', 'factors']);
    expect(UNKNOWN_FIELD_POLICY).toEqual({
      version2: 'reject',
      legacy: 'strip-with-warning',
    });
    expect(SECRET_EXCLUSION_POLICY).toMatchObject({
      readsCredentialStores: false,
      rejectOnMatch: true,
    });
  });
});

describe('WP-02 timestamp and relationship contracts', () => {
  it('requires ISO envelope time and finite epoch record times', () => {
    expect(ENVELOPE_TIMESTAMP_RULE).toEqual({
      field: 'exportedAt',
      presence: 'required',
      representation: 'iso-8601',
    });
    expect(Object.keys(TABLE_TIMESTAMP_RULES)).toEqual(PERSISTENCE_TABLES);
    expect(Object.values(TABLE_TIMESTAMP_RULES).flat()).toSatisfy(
      (rules: readonly { representation: string }[]) =>
        rules.every((rule) => rule.representation === 'finite-epoch-milliseconds'),
    );
    expect(Object.fromEntries(
      Object.entries(TABLE_TIMESTAMP_RULES).map(([table, rules]) => [
        table,
        rules.map(({ field, presence }) => `${field}:${presence}`),
      ]),
    )).toEqual({
      users: ['createdAt:required', 'updatedAt:required'],
      settings: ['updatedAt:required'],
      subjects: ['createdAt:required'],
      topics: ['lastReviewedAt:optional'],
      tasks: ['dueDate:optional', 'createdAt:required', 'completedAt:optional'],
      notes: ['updatedAt:required'],
      flashcards: ['nextReviewDate:required'],
      sessions: ['completedAt:required'],
      goals: ['deadline:optional-nullable', 'createdAt:required', 'completedAt:optional-nullable'],
      ai_conversations: ['timestamp:required'],
      statistics: ['periodStart:required', 'periodEnd:required', 'computedAt:required'],
      achievement_definitions: [],
      user_achievements: ['unlockedAt:optional-nullable'],
      notifications: ['createdAt:required'],
    });
    expect(TIMESTAMP_ORDERING_RULES).toEqual([
      {
        table: 'statistics',
        earlierField: 'periodStart',
        laterField: 'periodEnd',
        comparison: 'greater-than-or-equal',
      },
    ]);
  });

  it('freezes every documented parent relationship and validation scope', () => {
    expect(RELATIONSHIP_CONTRACTS).toHaveLength(25);
    expect(RELATIONSHIP_CONTRACTS.every(
      (contract) =>
        contract.parentField === 'id'
        && contract.version2ParentScope === 'incoming-only'
        && contract.invalidReferencePolicy === 'reject',
    )).toBe(true);
    expect(RELATIONSHIP_CONTRACTS.map((contract) => [
      `${contract.childTable}.${String(contract.childField)}->${contract.parentTable}`,
      contract.required ? 'required' : contract.serializedAbsence,
      contract.legacyParentScope,
    ])).toEqual([
      ['settings.userId->users', 'required', 'incoming-or-current'],
      ['subjects.userId->users', 'omitted', 'incoming-or-current'],
      ['topics.subjectId->subjects', 'required', 'incoming-or-current'],
      ['tasks.userId->users', 'omitted', 'incoming-or-current'],
      ['tasks.subjectId->subjects', 'omitted', 'incoming-or-current'],
      ['notes.userId->users', 'omitted', 'incoming-or-current'],
      ['notes.subjectId->subjects', 'required', 'incoming-or-current'],
      ['notes.topicId->topics', 'omitted', 'incoming-or-current'],
      ['flashcards.userId->users', 'omitted', 'incoming-or-current'],
      ['flashcards.subjectId->subjects', 'required', 'incoming-or-current'],
      ['flashcards.topicId->topics', 'omitted', 'incoming-or-current'],
      ['sessions.userId->users', 'omitted', 'incoming-or-current'],
      ['sessions.subjectId->subjects', 'omitted-or-null', 'incoming-or-current'],
      ['sessions.taskId->tasks', 'omitted-or-null', 'incoming-or-current'],
      ['goals.userId->users', 'omitted', 'not-represented'],
      ['goals.subjectId->subjects', 'omitted-or-null', 'not-represented'],
      ['ai_conversations.userId->users', 'omitted', 'not-represented'],
      ['ai_conversations.subjectId->subjects', 'omitted-or-null', 'not-represented'],
      ['ai_conversations.taskId->tasks', 'omitted-or-null', 'not-represented'],
      ['statistics.userId->users', 'omitted', 'not-represented'],
      ['user_achievements.userId->users', 'omitted', 'not-represented'],
      ['user_achievements.achievementId->achievement_definitions', 'required', 'not-represented'],
      ['notifications.userId->users', 'omitted', 'not-represented'],
      ['notifications.relatedTaskId->tasks', 'omitted', 'not-represented'],
      ['notifications.relatedSubjectId->subjects', 'omitted', 'not-represented'],
    ]);
    expect(RELATIONSHIP_VALIDATION_POLICY).toMatchObject({
      rejectEmptyStringReferences: true,
      rejectDanglingReferences: true,
      neverSilentlyNullOrUnassign: true,
    });
  });
});

describe('WP-02 achievement and AI persistence contracts', () => {
  it('makes installed achievement definitions authoritative without deleting progress', () => {
    expect(ACHIEVEMENT_DEFINITION_AUTHORITY).toMatchObject({
      authority: 'installed-canonical-definitions',
      acceptedIncomingSets: ['exact', 'compatible-subset', 'empty-diagnostic'],
      unsupportedIncomingPolicy: 'reject',
      incomingDefinitionCountIsDiagnosticOnly: true,
      preserveUserAchievementProgressOnRejection: true,
      legacyDefinitionsPolicy: 'untouched',
    });
  });

  it('freezes generation statuses and terminal persistence outcomes', () => {
    expect(GENERATION_STATUSES).toEqual(['complete', 'stopped', 'failed']);
    expect(AI_PERSISTENCE_OUTCOMES).toEqual([
      { outcome: 'complete', hasOutput: true, persist: true, generationStatus: 'complete' },
      { outcome: 'stopped-partial', hasOutput: true, persist: true, generationStatus: 'stopped' },
      { outcome: 'stopped-zero', hasOutput: false, persist: false, generationStatus: null },
      { outcome: 'failed-partial', hasOutput: true, persist: true, generationStatus: 'failed' },
      { outcome: 'failed-zero', hasOutput: false, persist: false, generationStatus: null },
      { outcome: 'local-only-or-no-evidence', hasOutput: true, persist: true, generationStatus: 'complete' },
    ]);
    expect(GENERATION_STATUS_COMPATIBILITY).toMatchObject({
      historicalMissingWithResponse: 'preserve-missing',
      historicalUnknown: 'preserve-unknown',
      incomingVersion2Missing: 'reject',
      incomingVersion2Unknown: 'reject',
      persistedErrorMetadata: 'forbidden',
      providerTypePersistence: 'forbidden',
    });
  });

  it('contains the bounded compatibility rule for historical provider IDs in subjectId', () => {
    expect(HISTORICAL_AI_SUBJECT_REFERENCE_COMPATIBILITY).toEqual({
      knownProviderProfileMatch: {
        exportSubjectId: null,
        copyToProviderIdOnlyWhenAbsent: true,
        emitWarning: true,
        mutateDatabase: false,
      },
      unknownDanglingSubjectId: 'reject-export',
    });
  });
});

describe('WP-02 recovery and runtime safety contracts', () => {
  const markerFixture = {
    key: 'aether.restoreVerification.v1',
    version: 1,
    state: 'transaction-started',
    runtime: 'browser',
    expectedPostRestoreCounts: emptyCounts,
    incomingBackupDigest: 'sha256:incoming',
    expectedStateDigest: 'sha256:state',
    startedAt: '2026-07-25T00:00:00.000Z',
  } satisfies RestoreVerificationMarkerV1;

  it('requires counts plus content digest in the durable marker', () => {
    expect(markerFixture.expectedStateDigest).not.toBe(markerFixture.incomingBackupDigest);
    expect(RESTORE_VERIFICATION_MARKER_CONTRACT).toMatchObject({
      key: markerFixture.key,
      version: markerFixture.version,
      digestAlgorithm: 'SHA-256',
      writeAndReadBackBeforeTransaction: true,
      sameCountDifferentContentPolicy: 'verification-failed',
    });
    expect(RESTORE_VERIFICATION_MARKER_CONTRACT.clearAfter).toContain('state-digest-check');
  });

  it('keeps browser and Electron safety guarantees runtime-specific', () => {
    expect(SAFETY_BACKUP_CONTRACTS.electron.requiredSteps).toEqual([
      'save-dialog',
      'selected-path',
      'write',
      'close',
      'existence-check',
      'readback-parse',
      'all-table-count-check',
      'secret-scan',
    ]);
    expect(SAFETY_BACKUP_CONTRACTS.electron.durableDeliveryClaim).toBe(
      'verified-after-readback',
    );
    expect(SAFETY_BACKUP_CONTRACTS.browser.durableDeliveryClaim).toBe(
      'cannot-verify-disk-delivery',
    );
    expect(SAFETY_BACKUP_CONTRACTS.browser.requiredSteps).toContain(
      'explicit-user-confirmation',
    );
  });

  it('allows cancellation only before the restore transaction starts', () => {
    expect(RESTORE_CANCELLATION_CONTRACT).toEqual({
      cancellableBeforeTransactionStart: true,
      cancellableAfterTransactionStart: false,
      abortSignalObservedInsideTransaction: false,
      terminalTransactionStates: ['commit', 'rollback'],
    });
  });
});
