import type { Table } from 'dexie';
import packageMetadata from '../../package.json';
import {
  CANONICAL_ACHIEVEMENT_DEFINITIONS,
  db,
  type AetherDatabase,
} from '../db/database';
import { getKnownProviderProfileIds, getProviderProfiles } from './ai/providerProfiles';
import {
  AETHER_BACKUP_FORMAT,
  AETHER_BACKUP_VERSION,
  AETHER_DATABASE_SCHEMA_VERSION,
  AI_EXPLANATION_FIELD_ALLOWLIST,
  BACKUP_TOP_LEVEL_KEYS,
  GENERATION_STATUSES,
  LEGACY_BACKUP_TABLES,
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  TABLE_FIELD_ALLOWLISTS,
  TABLE_TIMESTAMP_RULES,
  type AetherBackupDataV2,
  type AetherBackupRecordCounts,
  type AetherBackupV2,
  type LegacyBackupTableName,
  type PersistenceRecordMap,
  type PersistenceTableName,
} from '../types';
import type { MarkerStorage } from './restoreVerificationState';

const REQUIRED_FIELDS = {
  users: ['id', 'name', 'email', 'academicLevel', 'createdAt', 'updatedAt'],
  settings: ['id', 'userId', 'theme', 'soundEnabled', 'aiProvider', 'notificationsEnabled', 'studyGoalHoursWeekly', 'updatedAt'],
  subjects: ['id', 'name', 'color', 'confidenceRating', 'createdAt'],
  topics: ['id', 'subjectId', 'title', 'masteryLevel'],
  tasks: ['id', 'title', 'priority', 'estimatedMinutes', 'completedMinutes', 'status', 'createdAt'],
  notes: ['id', 'subjectId', 'title', 'content', 'tags', 'updatedAt'],
  flashcards: ['id', 'subjectId', 'front', 'back', 'easeFactor', 'interval', 'repetitions', 'nextReviewDate'],
  sessions: ['id', 'type', 'durationMinutes', 'distractionCount', 'completedAt'],
  goals: ['id', 'title', 'description', 'type', 'targetValue', 'currentValue', 'unit', 'status', 'createdAt'],
  ai_conversations: ['id', 'mode', 'timestamp'],
  statistics: ['id', 'metricKey', 'periodStart', 'periodEnd', 'value', 'computedAt'],
  achievement_definitions: ['id', 'key', 'title', 'description', 'category', 'targetValue', 'icon'],
  user_achievements: ['id', 'achievementId', 'progress'],
  notifications: ['id', 'type', 'title', 'message', 'read', 'createdAt'],
} as const satisfies {
  [TableName in PersistenceTableName]: readonly (keyof PersistenceRecordMap[TableName])[];
};

const STRING_FIELDS = {
  users: ['id', 'name', 'email', 'academicLevel'],
  settings: ['id', 'userId'],
  subjects: ['id', 'userId', 'name', 'code', 'color', 'targetGrade', 'instructor'],
  topics: ['id', 'subjectId', 'title'],
  tasks: ['id', 'userId', 'title', 'description', 'subjectId'],
  notes: ['id', 'userId', 'subjectId', 'topicId', 'title', 'content'],
  flashcards: ['id', 'userId', 'subjectId', 'topicId', 'front', 'back'],
  sessions: ['id', 'userId', 'subjectId', 'taskId', 'notes'],
  goals: ['id', 'userId', 'subjectId', 'title', 'description', 'unit'],
  ai_conversations: [
    'id', 'userId', 'subjectId', 'taskId', 'content', 'prompt', 'response',
    'providerId', 'providerName', 'modelId',
  ],
  statistics: ['id', 'userId', 'metricKey'],
  achievement_definitions: ['id', 'key', 'title', 'description', 'category', 'icon'],
  user_achievements: ['id', 'userId', 'achievementId'],
  notifications: ['id', 'userId', 'title', 'message', 'relatedTaskId', 'relatedSubjectId'],
} as const;

const NUMBER_FIELDS = {
  users: ['createdAt', 'updatedAt'],
  settings: ['studyGoalHoursWeekly', 'updatedAt'],
  subjects: ['confidenceRating', 'createdAt'],
  topics: ['masteryLevel', 'lastReviewedAt'],
  tasks: ['dueDate', 'estimatedMinutes', 'completedMinutes', 'createdAt', 'completedAt'],
  notes: ['updatedAt'],
  flashcards: ['easeFactor', 'interval', 'repetitions', 'nextReviewDate'],
  sessions: ['durationMinutes', 'distractionCount', 'reflectionRating', 'completedAt'],
  goals: ['targetValue', 'currentValue', 'deadline', 'createdAt', 'completedAt'],
  ai_conversations: ['timestamp'],
  statistics: ['periodStart', 'periodEnd', 'value', 'computedAt'],
  achievement_definitions: ['targetValue'],
  user_achievements: ['progress', 'unlockedAt'],
  notifications: ['createdAt'],
} as const;

const ENUM_FIELDS: Partial<Record<
  PersistenceTableName,
  Readonly<Record<string, readonly string[]>>
>> = {
  settings: {
    theme: ['dark', 'light'],
    aiProvider: ['local', 'openai', 'gemini', 'anthropic'],
  },
  tasks: {
    priority: ['low', 'medium', 'high', 'urgent'],
    status: ['todo', 'in_progress', 'completed'],
  },
  sessions: {
    type: ['pomodoro', 'deep_work', 'stopwatch'],
  },
  goals: {
    type: ['study_hours', 'task_completion', 'confidence', 'custom'],
    status: ['active', 'completed', 'abandoned'],
  },
  ai_conversations: {
    role: ['user', 'assistant'],
    mode: ['chat', 'tutor', 'writer', 'code', 'quiz', 'ask_resources', 'explain', 'summarize'],
    generationStatus: GENERATION_STATUSES,
  },
  notifications: {
    type: ['deadline', 'confidence', 'goal', 'system'],
  },
};

const BOOLEAN_FIELDS: Partial<Record<PersistenceTableName, readonly string[]>> = {
  settings: ['soundEnabled', 'notificationsEnabled'],
  notes: ['isFavorite'],
  notifications: ['read'],
};

