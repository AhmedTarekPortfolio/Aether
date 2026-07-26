import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AetherDatabase } from '../database';
import * as apiBarrel from '../../api';
import * as achievementApi from '../../api/achievementApi';
import * as aiConversationApi from '../../api/aiConversationApi';
import * as flashcardApi from '../../api/flashcardApi';
import * as goalApi from '../../api/goalApi';
import * as noteApi from '../../api/noteApi';
import * as notificationApi from '../../api/notificationApi';
import * as sessionApi from '../../api/sessionApi';
import * as settingsApi from '../../api/settingsApi';
import * as statisticApi from '../../api/statisticApi';
import * as subjectApi from '../../api/subjectApi';
import * as taskApi from '../../api/taskApi';
import * as topicApi from '../../api/topicApi';
import * as userApi from '../../api/userApi';
import type {
  AchievementDefinition,
  AIConversation,
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
} from '../../types';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

type Entity =
  | User
  | Settings
  | Subject
  | Topic
  | Task
  | Note
  | Flashcard
  | Session
  | Goal
  | AIConversation
  | Statistic
  | AchievementDefinition
  | UserAchievement
  | NotificationItem;

// Compile-time ownership and relationship invariants. `npm run build` fails if
// production types drift away from the reviewed WP-01 relationship inventory.
type _AllApplicationIdsAreStrings = Assert<Equal<Entity['id'], string>>;
type _SettingsUserRequired = Assert<Equal<Settings['userId'], string>>;
type _SubjectUserOptional = Assert<Equal<Subject['userId'], string | undefined>>;
type _TopicHasNoUser = Assert<Equal<HasKey<Topic, 'userId'>, false>>;
type _TopicSubjectRequired = Assert<Equal<Topic['subjectId'], string>>;
type _TaskRelations = Assert<
  Equal<[Task['userId'], Task['subjectId']], [string | undefined, string | undefined]>
>;
type _NoteRelations = Assert<
  Equal<[Note['userId'], Note['subjectId'], Note['topicId']], [
    string | undefined,
    string,
    string | undefined,
  ]>
>;
type _FlashcardRelations = Assert<
  Equal<[Flashcard['userId'], Flashcard['subjectId'], Flashcard['topicId']], [
    string | undefined,
    string,
    string | undefined,
  ]>
>;
type _SessionRelations = Assert<
  Equal<[Session['userId'], Session['subjectId'], Session['taskId']], [
    string | undefined,
    string | null | undefined,
    string | null | undefined,
  ]>
>;
type _GoalRelations = Assert<
  Equal<[Goal['userId'], Goal['subjectId']], [
    string | undefined,
    string | null | undefined,
  ]>
>;
type _AIConversationRelations = Assert<
  Equal<[AIConversation['userId'], AIConversation['subjectId'], AIConversation['taskId']], [
    string | undefined,
    string | null | undefined,
    string | null | undefined,
  ]>
>;
type _StatisticUserOptional = Assert<Equal<Statistic['userId'], string | undefined>>;
type _AchievementDefinitionHasNoUser = Assert<
  Equal<HasKey<AchievementDefinition, 'userId'>, false>
>;
type _UserAchievementRelations = Assert<
  Equal<[UserAchievement['userId'], UserAchievement['achievementId']], [
    string | undefined,
    string,
  ]>
>;
type _NotificationRelations = Assert<
  Equal<[
    NotificationItem['userId'],
    NotificationItem['relatedTaskId'],
    NotificationItem['relatedSubjectId'],
  ], [
    string | undefined,
    string | undefined,
    string | undefined,
  ]>
>;

