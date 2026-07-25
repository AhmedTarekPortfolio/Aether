import type {
  AIConversation,
  AchievementDefinition,
  Flashcard,
  Goal,
  Note,
  NotificationItem,
  Session,
  Settings,
  Statistic,
  Subject,
  Task,
  Topic,
  User,
  UserAchievement,
} from './index';

export const AETHER_BACKUP_FORMAT = 'aether-backup' as const;
export const AETHER_BACKUP_VERSION = 2 as const;
export const AETHER_DATABASE_SCHEMA_VERSION = 3 as const;

export const PERSISTENCE_TABLES = [
  'users',
  'settings',
  'subjects',
  'topics',
  'tasks',
  'notes',
  'flashcards',
  'sessions',
  'goals',
  'ai_conversations',
  'statistics',
  'achievement_definitions',
  'user_achievements',
  'notifications',
] as const;

export const LEGACY_BACKUP_TABLES = [
  'users',
  'settings',
  'subjects',
  'topics',
  'tasks',
  'notes',
  'flashcards',
  'sessions',
] as const;

export type PersistenceTableName = (typeof PERSISTENCE_TABLES)[number];
export type LegacyBackupTableName = (typeof LEGACY_BACKUP_TABLES)[number];

export interface PersistenceRecordMap {
  users: User;
  settings: Settings;
  subjects: Subject;
  topics: Topic;
  tasks: Task;
  notes: Note;
  flashcards: Flashcard;
  sessions: Session;
  goals: Goal;
  ai_conversations: AIConversation;
  statistics: Statistic;
  achievement_definitions: AchievementDefinition;
  user_achievements: UserAchievement;
  notifications: NotificationItem;
}

export type AetherBackupDataV2 = {
  [Table in PersistenceTableName]: PersistenceRecordMap[Table][];
};

export type AetherBackupRecordCounts = {
  [Table in PersistenceTableName]: number;
};

export interface AetherBackupV2 {
  format: typeof AETHER_BACKUP_FORMAT;
  version: typeof AETHER_BACKUP_VERSION;
  schemaVersion: typeof AETHER_DATABASE_SCHEMA_VERSION;
  applicationVersion: string;
  exportedAt: string;
  recordCounts: AetherBackupRecordCounts;
  data: AetherBackupDataV2;
}

export const BACKUP_TOP_LEVEL_KEYS = [
  'format',
  'version',
  'schemaVersion',
  'applicationVersion',
  'exportedAt',
  'recordCounts',
  'data',
] as const satisfies readonly (keyof AetherBackupV2)[];

type FieldAllowlists = {
  [Table in PersistenceTableName]: readonly (keyof PersistenceRecordMap[Table])[];
};

export const TABLE_FIELD_ALLOWLISTS = {
  users: ['id', 'name', 'email', 'academicLevel', 'createdAt', 'updatedAt'],
  settings: [
    'id',
    'userId',
    'theme',
    'soundEnabled',
    'aiProvider',
    'notificationsEnabled',
    'studyGoalHoursWeekly',
    'updatedAt',
  ],
  subjects: [
    'id',
    'userId',
    'name',
    'code',
    'color',
    'confidenceRating',
    'targetGrade',
    'instructor',
    'createdAt',
  ],
  topics: ['id', 'subjectId', 'title', 'masteryLevel', 'lastReviewedAt'],
  tasks: [
    'id',
    'userId',
    'title',
    'description',
    'subjectId',
    'dueDate',
    'priority',
    'estimatedMinutes',
    'completedMinutes',
    'status',
    'createdAt',
    'completedAt',
  ],
  notes: [
    'id',
    'userId',
    'subjectId',
    'topicId',
    'title',
    'content',
    'tags',
    'updatedAt',
    'isFavorite',
  ],
  flashcards: [
    'id',
    'userId',
    'subjectId',
    'topicId',
    'front',
    'back',
    'easeFactor',
    'interval',
    'repetitions',
    'nextReviewDate',
  ],
  sessions: [
    'id',
    'userId',
    'subjectId',
    'taskId',
    'type',
    'durationMinutes',
    'distractionCount',
    'reflectionRating',
    'notes',
    'completedAt',
  ],
  goals: [
    'id',
    'userId',
    'subjectId',
    'title',
    'description',
    'type',
    'targetValue',
    'currentValue',
    'unit',
    'deadline',
    'status',
    'createdAt',
    'completedAt',
  ],
  ai_conversations: [
    'id',
    'userId',
    'subjectId',
    'taskId',
    'role',
    'mode',
    'content',
    'prompt',
    'response',
    'timestamp',
    'explanation',
    'providerId',
    'providerName',
    'modelId',
    'generationStatus',
  ],
  statistics: [
    'id',
    'userId',
    'metricKey',
    'periodStart',
    'periodEnd',
    'value',
    'computedAt',
  ],
  achievement_definitions: [
    'id',
    'key',
    'title',
    'description',
    'category',
    'targetValue',
    'icon',
  ],
  user_achievements: ['id', 'userId', 'achievementId', 'progress', 'unlockedAt'],
  notifications: [
    'id',
    'userId',
    'type',
    'title',
    'message',
    'relatedTaskId',
    'relatedSubjectId',
    'read',
    'createdAt',
  ],
} as const satisfies FieldAllowlists;