const NULLABLE_FIELDS = new Set([
  'goals.deadline',
  'goals.completedAt',
  'goals.subjectId',
  'sessions.subjectId',
  'sessions.taskId',
  'ai_conversations.subjectId',
  'ai_conversations.taskId',
  'user_achievements.unlockedAt',
]);

const PROHIBITED_FIELD_CATEGORIES = [
  { names: ['apikey'], category: 'API key' },
  { names: ['authorization', 'authorizationheader'], category: 'authorization' },
  { names: ['accesstoken', 'refreshtoken', 'bearertoken'], category: 'token' },
  { names: ['clientsecret', 'secretkey'], category: 'secret' },
  { names: ['credential', 'credentials', 'encryptedcredential', 'encryptedcredentials'], category: 'credential' },
  { names: ['password'], category: 'password' },
  { names: ['privatekey'], category: 'private key' },
] as const;

const CANONICAL_ACHIEVEMENTS_BY_ID = new Map(
  CANONICAL_ACHIEVEMENT_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const CANONICAL_ACHIEVEMENT_IDS = new Set(CANONICAL_ACHIEVEMENTS_BY_ID.keys());

type PlainObject = Record<string, unknown>;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export interface BackupExportResult {
  backup: AetherBackupV2;
  json: string;
  filename: string;
  warnings: string[];
}

export interface ExportFullBackupOptions {
  database?: AetherDatabase;
  now?: () => Date;
  download?: (json: string, filename: string) => void | Promise<void>;
  knownProviderProfileIds?: readonly string[];
}

export type LegacyBackupData = {
  [TableName in LegacyBackupTableName]: PersistenceRecordMap[TableName][];
};

export interface LegacyImportSummary {
  incomingCounts: Record<LegacyBackupTableName, number>;
  replacementCounts: Record<LegacyBackupTableName, number>;
  newCounts: Record<LegacyBackupTableName, number>;
  totalIncoming: number;
}

export interface PreparedLegacyImport {
  format: 'legacy-v1';
  data: LegacyBackupData;
  warnings: string[];
  summary: LegacyImportSummary;
}

export interface LegacyImportResult {
  summary: LegacyImportSummary;
  warnings: string[];
}

export interface LegacyImportOptions {
  database?: AetherDatabase;
  refresh?: () => void | Promise<void>;
}

export class LegacyImportCommittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyImportCommittedError';
  }
}

const LEGACY_OMITTED_TABLES = PERSISTENCE_TABLES.filter(
  (table): table is Exclude<PersistenceTableName, LegacyBackupTableName> => (
    !(LEGACY_BACKUP_TABLES as readonly string[]).includes(table)
  ),
);

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFieldName(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function prohibitedFieldCategory(name: string): string | undefined {
  const normalized = normalizeFieldName(name);
  for (const { names, category } of PROHIBITED_FIELD_CATEGORIES) {
    if (names.some((candidate) => (
      normalized === candidate
      || normalized.endsWith(candidate)
    ))) {
      return category;
    }
  }
  return undefined;
}

function prohibitedValueCategory(value: string): string | undefined {
  if (/(?:^|[^a-z0-9])sk-[a-z0-9_-]{20,}/i.test(value)) return 'API key';
  if (/(?:^|[^a-z0-9])nvapi-[a-z0-9_-]{20,}/i.test(value)) return 'API key';
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) return 'private key';
  if (/\beyJ[a-z0-9_-]{5,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{16,}\b/i.test(value)) {
    return 'token';
  }

  const bearerMatch = /\bbearer\s+([a-z0-9._~+/=-]{24,})\b/i.exec(value);
  if (
    bearerMatch
    && /[a-z]/i.test(bearerMatch[1])
    && /[0-9._~+/=-]/.test(bearerMatch[1])
  ) {
    return 'bearer token';
  }
  return undefined;
}

function safeRecordLabel(record: PlainObject, index: number): string {
  const id = record.id;
  if (
    typeof id === 'string'
    && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)
    && prohibitedValueCategory(id) === undefined
  ) {
    return `record ${id}`;
  }
  return `record #${index + 1}`;
}

function scanForSecrets(value: unknown, context: string, seen = new WeakSet<object>()): void {
  if (typeof value === 'string') {
    const category = prohibitedValueCategory(value);
    if (category) fail(`${context} contains a prohibited ${category} value.`);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => scanForSecrets(item, context, seen));
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const category = prohibitedFieldCategory(key);
    if (category) fail(`${context} contains a prohibited ${category} field.`);
    scanForSecrets(nestedValue, context, seen);
  }
}

function assertExactKeys(
  value: PlainObject,
  expectedKeys: readonly string[],
  context: string,
): void {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      const category = prohibitedFieldCategory(key);
      if (category) fail(`${context} contains a prohibited ${category} field.`);
      fail(`${context} contains an unknown field.`);
    }
  }
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${context} is missing a required field.`);
    }
  }
}

function assertRequiredFields(
  record: PlainObject,
  fields: readonly PropertyKey[],
  context: string,
): void {
  for (const field of fields) {
    if (
      !Object.prototype.hasOwnProperty.call(record, field)
      || record[String(field)] === undefined
    ) {
      fail(`${context} is missing a required field.`);
    }
  }
}

function assertStringField(
  record: PlainObject,
  table: PersistenceTableName,
  field: string,
  required: boolean,
  context: string,
): void {
  const value = record[field];
  if (value === undefined) {
    if (required) fail(`${context} has an invalid ${field} field.`);
    return;
  }
  if (value === null && NULLABLE_FIELDS.has(`${table}.${field}`)) return;
  if (typeof value !== 'string') fail(`${context} has an invalid ${field} field.`);
  if ((field === 'id' || field.endsWith('Id')) && value.length === 0) {
    fail(`${context} has an empty identifier.`);
  }
}

function assertNumberField(
  record: PlainObject,
  table: PersistenceTableName,
  field: string,
  required: boolean,
  context: string,
): void {
  const value = record[field];
  if (value === undefined) {
    if (required) fail(`${context} has an invalid ${field} field.`);
    return;
  }
  if (value === null && NULLABLE_FIELDS.has(`${table}.${field}`)) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${context} has an invalid ${field} field.`);
  }
}