const TABLES = [
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

type TableName = (typeof TABLES)[number];

const SCHEMA: Record<TableName, readonly string[]> = {
  users: ['&email'],
  settings: ['&userId'],
  subjects: ['userId', 'name', 'confidenceRating'],
  topics: ['subjectId', 'title', 'masteryLevel'],
  tasks: ['userId', 'subjectId', 'priority', 'status', 'dueDate'],
  notes: ['userId', 'subjectId', 'topicId', 'title', 'updatedAt'],
  flashcards: ['userId', 'subjectId', 'topicId', 'nextReviewDate'],
  sessions: ['userId', 'subjectId', 'taskId', 'completedAt'],
  goals: ['userId', 'subjectId', 'status'],
  ai_conversations: ['userId', 'subjectId', 'mode', 'timestamp'],
  statistics: ['userId', '[userId+metricKey+periodStart]'],
  achievement_definitions: ['&key'],
  user_achievements: ['userId', '[userId+achievementId]'],
  notifications: ['userId', 'type', 'createdAt'],
};

const API_MODULES = {
  userApi: {
    module: userApi,
    exports: ['getUser', 'updateUser'],
    source: 'src/api/userApi.ts',
  },
  settingsApi: {
    module: settingsApi,
    exports: ['getSettings', 'updateSettings'],
    source: 'src/api/settingsApi.ts',
  },
  subjectApi: {
    module: subjectApi,
    exports: [
      'addSubject',
      'checkSubjectReferences',
      'deleteSubject',
      'getSubjects',
      'updateSubject',
      'validateSubjectName',
    ],
    source: 'src/api/subjectApi.ts',
  },
  topicApi: {
    module: topicApi,
    exports: ['addTopic', 'deleteTopic', 'getTopics', 'updateTopic'],
    source: 'src/api/topicApi.ts',
  },
  taskApi: {
    module: taskApi,
    exports: ['addTask', 'deleteTask', 'getTaskById', 'getTasks', 'updateTask'],
    source: 'src/api/taskApi.ts',
  },
  noteApi: {
    module: noteApi,
    exports: ['addNote', 'deleteNote', 'getNotes', 'updateNote'],
    source: 'src/api/noteApi.ts',
  },
  flashcardApi: {
    module: flashcardApi,
    exports: ['addFlashcard', 'deleteFlashcard', 'getFlashcards', 'updateFlashcard'],
    source: 'src/api/flashcardApi.ts',
  },
  sessionApi: {
    module: sessionApi,
    exports: ['addSession', 'getSessions'],
    source: 'src/api/sessionApi.ts',
  },
  goalApi: {
    module: goalApi,
    exports: ['addGoal', 'deleteGoal', 'getGoals', 'updateGoal'],
    source: 'src/api/goalApi.ts',
  },
  aiConversationApi: {
    module: aiConversationApi,
    exports: ['addAIConversation', 'clearAIConversations', 'getAIConversations'],
    source: 'src/api/aiConversationApi.ts',
  },
  statisticApi: {
    module: statisticApi,
    exports: ['getStatistics'],
    source: 'src/api/statisticApi.ts',
  },
  achievementApi: {
    module: achievementApi,
    exports: ['getAchievementDefinitions', 'getUserAchievements'],
    source: 'src/api/achievementApi.ts',
  },
  notificationApi: {
    module: notificationApi,
    exports: ['getNotifications', 'markAllNotificationsAsRead', 'markNotificationAsRead'],
    source: 'src/api/notificationApi.ts',
  },
} as const;

const DOCUMENTED_RUNTIME_CRUD: Record<TableName, {
  add: readonly string[];
  put: readonly string[];
  update: readonly string[];
  delete: readonly string[];
  clear: readonly string[];
  missing: readonly string[];
}> = {
  users: {
    add: [],
    put: [],
    update: ['updateUser'],
    delete: [],
    clear: [],
    missing: ['addUser', 'putUser', 'deleteUser', 'clearUsers'],
  },
  settings: {
    add: [],
    put: [],
    update: ['updateSettings'],
    delete: [],
    clear: [],
    missing: ['addSettings', 'putSettings', 'deleteSettings', 'clearSettings'],
  },
  subjects: {
    add: ['addSubject'],
    put: [],
    update: ['updateSubject'],
    delete: ['deleteSubject'],
    clear: [],
    missing: ['putSubject', 'clearSubjects'],
  },
  topics: {
    add: ['addTopic'],
    put: [],
    update: ['updateTopic'],
    delete: ['deleteTopic'],
    clear: [],
    missing: ['putTopic', 'clearTopics'],
  },
  tasks: {
    add: ['addTask'],
    put: [],
    update: ['updateTask'],
    delete: ['deleteTask'],
    clear: [],
    missing: ['putTask', 'clearTasks'],
  },
  notes: {
    add: ['addNote'],
    put: [],
    update: ['updateNote'],
    delete: ['deleteNote'],
    clear: [],
    missing: ['putNote', 'clearNotes'],
  },
  flashcards: {
    add: ['addFlashcard'],
    put: [],
    update: ['updateFlashcard'],
    delete: ['deleteFlashcard'],
    clear: [],
    missing: ['putFlashcard', 'clearFlashcards'],
  },
  sessions: {
    add: ['addSession'],
    put: [],
    update: [],
    delete: [],
    clear: [],
    missing: ['putSession', 'updateSession', 'deleteSession', 'clearSessions'],
  },
  goals: {
    add: ['addGoal'],
    put: [],
    update: ['updateGoal'],
    delete: ['deleteGoal'],
    clear: [],
    missing: ['putGoal', 'clearGoals'],
  },
  ai_conversations: {
    add: ['addAIConversation'],
    put: [],
    update: [],
    delete: [],
    clear: ['clearAIConversations'],
    missing: ['putAIConversation', 'updateAIConversation', 'deleteAIConversation'],
  },
  statistics: {
    add: [],
    put: [],
    update: [],
    delete: [],
    clear: [],
    missing: ['addStatistic', 'putStatistic', 'updateStatistic', 'deleteStatistic', 'clearStatistics'],
  },
  achievement_definitions: {
    add: [],
    put: [],
    update: [],
    delete: [],
    clear: [],
    missing: [
      'addAchievementDefinition',
      'putAchievementDefinition',
      'updateAchievementDefinition',
      'deleteAchievementDefinition',
      'clearAchievementDefinitions',
    ],
  },
  user_achievements: {
    add: [],
    put: [],
    update: [],
    delete: [],
    clear: [],
    missing: [
      'addUserAchievement',
      'putUserAchievement',
      'updateUserAchievement',
      'deleteUserAchievement',
      'clearUserAchievements',
    ],
  },
  notifications: {
    add: [],
    put: [],
    update: ['markNotificationAsRead', 'markAllNotificationsAsRead'],
    delete: [],
    clear: [],
    missing: ['addNotification', 'putNotification', 'deleteNotification', 'clearNotifications'],
  },
};

const DOCUMENTED_API_EXPORTS: Record<TableName, readonly string[]> = {
  users: ['getUser', 'updateUser'],
  settings: ['getSettings', 'updateSettings'],
  subjects: [
    'getSubjects',
    'addSubject',
    'updateSubject',
    'deleteSubject',
    'checkSubjectReferences',
    'validateSubjectName',
  ],
  topics: ['getTopics', 'addTopic', 'updateTopic', 'deleteTopic'],
  tasks: ['getTasks', 'getTaskById', 'addTask', 'updateTask', 'deleteTask'],
  notes: ['getNotes', 'addNote', 'updateNote', 'deleteNote'],
  flashcards: ['getFlashcards', 'addFlashcard', 'updateFlashcard', 'deleteFlashcard'],
  sessions: ['getSessions', 'addSession'],
  goals: ['getGoals', 'addGoal', 'updateGoal', 'deleteGoal'],
  ai_conversations: ['getAIConversations', 'addAIConversation', 'clearAIConversations'],
  statistics: ['getStatistics'],
  achievement_definitions: ['getAchievementDefinitions'],
  user_achievements: ['getUserAchievements'],
  notifications: ['getNotifications', 'markNotificationAsRead', 'markAllNotificationsAsRead'],
};

const DOCUMENTED_DIRECT_ACCESS: Record<TableName, readonly string[]> = {
  users: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx'],
  settings: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx'],
  subjects: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx'],
  topics: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx', 'subjectApi.ts'],
  tasks: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx', 'subjectApi.ts'],
  notes: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx', 'subjectApi.ts'],
  flashcards: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx', 'subjectApi.ts'],
  sessions: ['database.ts', 'useAppStore.ts', 'SettingsView.tsx', 'subjectApi.ts'],
  goals: ['database.ts', 'useAppStore.ts', 'subjectApi.ts'],
  ai_conversations: ['database.ts', 'useAppStore.ts', 'subjectApi.ts'],
  statistics: ['database.ts', 'useAppStore.ts'],
  achievement_definitions: ['database.ts'],
  user_achievements: ['database.ts', 'useAppStore.ts'],
  notifications: ['database.ts', 'useAppStore.ts'],
};

const SEEDED_OR_MIGRATED_TABLES = new Set<TableName>([
  'users',
  'settings',
  'subjects',
  'topics',
  'tasks',
  'notes',
  'flashcards',
  'sessions',
  'ai_conversations',
  'achievement_definitions',
  'notifications',
]);

const REACTIVE_TABLES = [
  'users',
  'settings',
  'subjects',
  'topics',
  'tasks',
  'notes',
  'flashcards',
  'sessions',
  'ai_conversations',
  'notifications',
  'goals',
  'statistics',
  'user_achievements',
] as const;

const LEGACY_EXPORT_TABLES = [
  'users',
  'settings',
  'subjects',
  'topics',
  'tasks',
  'notes',
  'flashcards',
  'sessions',
] as const;

const EXPECTED_DIRECT_DB_FILES = [
  'src/api/achievementApi.ts',
  'src/api/aiConversationApi.ts',
  'src/api/flashcardApi.ts',
  'src/api/goalApi.ts',
  'src/api/noteApi.ts',
  'src/api/notificationApi.ts',
  'src/api/sessionApi.ts',
  'src/api/settingsApi.ts',
  'src/api/statisticApi.ts',
  'src/api/subjectApi.ts',
  'src/api/taskApi.ts',
  'src/api/topicApi.ts',
  'src/api/userApi.ts',
  'src/db/database.ts',
  'src/services/backupService.ts',
  'src/store/useAppStore.ts',
] as const;

const PLAN_PATH = 'docs/PHASE_1_IMPLEMENTATION_PLAN.md';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function walkProductionFiles(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walkProductionFiles(child);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [child] : [];
  });
}