export const AI_EXPLANATION_FIELD_ALLOWLIST = [
  'confidence',
  'factors',
] as const satisfies readonly (keyof NonNullable<AIConversation['explanation']>)[];

export const UNKNOWN_FIELD_POLICY = {
  version2: 'reject',
  legacy: 'strip-with-warning',
} as const;

export const SECRET_EXCLUSION_POLICY = {
  scanFieldNamesRecursively: true,
  scanStringValuesForKnownCredentialValues: true,
  readsCredentialStores: false,
  rejectOnMatch: true,
} as const;

export type TimestampPresence = 'required' | 'optional' | 'optional-nullable';

export interface TimestampRule {
  field: string;
  presence: TimestampPresence;
  representation: 'finite-epoch-milliseconds';
}

type TableTimestampRule<Table extends PersistenceTableName> =
  Omit<TimestampRule, 'field'> & {
    field: keyof PersistenceRecordMap[Table];
  };

type TimestampRules = {
  [Table in PersistenceTableName]: readonly TableTimestampRule<Table>[];
};

export const ENVELOPE_TIMESTAMP_RULE = {
  field: 'exportedAt',
  presence: 'required',
  representation: 'iso-8601',
} as const;

export const TABLE_TIMESTAMP_RULES = {
  users: [
    { field: 'createdAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
    { field: 'updatedAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  settings: [
    { field: 'updatedAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  subjects: [
    { field: 'createdAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  topics: [
    { field: 'lastReviewedAt', presence: 'optional', representation: 'finite-epoch-milliseconds' },
  ],
  tasks: [
    { field: 'dueDate', presence: 'optional', representation: 'finite-epoch-milliseconds' },
    { field: 'createdAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
    { field: 'completedAt', presence: 'optional', representation: 'finite-epoch-milliseconds' },
  ],
  notes: [
    { field: 'updatedAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  flashcards: [
    { field: 'nextReviewDate', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  sessions: [
    { field: 'completedAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  goals: [
    { field: 'deadline', presence: 'optional-nullable', representation: 'finite-epoch-milliseconds' },
    { field: 'createdAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
    { field: 'completedAt', presence: 'optional-nullable', representation: 'finite-epoch-milliseconds' },
  ],
  ai_conversations: [
    { field: 'timestamp', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  statistics: [
    { field: 'periodStart', presence: 'required', representation: 'finite-epoch-milliseconds' },
    { field: 'periodEnd', presence: 'required', representation: 'finite-epoch-milliseconds' },
    { field: 'computedAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
  achievement_definitions: [],
  user_achievements: [
    { field: 'unlockedAt', presence: 'optional-nullable', representation: 'finite-epoch-milliseconds' },
  ],
  notifications: [
    { field: 'createdAt', presence: 'required', representation: 'finite-epoch-milliseconds' },
  ],
} as const satisfies TimestampRules;

export const TIMESTAMP_ORDERING_RULES = [
  {
    table: 'statistics',
    earlierField: 'periodStart',
    laterField: 'periodEnd',
    comparison: 'greater-than-or-equal',
  },
] as const;

export type RelationshipAbsence = 'none' | 'omitted' | 'omitted-or-null';
export type LegacyParentScope = 'incoming-or-current' | 'not-represented';

type RelationshipFor<Child extends PersistenceTableName> = {
  childTable: Child;
  childField: keyof PersistenceRecordMap[Child];
  parentTable: PersistenceTableName;
  parentField: 'id';
  required: boolean;
  serializedAbsence: RelationshipAbsence;
  version2ParentScope: 'incoming-only';
  legacyParentScope: LegacyParentScope;
  invalidReferencePolicy: 'reject';
};

export type RelationshipContract = {
  [Table in PersistenceTableName]: RelationshipFor<Table>;
}[PersistenceTableName];

export const RELATIONSHIP_CONTRACTS = [
  { childTable: 'settings', childField: 'userId', parentTable: 'users', parentField: 'id', required: true, serializedAbsence: 'none', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'subjects', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'topics', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: true, serializedAbsence: 'none', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'tasks', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'tasks', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'notes', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'notes', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: true, serializedAbsence: 'none', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'notes', childField: 'topicId', parentTable: 'topics', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'flashcards', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'flashcards', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: true, serializedAbsence: 'none', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'flashcards', childField: 'topicId', parentTable: 'topics', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'sessions', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'sessions', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: false, serializedAbsence: 'omitted-or-null', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'sessions', childField: 'taskId', parentTable: 'tasks', parentField: 'id', required: false, serializedAbsence: 'omitted-or-null', version2ParentScope: 'incoming-only', legacyParentScope: 'incoming-or-current', invalidReferencePolicy: 'reject' },
  { childTable: 'goals', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'goals', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: false, serializedAbsence: 'omitted-or-null', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'ai_conversations', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'ai_conversations', childField: 'subjectId', parentTable: 'subjects', parentField: 'id', required: false, serializedAbsence: 'omitted-or-null', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'ai_conversations', childField: 'taskId', parentTable: 'tasks', parentField: 'id', required: false, serializedAbsence: 'omitted-or-null', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'statistics', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'user_achievements', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'user_achievements', childField: 'achievementId', parentTable: 'achievement_definitions', parentField: 'id', required: true, serializedAbsence: 'none', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'notifications', childField: 'userId', parentTable: 'users', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'notifications', childField: 'relatedTaskId', parentTable: 'tasks', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
  { childTable: 'notifications', childField: 'relatedSubjectId', parentTable: 'subjects', parentField: 'id', required: false, serializedAbsence: 'omitted', version2ParentScope: 'incoming-only', legacyParentScope: 'not-represented', invalidReferencePolicy: 'reject' },
] as const satisfies readonly RelationshipContract[];

export const RELATIONSHIP_VALIDATION_POLICY = {
  version2ParentScope: 'incoming-only',
  legacyRepresentedParentScope: 'incoming-or-current',
  rejectEmptyStringReferences: true,
  rejectDanglingReferences: true,
  neverSilentlyNullOrUnassign: true,
} as const;

export const ACHIEVEMENT_DEFINITION_AUTHORITY = {
  authority: 'installed-canonical-definitions',
  compatibleFields: TABLE_FIELD_ALLOWLISTS.achievement_definitions,
  acceptedIncomingSets: ['exact', 'compatible-subset', 'empty-diagnostic'],
  unsupportedIncomingPolicy: 'reject',
  postRestoreDefinitions: 'installed-canonical-definitions',
  incomingDefinitionCountIsDiagnosticOnly: true,
  preserveUserAchievementProgressOnRejection: true,
  legacyDefinitionsPolicy: 'untouched',
} as const;

export type GenerationStatus = NonNullable<AIConversation['generationStatus']>;

export const GENERATION_STATUSES = [
  'complete',
  'stopped',
  'failed',
] as const satisfies readonly GenerationStatus[];

export interface PersistedAIConversationRecord {
  id: string;
  userId: string;
  role: AIConversation['role'];
  mode: AIConversation['mode'];
  prompt: string;
  response: string;
  timestamp: number;
  generationStatus: GenerationStatus;
  content?: string;
  subjectId?: string | null;
  taskId?: string | null;
  explanation?: AIConversation['explanation'];
  providerId?: string;
  providerName?: string;
  modelId?: string;
}

export const AI_PERSISTENCE_FIELD_SOURCES = {
  id: 'single-writer-generated-string-id',
  userId: 'active-user-context',
  role: 'assistant',
  mode: 'request-mode',
  prompt: 'submitted-prompt',
  response: 'final-or-partial-output',
  content: 'response-compatibility-alias',
  timestamp: 'completion-time-epoch-milliseconds',
  generationStatus: 'terminal-outcome',
  subjectId: 'optional-request-context',
  taskId: 'optional-request-context',
  explanation: 'optional-generated-explanation',
  providerId: 'provider-profile-id',
  providerName: 'provider-display-name',
  modelId: 'selected-model-id',
} as const satisfies Record<keyof PersistedAIConversationRecord, string>;

export const AI_PERSISTENCE_OUTCOMES = [
  { outcome: 'complete', hasOutput: true, persist: true, generationStatus: 'complete' },
  { outcome: 'stopped-partial', hasOutput: true, persist: true, generationStatus: 'stopped' },
  { outcome: 'stopped-zero', hasOutput: false, persist: false, generationStatus: null },
  { outcome: 'failed-partial', hasOutput: true, persist: true, generationStatus: 'failed' },
  { outcome: 'failed-zero', hasOutput: false, persist: false, generationStatus: null },
  { outcome: 'local-only-or-no-evidence', hasOutput: true, persist: true, generationStatus: 'complete' },
] as const;

export const GENERATION_STATUS_COMPATIBILITY = {
  historicalMissingWithResponse: 'preserve-missing',
  historicalPromptOnlyOrEmpty: 'preserve-missing',
  historicalUnknown: 'preserve-unknown',
  incomingVersion2Missing: 'reject',
  incomingVersion2Unknown: 'reject',
  persistedErrorMetadata: 'forbidden',
  providerTypePersistence: 'forbidden',
} as const;

export const HISTORICAL_AI_SUBJECT_REFERENCE_COMPATIBILITY = {
  knownProviderProfileMatch: {
    exportSubjectId: null,
    copyToProviderIdOnlyWhenAbsent: true,
    emitWarning: true,
    mutateDatabase: false,
  },
  unknownDanglingSubjectId: 'reject-export',
} as const;

export interface RestoreVerificationMarkerV1 {
  state: 'transaction-started' | 'verification-failed';
  runtime: 'browser' | 'electron';
  expectedPostRestoreCounts: AetherBackupRecordCounts;
  incomingBackupDigest: string;
  expectedStateDigest: string;
  startedAt: string;
}

export const RESTORE_VERIFICATION_MARKER_CONTRACT = {
  key: 'aether.restoreVerification.v1',
  version: 1,
  digestAlgorithm: 'SHA-256',
  stateDigestNormalization: {
    tables: PERSISTENCE_TABLES,
    sortEachTableBy: 'id',
    achievementDefinitions: 'installed-canonical-definitions',
    excludedValues: ['envelope-metadata', 'filesystem-paths', 'credentials', 'provider-payloads'],
  },
  writeAndReadBackBeforeTransaction: true,
  clearAfter: ['transaction-commit', 'database-reopen', 'count-check', 'relationship-check', 'state-digest-check', 'store-refresh'],
  sameCountDifferentContentPolicy: 'verification-failed',
} as const;

export type RestoreRuntime = 'browser' | 'electron';

export const SAFETY_BACKUP_CONTRACTS = {
  electron: {
    runtime: 'electron',
    requiredSteps: [
      'save-dialog',
      'selected-path',
      'write',
      'close',
      'existence-check',
      'readback-parse',
      'all-table-count-check',
      'secret-scan',
    ],
    cancellationOrFailurePolicy: 'abort-before-restore',
    durableDeliveryClaim: 'verified-after-readback',
  },
  browser: {
    runtime: 'browser',
    requiredSteps: [
      'validate-generated-blob',
      'initiate-download',
      'explicit-user-confirmation',
    ],
    cancellationOrFailurePolicy: 'abort-before-restore',
    durableDeliveryClaim: 'cannot-verify-disk-delivery',
  },
} as const;

export const RESTORE_CANCELLATION_CONTRACT = {
  cancellableBeforeTransactionStart: true,
  cancellableAfterTransactionStart: false,
  abortSignalObservedInsideTransaction: false,
  terminalTransactionStates: ['commit', 'rollback'],
} as const;