function validateRecord(
  table: PersistenceTableName,
  value: unknown,
  index: number,
): asserts value is PersistenceRecordMap[typeof table] {
  if (!isPlainObject(value)) fail(`${table} record #${index + 1} is not an object.`);
  const context = `${table} ${safeRecordLabel(value, index)}`;

  scanForSecrets(value, context);
  const allowlist = TABLE_FIELD_ALLOWLISTS[table] as readonly string[];
  const allowed = new Set(allowlist);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${context} contains an unknown field.`);
  }
  assertRequiredFields(value, REQUIRED_FIELDS[table], context);

  const required = new Set<PropertyKey>(REQUIRED_FIELDS[table]);
  for (const field of STRING_FIELDS[table]) {
    assertStringField(value, table, field, required.has(field), context);
  }
  for (const field of NUMBER_FIELDS[table]) {
    assertNumberField(value, table, field, required.has(field), context);
  }
  for (const field of BOOLEAN_FIELDS[table] ?? []) {
    const fieldValue = value[field];
    if (fieldValue === undefined && !required.has(field)) continue;
    if (typeof fieldValue !== 'boolean') fail(`${context} has an invalid ${field} field.`);
  }
  for (const [field, accepted] of Object.entries(ENUM_FIELDS[table] ?? {})) {
    const fieldValue = value[field];
    if (fieldValue === undefined && !required.has(field)) continue;
    if (typeof fieldValue !== 'string' || !accepted.includes(fieldValue)) {
      fail(`${context} has an invalid ${field} field.`);
    }
  }

  if (table === 'notes') {
    if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string')) {
      fail(`${context} has an invalid tags field.`);
    }
  }

  if (table === 'ai_conversations') {
    const explanation = value.explanation;
    if (explanation !== undefined) {
      if (!isPlainObject(explanation)) fail(`${context} has an invalid explanation field.`);
      assertExactKeys(explanation, AI_EXPLANATION_FIELD_ALLOWLIST, `${context} explanation`);
      if (
        typeof explanation.confidence !== 'number'
        || !Number.isFinite(explanation.confidence)
        || !Array.isArray(explanation.factors)
        || !explanation.factors.every((factor) => typeof factor === 'string')
      ) {
        fail(`${context} has an invalid explanation field.`);
      }
    }

    if (value.generationStatus === undefined) {
      const meaningful = [value.content, value.prompt, value.response]
        .some((fieldValue) => typeof fieldValue === 'string' && fieldValue.trim().length > 0);
      if (!meaningful) fail(`${context} has no meaningful legacy content.`);
    }
  }
}

function validateTimestamps(snapshot: AetherBackupDataV2): void {
  for (const table of PERSISTENCE_TABLES) {
    for (const [index, record] of snapshot[table].entries()) {
      const plainRecord = record as unknown as PlainObject;
      const context = `${table} ${safeRecordLabel(plainRecord, index)}`;
      for (const rule of TABLE_TIMESTAMP_RULES[table]) {
        const value = plainRecord[String(rule.field)];
        if (value === undefined && rule.presence !== 'required') continue;
        if (value === null && rule.presence === 'optional-nullable') continue;
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          fail(`${context} has an invalid ${String(rule.field)} timestamp.`);
        }
      }
    }
  }

  snapshot.statistics.forEach((record, index) => {
    if (record.periodEnd < record.periodStart) {
      fail(`statistics ${safeRecordLabel(record as unknown as PlainObject, index)} has invalid period ordering.`);
    }
  });
}

function validateRelationships(snapshot: AetherBackupDataV2): void {
  const parentIds = Object.fromEntries(PERSISTENCE_TABLES.map((table) => [
    table,
    new Set(snapshot[table].map((record) => record.id)),
  ])) as Record<PersistenceTableName, Set<string>>;

  for (const relationship of RELATIONSHIP_CONTRACTS) {
    const records = snapshot[relationship.childTable] as readonly unknown[];
    records.forEach((recordValue, index) => {
      const record = recordValue as PlainObject;
      const value = record[String(relationship.childField)];
      const context = `${relationship.childTable} ${safeRecordLabel(record, index)}`;

      if (value === undefined) {
        if (relationship.required) fail(`${context} is missing a required relationship.`);
        return;
      }
      if (value === null) {
        if (relationship.serializedAbsence !== 'omitted-or-null') {
          fail(`${context} has an invalid relationship.`);
        }
        return;
      }
      if (typeof value !== 'string' || value.length === 0) {
        fail(`${context} has an invalid relationship.`);
      }
      const validParentIds = (
        relationship.childTable === 'user_achievements'
        && relationship.childField === 'achievementId'
      )
        ? CANONICAL_ACHIEVEMENT_IDS
        : parentIds[relationship.parentTable];
      if (!validParentIds.has(value)) {
        fail(`${context} has a dangling ${String(relationship.childField)} relationship.`);
      }
    });
  }
}

function validateAchievementDefinitions(snapshot: AetherBackupDataV2): void {
  const keys = new Set<string>();
  snapshot.achievement_definitions.forEach((definition, index) => {
    const context = `achievement_definitions ${safeRecordLabel(
      definition as unknown as PlainObject,
      index,
    )}`;
    if (definition.key.length === 0) {
      fail(`${context} has an empty key.`);
    }
    if (keys.has(definition.key)) {
      fail(`${context} has a duplicate key.`);
    }
    keys.add(definition.key);

    const canonical = CANONICAL_ACHIEVEMENTS_BY_ID.get(definition.id);
    if (!canonical) fail(`${context} is not an installed canonical definition.`);
    for (const field of TABLE_FIELD_ALLOWLISTS.achievement_definitions) {
      if (definition[field] !== canonical[field]) {
        fail(`${context} does not match the installed canonical definition.`);
      }
    }
  });
}

function validateUniqueField(
  records: readonly PlainObject[],
  fields: readonly string[],
  context: string,
): void {
  const values = new Set<string>();
  for (const record of records) {
    const parts = fields.map((field) => record[field]);
    if (parts.some((part) => part === undefined)) continue;
    const key = parts.map((part) => `${typeof part}:${String(part)}`).join('\u0000');
    if (values.has(key)) fail(`${context} contains a conflicting unique index value.`);
    values.add(key);
  }
}

export function validateBackupUniqueIndexes(snapshot: AetherBackupDataV2): void {
  validateUniqueField(snapshot.users as unknown as PlainObject[], ['email'], 'users');
  validateUniqueField(snapshot.settings as unknown as PlainObject[], ['userId'], 'settings');
  validateUniqueField(
    snapshot.achievement_definitions as unknown as PlainObject[],
    ['key'],
    'achievement_definitions',
  );
  validateUniqueField(
    snapshot.statistics as unknown as PlainObject[],
    ['userId', 'metricKey', 'periodStart'],
    'statistics',
  );
  validateUniqueField(
    snapshot.user_achievements as unknown as PlainObject[],
    ['userId', 'achievementId'],
    'user_achievements',
  );
}

export function validateBackupSnapshot(value: unknown): asserts value is AetherBackupDataV2 {
  if (!isPlainObject(value)) fail('Backup data must be an object.');
  assertExactKeys(value, PERSISTENCE_TABLES, 'Backup data');

  for (const table of PERSISTENCE_TABLES) {
    const records = value[table];
    if (!Array.isArray(records)) fail(`${table} must be an array.`);
    const ids = new Set<string>();
    records.forEach((record, index) => {
      validateRecord(table, record, index);
      if (ids.has(record.id)) {
        fail(`${table} ${safeRecordLabel(record as unknown as PlainObject, index)} has a duplicate id.`);
      }
      ids.add(record.id);
    });
  }

  const snapshot = value as unknown as AetherBackupDataV2;
  validateTimestamps(snapshot);
  validateAchievementDefinitions(snapshot);
  validateBackupUniqueIndexes(snapshot);
  validateRelationships(snapshot);
}

export function calculateBackupRecordCounts(
  snapshot: AetherBackupDataV2,
): AetherBackupRecordCounts {
  return Object.fromEntries(PERSISTENCE_TABLES.map((table) => [
    table,
    snapshot[table].length,
  ])) as AetherBackupRecordCounts;
}

export function validateBackupV2(value: unknown): asserts value is AetherBackupV2 {
  if (!isPlainObject(value)) fail('Backup envelope must be an object.');
  assertExactKeys(value, BACKUP_TOP_LEVEL_KEYS, 'Backup envelope');

  if (value.format !== AETHER_BACKUP_FORMAT) fail('Backup format is invalid.');
  if (value.version !== AETHER_BACKUP_VERSION) fail('Backup version is invalid.');
  if (value.schemaVersion !== AETHER_DATABASE_SCHEMA_VERSION) {
    fail('Backup schema version is invalid.');
  }
  if (typeof value.applicationVersion !== 'string' || value.applicationVersion.trim().length === 0) {
    fail('Backup application version is invalid.');
  }
  scanForSecrets(value.applicationVersion, 'Backup envelope');
  if (typeof value.exportedAt !== 'string') fail('Backup export timestamp is invalid.');
  const exportedAt = new Date(value.exportedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.exportedAt)
    || !Number.isFinite(exportedAt.getTime())
    || exportedAt.toISOString() !== value.exportedAt
  ) {
    fail('Backup export timestamp is invalid.');
  }

  if (!isPlainObject(value.recordCounts)) fail('Backup record counts must be an object.');
  assertExactKeys(value.recordCounts, PERSISTENCE_TABLES, 'Backup record counts');
  if (!isPlainObject(value.data)) fail('Backup data must be an object.');
  validateBackupSnapshot(value.data);

  for (const table of PERSISTENCE_TABLES) {
    const count = value.recordCounts[table];
    if (!Number.isInteger(count) || (count as number) < 0) {
      fail(`Backup count for ${table} is invalid.`);
    }
    if (count !== value.data[table].length) {
      fail(`Backup count for ${table} does not match its data.`);
    }
  }
}

export function prepareBackupSnapshotForExport(
  snapshot: AetherBackupDataV2,
  knownProviderProfileIds: readonly string[],
): { snapshot: AetherBackupDataV2; warnings: string[] } {
  const subjectIds = new Set(snapshot.subjects.map((subject) => subject.id));
  const providerIds = new Set(knownProviderProfileIds);
  const warnings: string[] = [];
  let changed = false;

  const aiConversations = snapshot.ai_conversations.map((conversation, index) => {
    const historicalProviderId = conversation.subjectId;
    if (
      typeof historicalProviderId !== 'string'
      || historicalProviderId.length === 0
      || subjectIds.has(historicalProviderId)
      || !providerIds.has(historicalProviderId)
    ) {
      return conversation;
    }

    changed = true;
    warnings.push(
      `Historical AI provider association was omitted from ai_conversations ${
        safeRecordLabel(conversation as unknown as PlainObject, index)
      }.`,
    );
    return {
      ...conversation,
      subjectId: null,
    };
  });

  return {
    snapshot: changed
      ? {
        ...snapshot,
        ai_conversations: aiConversations,
      }
      : snapshot,
    warnings,
  };
}

export async function readBackupSnapshot(
  database: AetherDatabase = db,
): Promise<AetherBackupDataV2> {
  const tables: Table[] = [
    database.users,
    database.settings,
    database.subjects,
    database.topics,
    database.tasks,
    database.notes,
    database.flashcards,
    database.sessions,
    database.goals,
    database.ai_conversations,
    database.statistics,
    database.achievement_definitions,
    database.user_achievements,
    database.notifications,
  ];

  return database.transaction('r', tables, async () => ({
    users: await database.users.toArray(),
    settings: await database.settings.toArray(),
    subjects: await database.subjects.toArray(),
    topics: await database.topics.toArray(),
    tasks: await database.tasks.toArray(),
    notes: await database.notes.toArray(),
    flashcards: await database.flashcards.toArray(),
    sessions: await database.sessions.toArray(),
    goals: await database.goals.toArray(),
    ai_conversations: await database.ai_conversations.toArray(),
    statistics: await database.statistics.toArray(),
    achievement_definitions: await database.achievement_definitions.toArray(),
    user_achievements: await database.user_achievements.toArray(),
    notifications: await database.notifications.toArray(),
  }));
}

export function buildBackupV2(
  snapshot: AetherBackupDataV2,
  exportedAt = new Date().toISOString(),
): AetherBackupV2 {
  validateBackupSnapshot(snapshot);
  const backup: AetherBackupV2 = {
    format: AETHER_BACKUP_FORMAT,
    version: AETHER_BACKUP_VERSION,
    schemaVersion: AETHER_DATABASE_SCHEMA_VERSION,
    applicationVersion: packageMetadata.version,
    exportedAt,
    recordCounts: calculateBackupRecordCounts(snapshot),
    data: snapshot,
  };
  validateBackupV2(backup);
  return backup;
}

export function serializeBackupV2(backup: AetherBackupV2): string {
  validateBackupV2(backup);
  const serialized = JSON.stringify(backup, null, 2);
  const reparsed: unknown = JSON.parse(serialized);
  validateBackupV2(reparsed);
  return serialized;
}

export function createBackupFilename(exportedAt: string): string {
  const safeTimestamp = exportedAt.replace(/[^0-9A-Za-z_-]/g, '-');
  return `Aether_Backup_V2_${safeTimestamp}.json`;
}

export function downloadBackupJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  let operationFailed = false;
  let cleanupError: unknown;

  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      if (anchor?.parentNode) anchor.parentNode.removeChild(anchor);
    } catch (error) {
      cleanupError = error;
    }
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      cleanupError ??= error;
    }
    if (!operationFailed && cleanupError !== undefined) throw cleanupError;
  }
}

export async function exportFullBackup(
  options: ExportFullBackupOptions = {},
): Promise<BackupExportResult> {
  const databaseSnapshot = await readBackupSnapshot(options.database ?? db);
  const { snapshot, warnings } = prepareBackupSnapshotForExport(
    databaseSnapshot,
    options.knownProviderProfileIds ?? getKnownProviderProfileIds(getProviderProfiles()),
  );
  validateBackupSnapshot(snapshot);
  const exportedAt = (options.now ?? (() => new Date()))().toISOString();
  const backup = buildBackupV2(snapshot, exportedAt);
  const json = serializeBackupV2(backup);
  const filename = createBackupFilename(exportedAt);
  await (options.download ?? downloadBackupJson)(json, filename);
  return { backup, json, filename, warnings };
}

export function getBackupErrorMessage(error: unknown): string {
  if (error instanceof BackupValidationError) return error.message;
  return 'Complete backup could not be created. Your data was not changed.';
}

export type BackupFormatClassification = 'legacy-v1' | 'version-2' | 'unsupported';

export function parseBackupJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    fail('The selected file is not valid JSON. No data was changed.');
  }
}

export function classifyBackupFormat(value: unknown): BackupFormatClassification {
  if (!isPlainObject(value)) return 'unsupported';
  if (value.format === AETHER_BACKUP_FORMAT) return 'version-2';
  if (
    Object.prototype.hasOwnProperty.call(value, 'format')
    || (
      Object.prototype.hasOwnProperty.call(value, 'version')
      && value.version !== 1
    )
  ) {
    return 'unsupported';
  }
  return LEGACY_BACKUP_TABLES.every((table) => (
    Object.prototype.hasOwnProperty.call(value, table)
    && Array.isArray(value[table])
  ))
    ? 'legacy-v1'
    : 'unsupported';
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

export function validateLegacyBackup(value: unknown): {
  data: LegacyBackupData;
  warnings: string[];
} {
  if (!isPlainObject(value)) {
    fail('The selected file is not a supported legacy backup object. No data was changed.');
  }
  if (value.format === AETHER_BACKUP_FORMAT) {
    fail('Version 2 backups cannot be imported through the legacy workspace importer.');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'format')) {
    fail('The selected file uses an unsupported backup format. No data was changed.');
  }
  if (
    Object.prototype.hasOwnProperty.call(value, 'version')
    && value.version !== 1
  ) {
    fail('The selected file uses an unsupported backup version. No data was changed.');
  }

  for (const table of LEGACY_BACKUP_TABLES) {
    if (!Object.prototype.hasOwnProperty.call(value, table)) {
      fail(`The legacy backup is missing the required ${table} table.`);
    }
    if (!Array.isArray(value[table])) {
      fail(`The legacy backup ${table} table must be an array.`);
    }
  }

  const warnings: string[] = [];
  const knownTopLevelFields = new Set<string>([
    ...LEGACY_BACKUP_TABLES,
    'exportedAt',
    'version',
  ]);
  let ignoredTopLevelFields = 0;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (knownTopLevelFields.has(key)) continue;
    const category = prohibitedFieldCategory(key);
    if (category) fail(`Legacy backup metadata contains a prohibited ${category} field.`);
    scanForSecrets(nestedValue, 'Legacy backup metadata');
    ignoredTopLevelFields += 1;
  }
  if (ignoredTopLevelFields > 0) {
    warnings.push(
      `Ignored ${ignoredTopLevelFields} benign unknown top-level field${
        ignoredTopLevelFields === 1 ? '' : 's'
      }.`,
    );
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'exportedAt')) {
    warnings.push('Legacy exportedAt is missing and was treated as informational.');
  } else {
    scanForSecrets(value.exportedAt, 'Legacy export timestamp');
    if (!isCanonicalIsoTimestamp(value.exportedAt)) {
      warnings.push('Legacy exportedAt is invalid or noncanonical and was ignored.');
    }
  }

  const data: Partial<Record<LegacyBackupTableName, unknown[]>> = {};
  for (const table of LEGACY_BACKUP_TABLES) {
    const records = value[table] as unknown[];
    const ids = new Set<string>();
    let ignoredRecordFields = 0;
    const sanitizedRecords = records.map((recordValue, index) => {
      if (!isPlainObject(recordValue)) {
        fail(`${table} record #${index + 1} is not an object.`);
      }
      const context = `${table} ${safeRecordLabel(recordValue, index)}`;
      scanForSecrets(recordValue, context);
      const allowlist = TABLE_FIELD_ALLOWLISTS[table] as readonly string[];
      const allowed = new Set(allowlist);
      const sanitized: PlainObject = {};
      for (const [key, fieldValue] of Object.entries(recordValue)) {
        if (!allowed.has(key)) {
          ignoredRecordFields += 1;
          continue;
        }
        sanitized[key] = fieldValue;
      }
      validateRecord(table, sanitized, index);
      if (ids.has(sanitized.id as string)) {
        fail(`${context} has a duplicate id.`);
      }
      ids.add(sanitized.id as string);
      return sanitized as unknown as PersistenceRecordMap[typeof table];
    });
    if (ignoredRecordFields > 0) {
      warnings.push(
        `Ignored ${ignoredRecordFields} benign unknown field${
          ignoredRecordFields === 1 ? '' : 's'
        } from ${table} records.`,
      );
    }
    data[table] = sanitizedRecords;
  }

  return { data: data as LegacyBackupData, warnings };
}