function parseInventoryRows(plan: string): Map<TableName, string[]> {
  const rows = new Map<TableName, string[]>();
  for (const line of plan.split(/\r?\n/)) {
    const match = line.match(/^\| `([^`]+)` \|/);
    if (!match || !TABLES.includes(match[1] as TableName)) continue;
    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
    rows.set(match[1] as TableName, cells);
  }
  return rows;
}

function expectDocumentedMethods(cell: string, methods: readonly string[]): void {
  if (methods.length === 0) {
    expect(cell).toBe('Not currently implemented');
    return;
  }
  for (const method of methods) expect(cell).toContain(method);
}

describe('WP-01 persistence inventory invariants', () => {
  it('declares exactly the 14 reviewed Version 3 tables, string primary keys, and indexes', () => {
    const database = new AetherDatabase();
    expect(database.name).toBe('AetherPhase1DB');
    expect(database.verno).toBe(3);
    expect(database.tables.map((table) => table.name).sort()).toEqual([...TABLES].sort());

    for (const tableName of TABLES) {
      const schema = database.table(tableName).schema;
      expect(schema.primKey.src, `${tableName} primary key`).toBe('id');
      expect(schema.primKey.auto, `${tableName} must use application-supplied IDs`).toBe(false);
      expect(schema.indexes.map((index) => index.src), `${tableName} indexes`).toEqual(SCHEMA[tableName]);
    }

    expect(database.tables.flatMap((table) => table.schema.indexes.map((index) => index.src)))
      .not.toEqual(expect.arrayContaining(['apiKey', 'token', 'secret', 'authorization']));
    database.close();
  });

  it('exports exactly the reviewed API surface and exposes every method through the barrel', () => {
    for (const { module, exports } of Object.values(API_MODULES)) {
      expect(Object.keys(module).sort()).toEqual([...exports].sort());
      for (const exportedName of exports) expect(apiBarrel).toHaveProperty(exportedName);
    }
  });

  it('keeps intentionally missing CRUD absent and documented table by table', () => {
    const planRows = parseInventoryRows(read(PLAN_PATH));
    expect([...planRows.keys()].sort()).toEqual([...TABLES].sort());

    for (const tableName of TABLES) {
      const row = planRows.get(tableName);
      expect(row, `${tableName} inventory row`).toBeDefined();
      const contract = DOCUMENTED_RUNTIME_CRUD[tableName];
      expectDocumentedMethods(row![5], contract.add);
      expectDocumentedMethods(row![6], contract.put);
      expectDocumentedMethods(row![7], contract.update);
      expectDocumentedMethods(row![8], contract.delete);
      expectDocumentedMethods(row![9], contract.clear);
      const documentedDirectFiles = [...row![10].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      expect(documentedDirectFiles.sort(), `${tableName} direct access files`)
        .toEqual([...DOCUMENTED_DIRECT_ACCESS[tableName]].sort());
      const documentedApiMethods = [...row![11].matchAll(/`([^`]+)`/g)]
        .map((match) => match[1])
        .filter((token) => !token.endsWith('.ts'));
      expect(documentedApiMethods.sort(), `${tableName} API exports`)
        .toEqual([...DOCUMENTED_API_EXPORTS[tableName]].sort());
      if (REACTIVE_TABLES.includes(tableName as (typeof REACTIVE_TABLES)[number])) {
        expect(row![12], `${tableName} reactive read`).not.toBe('None');
      } else {
        expect(row![12], `${tableName} has no reactive read`).toBe('None');
      }
      if (LEGACY_EXPORT_TABLES.includes(tableName as (typeof LEGACY_EXPORT_TABLES)[number])) {
        expect(row![13], `${tableName} legacy export read`).toContain(`db.${tableName}.toArray()`);
      } else {
        expect(row![13], `${tableName} is absent from the legacy export`).toBe('None');
      }
      for (const missingMethod of contract.missing) {
        expect(row![14], `${tableName} missing ${missingMethod}`).toContain(missingMethod);
        expect(apiBarrel).not.toHaveProperty(missingMethod);
      }
    }
  });

  it('keeps seed/init writes separate from ordinary runtime CRUD', () => {
    const planRows = parseInventoryRows(read(PLAN_PATH));
    for (const tableName of TABLES) {
      const row = planRows.get(tableName)!;
      if (SEEDED_OR_MIGRATED_TABLES.has(tableName)) {
        expect(row[4]).not.toBe('Not currently implemented');
      } else {
        expect(row[4]).toBe('Not currently implemented');
      }
      expect(row[5], `${tableName} runtime Add must not classify database seeding as CRUD`)
        .not.toContain('database.ts');
    }

    const databaseSource = read('src/db/database.ts');
    expect(databaseSource).toContain('export async function seedInitialDataIfEmpty()');
    expect(databaseSource).toContain('await db.users.put(');
    expect(databaseSource).toContain(
      'await db.achievement_definitions.bulkAdd(CANONICAL_ACHIEVEMENT_DEFINITIONS)',
    );
    for (const tableName of ['goals', 'statistics', 'user_achievements'] as const) {
      expect(databaseSource).not.toMatch(new RegExp(`db\\.${tableName}\\.(add|put|bulkAdd|bulkPut)\\(`));
    }
  });

  it('maps each documented API reader and writer to the correct Dexie table operation', () => {
    const requiredCalls: Record<string, readonly string[]> = {
      userApi: ['db.users.get(', 'db.users.update('],
      settingsApi: ['db.settings.get(', 'db.settings.update('],
      subjectApi: [
        'db.subjects.toArray(',
        'db.subjects.add(',
        'db.subjects.update(',
        'db.subjects.delete(',
        "db.tasks.where('subjectId')",
        "db.notes.where('subjectId')",
        "db.flashcards.where('subjectId')",
        "db.sessions.where('subjectId')",
        "db.topics.where('subjectId')",
        "db.goals.where('subjectId')",
        "db.ai_conversations.where('subjectId')",
      ],
      topicApi: ['db.topics.toArray('],
      taskApi: ['db.tasks.toArray(', 'db.tasks.get(', 'db.tasks.add(', 'db.tasks.update(', 'db.tasks.delete('],
      noteApi: ['db.notes.orderBy(', 'db.notes.add(', 'db.notes.update(', 'db.notes.delete('],
      flashcardApi: ['db.flashcards.toArray('],
      sessionApi: ['db.sessions.toArray(', 'db.sessions.add('],
      goalApi: ['db.goals.toArray('],
      aiConversationApi: [
        'db.ai_conversations.orderBy(',
        'db.ai_conversations.add(',
        'db.ai_conversations.clear(',
      ],
      statisticApi: ['db.statistics.toArray('],
      achievementApi: ['CANONICAL_ACHIEVEMENT_DEFINITIONS.map(', 'db.user_achievements.toArray('],
      notificationApi: ['db.notifications.orderBy(', 'db.notifications.update('],
    };

    for (const [moduleName, config] of Object.entries(API_MODULES)) {
      const source = read(config.source);
      for (const call of requiredCalls[moduleName]) expect(source).toContain(call);
    }
  });

  it('locks direct database access to the reviewed database, API, store, and export files', () => {
    const tablePattern = TABLES.join('|');
    const directFiles = walkProductionFiles('src')
      .filter((file) => {
        const source = read(file);
        return new RegExp(`\\bdb\\.(${tablePattern})\\b`).test(source)
          || (
            file === 'src/services/backupService.ts'
            && new RegExp(`\\bdatabase\\.(${tablePattern})\\b`).test(source)
          );
      })
      .sort();
    expect(directFiles).toEqual([...EXPECTED_DIRECT_DB_FILES].sort());
  });

  it('distinguishes reactive reads, read-only export, and the bounded legacy import writer', () => {
    const storeSource = read('src/store/useAppStore.ts');
    const directStoreTables = [...storeSource.matchAll(/\bdb\.([a-z_]+)\b/g)]
      .map((match) => match[1])
      .filter((table): table is TableName => TABLES.includes(table as TableName));
    expect([...new Set(directStoreTables)].sort()).toEqual([...REACTIVE_TABLES].sort());
    expect(storeSource).not.toMatch(/\bdb\.[a-z_]+\.(add|put|bulkAdd|bulkPut|update|delete|clear)\(/);
    for (const tableName of REACTIVE_TABLES) {
      expect(storeSource).toMatch(new RegExp(`useLiveQuery\\([\\s\\S]{0,180}db\\.${tableName}\\b`));
    }

    const backupSource = read('src/services/backupService.ts');
    const exportedTables = [...backupSource.matchAll(/\bdatabase\.([a-z_]+)\.toArray\(\)/g)]
      .map((match) => match[1]);
    expect(exportedTables).toEqual(TABLES);
    const exportBody = backupSource.slice(
      backupSource.indexOf('export async function exportFullBackup'),
      backupSource.indexOf('export function getBackupErrorMessage'),
    );
    expect(exportBody).not.toMatch(/\.(add|put|bulkAdd|bulkPut|update|delete|clear)\(/);

    const importBody = backupSource.slice(
      backupSource.indexOf('export async function importLegacyBackup'),
      backupSource.indexOf('export function getLegacyImportErrorMessage'),
    );
    expect(importBody).toContain("database.transaction('rw', transactionTables");
    expect(importBody).toContain('database.table(table).bulkPut(prepared.data[table])');
    expect(importBody).not.toMatch(/\.(add|put|bulkAdd|update|delete|clear)\(/);

    const settingsSource = read('src/views/SettingsView.tsx');
    expect(settingsSource).toContain('exportFullBackup(');
    expect(settingsSource).toContain('prepareLegacyImport(parsed)');
    expect(settingsSource).toContain('importLegacyBackup(preparedLegacyImport)');
    expect(settingsSource).not.toMatch(/\bdb\.[a-z_]+\.toArray\(\)/);
  });

  it('verifies current userId writers and the three entities with no record writer', () => {
    const storeSource = read('src/store/useAppStore.ts');
    for (const writer of ['addTask', 'addSubject', 'addNote', 'logFocusSession']) {
      const start = storeSource.indexOf(`const ${writer}`);
      expect(start, `${writer} exists`).toBeGreaterThanOrEqual(0);
      expect(storeSource.slice(start, start + 500), `${writer} sets current user scope`)
        .toContain("userId: 'default_user'");
    }

    const orchestratorSource = read('src/services/ai/orchestrator.ts');
    const aiWrite = orchestratorSource.slice(
      orchestratorSource.indexOf('await addAIConversation(candidate)'),
      orchestratorSource.indexOf('return candidate', orchestratorSource.indexOf('await addAIConversation(candidate)')),
    );
    expect(aiWrite).toContain('await addAIConversation(candidate)');
    expect(storeSource).not.toContain('addAIMessage');
    expect(read('src/views/AIAssistantView.tsx')).not.toContain('onAddAIMessage');
    expect(orchestratorSource).toContain('userId: prepared.userId');

    const plan = read(PLAN_PATH);
    expect(plan).toContain(
      'Single AI Persistence Owner',
    );
    for (const entity of ['Goal', 'Statistic', 'UserAchievement']) {
      expect(plan).toContain(
        `| \`${entity}\` | Yes | Optional (\`userId?\`) | None; no current record writer | N/A |`,
      );
    }
  });

  it('keeps the complete relationship inventory aligned with production types', () => {
    const plan = read(PLAN_PATH);
    const relationshipRows = [
      'Settings.userId',
      'Subject.userId',
      'Topic.subjectId',
      'Task.userId',
      'Task.subjectId',
      'Note.userId',
      'Note.subjectId',
      'Note.topicId',
      'Flashcard.userId',
      'Flashcard.subjectId',
      'Flashcard.topicId',
      'Session.userId',
      'Session.subjectId',
      'Session.taskId',
      'Goal.userId',
      'Goal.subjectId',
      'AIConversation.userId',
      'AIConversation.subjectId',
      'AIConversation.taskId',
      'Statistic.userId',
      'UserAchievement.userId',
      'UserAchievement.achievementId',
      'NotificationItem.userId',
      'NotificationItem.relatedTaskId',
      'NotificationItem.relatedSubjectId',
    ];
    for (const relation of relationshipRows) {
      expect(plan, `${relation} relationship row`).toContain(`| \`${relation}\` |`);
    }
    expect(plan).toContain(
      'Because JSON cannot encode `undefined`, an optional `string | undefined` field must be omitted',
    );
  });
});
