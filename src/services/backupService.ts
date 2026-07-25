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
  PERSISTENCE_TABLES,
  RELATIONSHIP_CONTRACTS,
  TABLE_FIELD_ALLOWLISTS,
  TABLE_TIMESTAMP_RULES,
  type AetherBackupDataV2,
  type AetherBackupRecordCounts,
  type AetherBackupV2,
  type PersistenceRecordMap,
  type PersistenceTableName,
} from '../types';

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