async function readLegacyTables(database: AetherDatabase): Promise<LegacyBackupData> {
  const entries = await Promise.all(LEGACY_BACKUP_TABLES.map(async (table) => [
    table,
    await database.table(table).toArray(),
  ] as const));
  return Object.fromEntries(entries) as LegacyBackupData;
}

export async function readLegacySnapshot(
  database: AetherDatabase = db,
): Promise<LegacyBackupData> {
  const tables: Table[] = LEGACY_BACKUP_TABLES.map((table) => database.table(table));
  return database.transaction('r', tables, () => readLegacyTables(database));
}

export function buildLegacyPostMergeView(
  current: LegacyBackupData,
  incoming: LegacyBackupData,
): LegacyBackupData {
  const merged: Partial<Record<LegacyBackupTableName, unknown[]>> = {};
  for (const table of LEGACY_BACKUP_TABLES) {
    const records = new Map<string, PersistenceRecordMap[typeof table]>(
      current[table].map((record) => [record.id, record]),
    );
    incoming[table].forEach((record) => records.set(record.id, record));
    merged[table] = [...records.values()];
  }
  return merged as LegacyBackupData;
}

export function validateLegacyRelationships(snapshot: LegacyBackupData): void {
  const parentIds = Object.fromEntries(LEGACY_BACKUP_TABLES.map((table) => [
    table,
    new Set(snapshot[table].map((record) => record.id)),
  ])) as Record<LegacyBackupTableName, Set<string>>;
  const representedTables = new Set<string>(LEGACY_BACKUP_TABLES);

  for (const relationship of RELATIONSHIP_CONTRACTS) {
    if (
      !representedTables.has(relationship.childTable)
      || !representedTables.has(relationship.parentTable)
    ) {
      continue;
    }
    const childTable = relationship.childTable as LegacyBackupTableName;
    const parentTable = relationship.parentTable as LegacyBackupTableName;
    const records = snapshot[childTable] as readonly unknown[];
    records.forEach((recordValue, index) => {
      const record = recordValue as PlainObject;
      const reference = record[String(relationship.childField)];
      const context = `${childTable} ${safeRecordLabel(record, index)}`;
      if (reference === undefined) {
        if (relationship.required) fail(`${context} is missing a required relationship.`);
        return;
      }
      if (reference === null) {
        if (relationship.serializedAbsence !== 'omitted-or-null') {
          fail(`${context} has an invalid relationship.`);
        }
        return;
      }
      if (typeof reference !== 'string' || reference.length === 0) {
        fail(`${context} has an invalid relationship.`);
      }
      if (!parentIds[parentTable].has(reference)) {
        fail(`${context} has a dangling ${String(relationship.childField)} relationship.`);
      }
    });
  }
}

function validateUniqueLegacyField(
  records: readonly PlainObject[],
  field: string,
  context: string,
): void {
  const owners = new Map<string, string>();
  records.forEach((record, index) => {
    const value = record[field];
    if (typeof value !== 'string') return;
    const existingOwner = owners.get(value);
    if (existingOwner !== undefined && existingOwner !== record.id) {
      fail(`${context} contains a conflicting unique ${field} value.`);
    }
    owners.set(value, typeof record.id === 'string' ? record.id : `#${index + 1}`);
  });
}

export function validateLegacyUniqueIndexes(snapshot: LegacyBackupData): void {
  validateUniqueLegacyField(
    snapshot.users as unknown as PlainObject[],
    'email',
    'Legacy users merge',
  );
  validateUniqueLegacyField(
    snapshot.settings as unknown as PlainObject[],
    'userId',
    'Legacy settings merge',
  );
}

function buildLegacyImportSummary(
  current: LegacyBackupData,
  incoming: LegacyBackupData,
): LegacyImportSummary {
  const incomingCounts = {} as Record<LegacyBackupTableName, number>;
  const replacementCounts = {} as Record<LegacyBackupTableName, number>;
  const newCounts = {} as Record<LegacyBackupTableName, number>;
  let totalIncoming = 0;
  for (const table of LEGACY_BACKUP_TABLES) {
    const currentIds = new Set(current[table].map((record) => record.id));
    incomingCounts[table] = incoming[table].length;
    replacementCounts[table] = incoming[table].filter((record) => currentIds.has(record.id)).length;
    newCounts[table] = incomingCounts[table] - replacementCounts[table];
    totalIncoming += incomingCounts[table];
  }
  return { incomingCounts, replacementCounts, newCounts, totalIncoming };
}

export async function prepareLegacyImport(
  value: unknown,
  database: AetherDatabase = db,
): Promise<PreparedLegacyImport> {
  const classification = classifyBackupFormat(value);
  if (classification === 'version-2') {
    fail('Version 2 backups cannot be imported through the legacy workspace importer.');
  }
  const { data, warnings } = validateLegacyBackup(value);
  const current = await readLegacySnapshot(database);
  const postMerge = buildLegacyPostMergeView(current, data);
  validateLegacyRelationships(postMerge);
  validateLegacyUniqueIndexes(postMerge);
  return {
    format: 'legacy-v1',
    data,
    warnings,
    summary: buildLegacyImportSummary(current, data),
  };
}

type OmittedSnapshot = Record<
  Exclude<PersistenceTableName, LegacyBackupTableName>,
  unknown[]
>;

async function readLegacyOmittedSnapshot(database: AetherDatabase): Promise<OmittedSnapshot> {
  const tables: Table[] = LEGACY_OMITTED_TABLES.map((table) => database.table(table));
  return database.transaction('r', tables, async () => {
    const entries = await Promise.all(LEGACY_OMITTED_TABLES.map(async (table) => [
      table,
      await database.table(table).toArray(),
    ] as const));
    return Object.fromEntries(entries) as OmittedSnapshot;
  });
}

function samePersistedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifyLegacyImportState(
  before: LegacyBackupData,
  after: LegacyBackupData,
  incoming: LegacyBackupData,
): void {
  for (const table of LEGACY_BACKUP_TABLES) {
    const afterById = new Map(after[table].map((record) => [record.id, record]));
    const incomingIds = new Set(incoming[table].map((record) => record.id));
    for (const record of incoming[table]) {
      if (!samePersistedValue(afterById.get(record.id), record)) {
        throw new LegacyImportCommittedError(
          'Legacy import committed, but post-write verification failed. Reload the application before retrying.',
        );
      }
    }
    for (const record of before[table]) {
      if (
        !incomingIds.has(record.id)
        && !samePersistedValue(afterById.get(record.id), record)
      ) {
        throw new LegacyImportCommittedError(
          'Legacy import committed, but preservation verification failed. Reload the application before retrying.',
        );
      }
    }
  }
}

export async function importLegacyBackup(
  prepared: PreparedLegacyImport,
  options: LegacyImportOptions = {},
): Promise<LegacyImportResult> {
  const database = options.database ?? db;
  const omittedBefore = await readLegacyOmittedSnapshot(database);
  const transactionTables: Table[] = LEGACY_BACKUP_TABLES.map(
    (table) => database.table(table),
  );
  let current: LegacyBackupData;

  try {
    await database.transaction('rw', transactionTables, async () => {
      current = await readLegacyTables(database);
      const postMerge = buildLegacyPostMergeView(current, prepared.data);
      validateLegacyRelationships(postMerge);
      validateLegacyUniqueIndexes(postMerge);
      for (const table of LEGACY_BACKUP_TABLES) {
        if (prepared.data[table].length > 0) {
          await database.table(table).bulkPut(prepared.data[table]);
        }
      }
    });
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    fail('Legacy import transaction failed and was rolled back. No data was changed.');
  }

  const after = await readLegacySnapshot(database);
  // `current` is assigned before the first write in the successful transaction.
  const verifiedCurrent = current!;
  verifyLegacyImportState(verifiedCurrent, after, prepared.data);
  const omittedAfter = await readLegacyOmittedSnapshot(database);
  if (!samePersistedValue(omittedAfter, omittedBefore)) {
    throw new LegacyImportCommittedError(
      'Legacy import committed, but omitted-table preservation verification failed.',
    );
  }

  try {
    await options.refresh?.();
  } catch {
    throw new LegacyImportCommittedError(
      'Legacy import committed and verified, but the application refresh failed. Reload to view current data.',
    );
  }

  return {
    summary: buildLegacyImportSummary(verifiedCurrent, prepared.data),
    warnings: [...prepared.warnings],
  };
}

export function getLegacyImportErrorMessage(error: unknown): string {
  if (error instanceof BackupValidationError || error instanceof LegacyImportCommittedError) {
    return error.message;
  }
  return 'Legacy workspace import could not be completed safely. No credential details were exposed.';
}

export const REPLACE_RESTORE_CLEAR_ORDER = [
  'user_achievements',
  'notifications',
  'sessions',
  'flashcards',
  'notes',
  'tasks',
  'topics',
  'goals',
  'statistics',
  'ai_conversations',
  'subjects',
  'settings',
  'users',
  'achievement_definitions',
] as const satisfies readonly PersistenceTableName[];

export const REPLACE_RESTORE_INSERT_ORDER = [
  'achievement_definitions',
  'users',
  'settings',
  'subjects',
  'goals',
  'topics',
  'tasks',
  'ai_conversations',
  'statistics',
  'notes',
  'flashcards',
  'sessions',
  'notifications',
  'user_achievements',
] as const satisfies readonly PersistenceTableName[];

export interface PreparedReplaceRestore {
  format: 'version-2';
  backup: AetherBackupV2;
  incomingCounts: AetherBackupRecordCounts;
  expectedPostRestoreCounts: AetherBackupRecordCounts;
}

export interface SafetyBackupReceipt {
  readonly kind: 'verified-safety-backup';
  readonly runtime: 'browser' | 'electron';
  readonly completedAt: string;
  readonly token: symbol;
}

const SAFETY_BACKUP_RECEIPT_TOKEN = Symbol('verified-safety-backup');

export interface SafetyBackupDelivery {
  runtime: 'browser' | 'electron';
  deliver(json: string, filename: string): Promise<boolean>;
}

export interface ReplaceRestoreHooks {
  beforeClear?: (table: PersistenceTableName) => void | Promise<void>;
  afterClear?: (table: PersistenceTableName) => void | Promise<void>;
  beforeInsert?: (table: PersistenceTableName) => void | Promise<void>;
  afterInsert?: (table: PersistenceTableName) => void | Promise<void>;
  beforeRelationshipVerification?: () => void | Promise<void>;
  beforeCountVerification?: () => void | Promise<void>;
  beforeTableCountVerification?: (table: PersistenceTableName) => void | Promise<void>;
  beforeReopen?: () => void | Promise<void>;
  beforePostCommitVerification?: () => void | Promise<void>;
  beforeStoreRefresh?: () => void | Promise<void>;
}

export interface ReplaceRestoreOptions {
  database?: AetherDatabase;
  safetyReceipt: SafetyBackupReceipt;
  confirmed: boolean;
  refresh: (snapshot: AetherBackupDataV2) => void | Promise<void>;
  markerStorage?: MarkerStorage;
  reopen?: (database: AetherDatabase) => Promise<void>;
  hooks?: ReplaceRestoreHooks;
}

export interface ReplaceRestoreResult {
  counts: AetherBackupRecordCounts;
}

function cloneBackup(backup: AetherBackupV2): AetherBackupV2 {
  return JSON.parse(JSON.stringify(backup)) as AetherBackupV2;
}

export function prepareReplaceRestore(value: unknown): PreparedReplaceRestore {
  if (classifyBackupFormat(value) !== 'version-2') {
    fail('Only a complete Version 2 backup can be used for replacement restore.');
  }
  validateBackupV2(value);
  const backup = cloneBackup(value);
  validateBackupV2(backup);
  return {
    format: 'version-2',
    backup,
    incomingCounts: { ...backup.recordCounts },
    expectedPostRestoreCounts: {
      ...backup.recordCounts,
      achievement_definitions: CANONICAL_ACHIEVEMENT_DEFINITIONS.length,
    },
  };
}

export async function createPreRestoreSafetyBackup(
  delivery: SafetyBackupDelivery,
  database: AetherDatabase = db,
): Promise<SafetyBackupReceipt> {
  let delivered = false;
  const result = await exportFullBackup({
    database,
    download: async (json, filename) => {
      delivered = await delivery.deliver(json, filename.replace(
        'Aether_Backup_V2_',
        'Aether_PreRestore_SafetyBackup_',
      ));
    },
  });
  validateBackupV2(parseBackupJson(result.json));
  if (!delivered) {
    fail('The safety backup was not completed and verified. No data was changed.');
  }
  return {
    kind: 'verified-safety-backup',
    runtime: delivery.runtime,
    completedAt: new Date().toISOString(),
    token: SAFETY_BACKUP_RECEIPT_TOKEN,
  };
}

async function readAllTablesInTransaction(
  database: AetherDatabase,
): Promise<AetherBackupDataV2> {
  const entries = await Promise.all(PERSISTENCE_TABLES.map(async (table) => [
    table,
    await database.table(table).toArray(),
  ] as const));
  return Object.fromEntries(entries) as AetherBackupDataV2;
}

export async function replaceRestore(
  prepared: PreparedReplaceRestore,
  options: ReplaceRestoreOptions,
): Promise<ReplaceRestoreResult> {
  if (
    !options.confirmed
    || options.safetyReceipt?.kind !== 'verified-safety-backup'
    || options.safetyReceipt.token !== SAFETY_BACKUP_RECEIPT_TOKEN
    || typeof options.refresh !== 'function'
  ) {
    fail('Replacement restore requires a completed safety backup, deliberate confirmation, and an application refresh.');
  }

  const database = options.database ?? db;
  const transactionTables: Table[] = PERSISTENCE_TABLES.map(
    (table) => database.table(table),
  );
  const hooks = options.hooks;
  const {
    digestIncomingBackup,
    digestNormalizedState,
    verifyDatabaseIntegrity,
  } = await import('./integrityService');
  const {
    buildRestoreVerificationMarker,
    clearRestoreVerificationMarker,
    markRestoreVerificationFailed,
    reopenDatabase,
    writeRestoreVerificationMarker,
  } = await import('./restoreVerificationState');

  validateBackupV2(prepared.backup);
  const incomingBackupDigest = await digestIncomingBackup(prepared.backup);
  const expectedStateDigest = await digestNormalizedState(prepared.backup.data);
  const marker = buildRestoreVerificationMarker({
    runtime: options.safetyReceipt.runtime,
    expectedPostRestoreCounts: prepared.expectedPostRestoreCounts,
    incomingBackupDigest,
    expectedStateDigest,
  });
  try {
    writeRestoreVerificationMarker(marker, options.markerStorage);
  } catch {
    fail('Restore verification state could not be written and read back. No data was changed.');
  }

  try {
    await database.transaction('rw', transactionTables, async () => {
      // Revalidate the complete, possibly stale in-memory payload inside the
      // transaction and before the first destructive write.
      validateBackupV2(prepared.backup);

      for (const table of REPLACE_RESTORE_CLEAR_ORDER) {
        await hooks?.beforeClear?.(table);
        await database.table(table).clear();
        await hooks?.afterClear?.(table);
      }

      for (const table of REPLACE_RESTORE_INSERT_ORDER) {
        await hooks?.beforeInsert?.(table);
        const records = table === 'achievement_definitions'
          ? CANONICAL_ACHIEVEMENT_DEFINITIONS
          : prepared.backup.data[table];
        if (records.length > 0) {
          await database.table(table).bulkAdd(records);
        }
        await hooks?.afterInsert?.(table);
      }

      const postRestore = await readAllTablesInTransaction(database);
      await hooks?.beforeRelationshipVerification?.();
      validateBackupSnapshot(postRestore);

      await hooks?.beforeCountVerification?.();
      const actualCounts = calculateBackupRecordCounts(postRestore);
      for (const table of PERSISTENCE_TABLES) {
        await hooks?.beforeTableCountVerification?.(table);
        if (actualCounts[table] !== prepared.expectedPostRestoreCounts[table]) {
          throw new Error('Restore count verification failed.');
        }
      }
    });
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    fail('Replacement restore failed and was rolled back. No data was changed.');
  }

  try {
    await hooks?.beforeReopen?.();
    await (options.reopen ?? reopenDatabase)(database);
    await hooks?.beforePostCommitVerification?.();
    const verification = await verifyDatabaseIntegrity(database, marker);
    await hooks?.beforeStoreRefresh?.();
    await options.refresh(verification.snapshot);
    clearRestoreVerificationMarker(options.markerStorage);
  } catch {
    try {
      markRestoreVerificationFailed(marker, options.markerStorage);
    } catch {
      // The original durable marker remains the recovery authority.
    }
    throw new LegacyImportCommittedError(
      'Replacement restore committed, but post-restore verification is unresolved. Retry verification or deliberately restore the safety backup.',
    );
  }

  return { counts: { ...prepared.expectedPostRestoreCounts } };
}

export function getReplaceRestoreErrorMessage(error: unknown): string {
  if (error instanceof BackupValidationError || error instanceof LegacyImportCommittedError) {
    return error.message;
  }
  return 'Version 2 restore could not be completed safely. No sensitive details were exposed.';
}
