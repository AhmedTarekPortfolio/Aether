# Phase 1 Implementation Plan — Final Persistence Architecture Contract

## 1. Executive Summary

### Architectural Purpose & Scope
This document serves as the authoritative, repository-grounded Phase 1 Persistence Architecture Contract for Aether across Web and Windows Desktop environments. Every claim, reader, writer, data shape, relationship rule, transaction boundary, and test requirement in this document is verified directly against `src/db/database.ts`, `src/types/index.ts`, `src/api/*`, `src/store/useAppStore.ts`, `src/views/SettingsView.tsx`, `src/services/ai/orchestrator.ts`, and `package.json`.

### Non-Negotiable Architecture Invariants
- **Database Identity**: IndexedDB database name is `AetherPhase1DB`, running on **Dexie Version 3** with **14 normalized tables** (Dexie npm package `^4.0.10` installed).
- **No Dexie Version 4 Schema Upgrade**: No schema migration is required or permitted during Phase 1. Dexie Version 3 already declares all 14 database tables.
- **AI Conversation Persistence**: Retains flat `AIConversation` interaction records (**Strategy A**). No embedded `messages[]` aggregate schema modification.
- **Single AI Persistence Writer**: Designates `aiOrchestrator.send()` in `src/services/ai/orchestrator.ts` as the sole authoritative writer for completed AI interaction records, converting `AIAssistantView` into a read-only consumer driven reactively by `useLiveQuery`.
- **Backup & Restore Strategy**:
  - **Version 2 Complete Backup**: **Replace Restore Only** for 14-table backups, guarded by mandatory pre-restore safety backups and a single 14-table Dexie transaction.
  - **Legacy Eight-Table Export**: **Partial Merge Import Only** for unversioned legacy Phase 0 exports. 6 absent tables remain completely untouched.
- **Compatibility Statement**: Preserving the flat AI interaction model minimises schema-migration risk and retains the existing record representation. Backward compatibility remains an implementation objective that must be demonstrated through real IndexedDB integration tests and the complete Phase 0 regression suite.

---

## 2. Verified Repository Baseline

- **Active Branch**: `main`
- **Current HEAD Commit**: `35e3e45881b2c5230ee48f2f57532d56d04a83ec` (`docs: resolve Phase 1 architecture review blockers`)
- **Divergence from `origin/main`**: Local `main` is 2 commits ahead (`0 left, 2 right`)
- **Local Documentation Commits**: `d85e431`, `35e3e45`
- **Annotated Tag**: `phase-0-baseline` (pointing to commit `4bac10a72bf20f569eca5d4fb599f7ba855a16cd`)
- **Working Tree State**: Clean (`nothing to commit, working tree clean`)
- **Verification Gates**: `npm test` (31 test files, 168 tests passed), `npm run build` (0 errors), `npm run build:electron` (0 errors).

---

## 3. Verified Repository Persistence Inventory (14 Tables)

The following literal inventory reflects actual production code in `src/db/database.ts`, `src/api/*`, `src/store/useAppStore.ts`, and `src/views/SettingsView.tsx`:

| Table | TypeScript Type | Primary Key | Indexes | Seed Path | Read Paths | Add Paths | Put Paths | Update Paths | Delete Paths | Clear Paths | Direct DB Access Files | API Wrapper File | Missing Operations |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `users` | `User` | `id` (String) | `id, &email` | `database.ts` (l.213) | `useAppStore.ts` (l.89), `SettingsView.tsx` (l.44), `userApi.ts` (`getUser`) | `database.ts` | Not currently implemented | `userApi.ts` (`updateUser`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/userApi.ts` | `addUser`, `putUser`, `deleteUser`, `clearUsers` |
| `settings` | `Settings` | `id` (String) | `id, &userId` | `database.ts` (l.221) | `useAppStore.ts` (l.90), `SettingsView.tsx` (l.45), `settingsApi.ts` (`getSettings`) | `database.ts` | Not currently implemented | `settingsApi.ts` (`updateSettings`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/settingsApi.ts` | `addSettings`, `putSettings`, `deleteSettings`, `clearSettings` |
| `subjects` | `Subject` | `id` (String) | `id, userId, name, confidenceRating` | `database.ts` (l.237) | `useAppStore.ts` (l.78), `SettingsView.tsx` (l.46), `subjectApi.ts` (`getSubjects`) | `subjectApi.ts` (`addSubject`) | Not currently implemented | `subjectApi.ts` (`updateSubject`) | `subjectApi.ts` (`deleteSubject`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/subjectApi.ts` | `putSubject`, `clearSubjects` |
| `topics` | `Topic` | `id` (String) | `id, subjectId, title, masteryLevel` | `database.ts` (l.285) | `useAppStore.ts` (l.79), `SettingsView.tsx` (l.47), `topicApi.ts` (`getTopics`), `subjectApi.ts` (ref check) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/topicApi.ts` | `addTopic`, `putTopic`, `updateTopic`, `deleteTopic`, `clearTopics` |
| `tasks` | `Task` | `id` (String) | `id, userId, subjectId, priority, status, dueDate` | `database.ts` (l.294) | `useAppStore.ts` (l.80), `SettingsView.tsx` (l.48), `taskApi.ts` (`getTasks`, `getTaskById`), `subjectApi.ts` (ref check) | `taskApi.ts` (`addTask`) | Not currently implemented | `taskApi.ts` (`updateTask`) | `taskApi.ts` (`deleteTask`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/taskApi.ts` | `putTask`, `clearTasks` |
| `notes` | `Note` | `id` (String) | `id, userId, subjectId, topicId, title, updatedAt` | `database.ts` (l.339) | `useAppStore.ts` (l.81), `SettingsView.tsx` (l.49), `noteApi.ts` (`getNotes`), `subjectApi.ts` (ref check) | `noteApi.ts` (`addNote`) | Not currently implemented | `noteApi.ts` (`updateNote`) | `noteApi.ts` (`deleteNote`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/noteApi.ts` | `putNote`, `clearNotes` |
| `flashcards` | `Flashcard` | `id` (String) | `id, userId, subjectId, topicId, nextReviewDate` | Migration V2/V3 in `database.ts` | `useAppStore.ts` (l.82), `SettingsView.tsx` (l.50), `flashcardApi.ts` (`getFlashcards`), `subjectApi.ts` (ref check) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/flashcardApi.ts` | `addFlashcard`, `putFlashcard`, `updateFlashcard`, `deleteFlashcard`, `clearFlashcards` |
| `sessions` | `Session` | `id` (String) | `id, userId, subjectId, taskId, completedAt` | `database.ts` (l.393) | `useAppStore.ts` (l.83), `SettingsView.tsx` (l.51), `sessionApi.ts` (`getSessions`), `subjectApi.ts` (ref check) | `sessionApi.ts` (`addSession`) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/sessionApi.ts` | `putSession`, `updateSession`, `deleteSession`, `clearSessions` |
| `goals` | `Goal` | `id` (String) | `id, userId, subjectId, status` | Migration V3 in `database.ts` | `goalApi.ts` (`getGoals`), `subjectApi.ts` (ref check) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `subjectApi.ts` | `src/api/goalApi.ts` | `addGoal`, `putGoal`, `updateGoal`, `deleteGoal`, `clearGoals` |
| `ai_conversations` | `AIConversation` | `id` (String) | `id, userId, subjectId, mode, timestamp` | `database.ts` (l.422) | `useAppStore.ts` (l.84), `aiConversationApi.ts` (`getAIConversations`), `subjectApi.ts` (ref check) | `orchestrator.ts` (l.217), `AIAssistantView.tsx` (l.221 -> duplicate writer) | Not currently implemented | Not currently implemented | Not currently implemented | `aiConversationApi.ts` (`clearAIConversations`) | `database.ts`, `useAppStore.ts`, `subjectApi.ts` | `src/api/aiConversationApi.ts` | `putAIConversation`, `updateAIConversation`, `deleteAIConversation` |
| `statistics` | `Statistic` | `id` (String) | `id, userId, [userId+metricKey+periodStart]` | Migration V3 in `database.ts` | `statisticApi.ts` (`getStatistics`) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/statisticApi.ts` | `addStatistic`, `putStatistic`, `updateStatistic`, `deleteStatistic`, `clearStatistics` |
| `achievement_definitions` | `AchievementDefinition` | `id` (String) | `id, &key` | `database.ts` (l.460) | `achievementApi.ts` (`getAchievementDefinitions`) | `database.ts` | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/achievementApi.ts` | `addAchievementDefinition`, `putAchievementDefinition`, `updateAchievementDefinition`, `deleteAchievementDefinition`, `clearAchievementDefinitions` |
| `user_achievements` | `UserAchievement` | `id` (String) | `id, userId, [userId+achievementId]` | Migration V3 in `database.ts` | `achievementApi.ts` (`getUserAchievements`) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/achievementApi.ts` | `addUserAchievement`, `putUserAchievement`, `updateUserAchievement`, `deleteUserAchievement`, `clearUserAchievements` |
| `notifications` | `NotificationItem` | `id` (String) | `id, userId, type, createdAt` | `database.ts` (l.435) | `useAppStore.ts` (l.85), `notificationApi.ts` (`getNotifications`) | Not currently implemented | Not currently implemented | `notificationApi.ts` (`markNotificationAsRead`, `markAllNotificationsAsRead`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts` | `src/api/notificationApi.ts` | `addNotification`, `putNotification`, `deleteNotification`, `clearNotifications` |

*Note: The above "Missing Operations" list is purely descriptive of current production code gaps. It does NOT authorize creating missing API methods during Phase 1.*

---

## 4. Entity Ownership & `userId` Matrix

Universal claims that `userId` defaults to `'default_user'` across all tables are false. The table below documents actual ownership:

| Entity | `userId` Present? | Required / Optional / Absent | Writers Populating `userId` | Writers Omitting `userId` | Ownership Model |
|---|---|---|---|---|---|
| `User` | `id` is User ID | Primary Key | `database.ts` (`id: 'default_user'`) | N/A | Global User Profile |
| `Settings` | Yes | **Required** | `database.ts` (`userId: 'default_user'`) | None | User Preferences |
| `Subject` | Yes | Optional (`userId?`) | `database.ts`, `useAppStore.ts` (`addSubject`) | None | User-Owned Subject |
| `Topic` | **NO** | **Absent** | N/A | N/A | **Subject-Associated** (`subjectId`) |
| `Task` | Yes | Optional (`userId?`) | `database.ts`, `useAppStore.ts` (`addTask`) | None | User / Subject Task |
| `Note` | Yes | Optional (`userId?`) | `database.ts`, `useAppStore.ts` (`addNote`) | None | User / Subject Note |
| `Flashcard` | Yes | Optional (`userId?`) | `database.ts` | None | User / Subject Flashcard |
| `Session` | Yes | Optional (`userId?`) | `database.ts`, `useAppStore.ts` (`logFocusSession`) | None | User Focus Session |
| `Goal` | Yes | Optional (`userId?`) | `database.ts` | None | User / Subject Goal |
| `AIConversation` | Yes | Optional (`userId?`) | None in current code! | `orchestrator.ts`, `AIAssistantView.tsx` | User / Subject / Task AI Record |
| `Statistic` | Yes | Optional (`userId?`) | `database.ts` | None | User Metric |
| `AchievementDefinition` | **NO** | **Absent** | N/A | N/A | **Global Reference Data** (Unscoped) |
| `UserAchievement` | Yes | Optional (`userId?`) | `database.ts` | None | User Achievement Progress |
| `NotificationItem` | Yes | Optional (`userId?`) | `database.ts` | None | User Notification |

---

## 5. Authoritative AI Persistence Record & Single Writer Contract

### Current Production Defect Analysis
1. **Duplicate Writers**: Both `aiOrchestrator.send()` (`orchestrator.ts` line 217) and `AIAssistantView.tsx` (line 221 -> `onAddAIMessage`) persist completed interactions, creating two database records per query.
2. **Field Misplacement**: `orchestrator.ts` line 224 currently puts `prepared.profileConfig.id` (e.g. `'profile_local'`) into `subjectId`! It omits `providerId`, `providerName`, `modelId`, `userId`, `taskId`, and `generationStatus`.

### Proposed Phase 1 AI Record Construction (WP-07)
The single authoritative writer `aiOrchestrator.send()` will construct `AIConversation` records matching the exact `AIConversation` interface in `src/types/index.ts`:

```ts
// Proposed Phase 1 Record Construction in aiOrchestrator.send()
const aiRecord: AIConversation = {
  id: prepared.requestId,                                    // Required: Deterministic Request ID
  userId: 'default_user',                                   // Proposed: Explicit User Scope
  subjectId: prepared.subjectId || null,                    // Fixed: Real Subject ID (not profile.id!)
  taskId: prepared.taskId || null,                          // Proposed: Task ID Context
  mode: prepared.preview.mode as any,                       // Required: Mode Enum
  prompt: lastUserMsg,                                      // Required: User Prompt
  response: finalContent,                                   // Required: Assistant Response Content
  explanation: finalReasoning ? {                           // Optional: Reasoning Panel Data
    confidence: 0.9,
    factors: [finalReasoning]
  } : undefined,
  timestamp: Date.now(),                                    // Required: Timestamp
  providerId: prepared.profileConfig.id,                    // Fixed: Real Provider ID
  providerName: prepared.profileConfig.name,                // Fixed: Provider Display Name
  modelId: prepared.profileConfig.modelId,                  // Fixed: Model Name
  generationStatus: status,                                 // Fixed: 'complete' | 'stopped' | 'failed'
};
```

*Note: No error property exists in `AIConversation`. Sanitized error messages stay in transient UI and redacted log diagnostics. Zero database schema modifications permitted.*

---

## 6. Flow Specifications for Every AI Outcome

### 6.1 Completed Request
- Exactly 1 record written by `aiOrchestrator.send()` with `generationStatus: 'complete'`.
- `AIAssistantView.tsx` does **not** call `onAddAIMessage()`.
- Dexie live query `useLiveQuery(() => db.ai_conversations.orderBy('timestamp').toArray())` reactively updates UI.

### 6.2 User-Stopped Request with Partial Output
- User cancels stream via `aiOrchestrator.cancel(requestId)`.
- `aiOrchestrator.send()` catches `AbortError`, flushes accumulated `finalContent` buffer, and writes 1 record with `generationStatus: 'stopped'`.

### 6.3 User-Stopped Request with Zero Output (0 Tokens Received)
- **Phase 1 Policy**: Do **not** persist an empty record to IndexedDB.
- Display transient UI toast "Generation Cancelled". The original user prompt remains in composer input.

### 6.4 Failed Request with Partial Output
- Transport error occurs mid-stream.
- `aiOrchestrator.send()` writes 1 record with accumulated partial text and `generationStatus: 'failed'`.
- Raw stack traces, API keys, or provider response headers are **never** persisted.

### 6.5 Failed Request with Zero Output (0 Tokens Received)
- **Phase 1 Policy**: Do **not** persist an empty record.
- Display transient, sanitized error banner in `AIAssistantView.tsx`. Retain redacted diagnostics in log file.

### 6.6 Reactive UI & State Synchronization
- In-progress text is held in React local state (`streamingText`, `streamingReasoning`).
- `AIAssistantView` renders live streaming display while `generationState === 'generating'`.
- Upon `aiOrchestrator.send()` completion, local streaming state clears (`streamingText = ''`).
- The newly written Dexie record flows through `useLiveQuery` into `aiChats`, replacing local streaming state without flickering or duplicate rendering.

---

## 7. Collision-Safe AI Record IDs

- ID Format: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` generated during `aiOrchestrator.prepare()`.
- Primary Key Insertion: Uses `db.ai_conversations.add(record)` (which throws on ID collision) rather than `db.ai_conversations.put()`.
- Collision Retry Interlock: If `add()` throws a key collision error, `aiOrchestrator` regenerates `prepared.requestId`, updates record `id`, and retries up to **3 times**.
- Exhaustion Policy: If 3 retries fail, `aiOrchestrator` aborts persistence, logs a redacted error, and surfaces response content in transient UI so user text is not lost.

---

## 8. Non-Destructive Historical Duplicate Reporting

Historical duplicate records in `ai_conversations` (from past dual-writer runs) must **never** be deleted automatically during startup or migration.

- **Diagnostic Utility**: `findDuplicateAIConversations()` (WP-07) performs non-destructive read scans.
- Matching Evidence: Same `prompt`, same `response`, same `subjectId`, and `timestamp` within 2,000ms.
- Reporting Policy: Surface counts in developer log diagnostics. **Zero automatic deletion, zero automatic merge, zero database mutation.**

---

## 9. `generationStatus` Compatibility Contract

Approved statuses: `'complete' | 'stopped' | 'failed'`.

- **Missing Status with Assistant Content**: Intercepted at read-time as `complete`. **Never rewritten to database during routine application startup.**
- **Missing Status with Prompt Only**: Preserved as legacy historical interaction. Surface non-destructive warning in developer logs; export unchanged.
- **Missing Status with No Content**: Structurally invalid. Preserved in IndexedDB, reported in V2 pre-export validation, and rejected if present in incoming V2 restore files.
- **Unknown Status Values**: Preserved in database; treated at read-time as unknown status; rejected if encountered in incoming V2 restore files.

---

## 10. Legacy Unversioned Eight-Table Export Specification

Legacy exports from `SettingsView.tsx` (`handleExportData()`) contain 8 tables (`users`, `settings`, `subjects`, `topics`, `tasks`, `notes`, `flashcards`, `sessions`) and `exportedAt`.

### Structural Recognition & Validation
- **Classification**: Classified as `legacy-v1` if valid JSON, missing V2 envelope header `"format": "aether-backup"`, and all 8 legacy table arrays exist. (Files are **not** required to contain `"version": 1`).
- **`exportedAt`**: Informational. If absent or invalid, import proceeds with a user warning.
- **Empty Table Arrays**: Valid (0 incoming items for that table). **Must never clear existing database table.**
- **Unknown Top-Level Keys**: Non-credential keys ignored with warning. Keys containing secret patterns (`key`, `token`, `secret`, `auth`) trigger **immediate rejection**.
- **Unknown Record Fields**: Tested against strict table allowlists. Extra fields stripped before persistence; secret-like fields reject import.
- **Atomic File Validation**: Any malformed record or duplicate primary key inside file causes **100% rejection** prior to any database mutation.

---

## 11. Complete Version 2 Backup Envelope Specification

```ts
export interface AetherBackupV2 {
  format: 'aether-backup';
  version: 2;
  schemaVersion: 3;
  applicationVersion?: string;
  exportedAt: string; // ISO 8601 string
  recordCounts: {
    users: number;
    settings: number;
    subjects: number;
    topics: number;
    tasks: number;
    notes: number;
    flashcards: number;
    sessions: number;
    goals: number;
    ai_conversations: number;
    statistics: number;
    achievement_definitions: number;
    user_achievements: number;
    notifications: number;
  };
  data: {
    users: User[];
    settings: Settings[];
    subjects: Subject[];
    topics: Topic[];
    tasks: Task[];
    notes: Note[];
    flashcards: Flashcard[];
    sessions: Session[];
    goals: Goal[];
    ai_conversations: AIConversation[];
    statistics: Statistic[];
    achievement_definitions: AchievementDefinition[];
    user_achievements: UserAchievement[];
    notifications: NotificationItem[];
  };
}
```

### Format & Secret Enforcement
- **Validation**: `format === 'aether-backup'`, `version === 2`, `schemaVersion === 3`. Unsupported versions are rejected prior to destructive work.
- **Counts Interlock**: Every `recordCounts[table]` must exactly equal `data[table].length`.
- **Secret Scan**: Rejects backup if any field matches API key patterns (`sk-`, `nvapi-`), Bearer tokens, or OS credential store values. Non-secret settings (`settings.theme`, `settings.aiProvider`) are included.

---

## 12. Complete Relationship Validation Matrix

| Child Table | Foreign Key Field | Parent Table | Parent Key | Required / Optional | Supported Missing Representation | V2 Replace Policy | Legacy Partial Merge Policy |
|---|---|---|---|---|---|---|---|
| `Topic` | `subjectId` | `subjects` | `id` | **Required** | None (Must exist) | Reject V2 file if parent missing in file | Reject import if parent missing in file AND DB |
| `Task` | `subjectId` | `subjects` | `id` | Optional | `undefined` / `null` | Unassign subject reference | Unassign subject reference |
| `Note` | `subjectId` | `subjects` | `id` | **Required** | None (Must exist) | Reject V2 file if parent missing in file | Reject import if parent missing in file AND DB |
| `Note` | `topicId` | `topics` | `id` | Optional | `undefined` / `null` | Unassign topic reference | Unassign topic reference |
| `Flashcard` | `subjectId` | `subjects` | `id` | **Required** | None (Must exist) | Reject V2 file if parent missing in file | Reject import if parent missing in file AND DB |
| `Flashcard` | `topicId` | `topics` | `id` | Optional | `undefined` / `null` | Unassign topic reference | Unassign topic reference |
| `Session` | `subjectId` | `subjects` | `id` | Optional | `undefined` / `null` | Unassign subject reference | Unassign subject reference |
| `Session` | `taskId` | `tasks` | `id` | Optional | `undefined` / `null` | Unassign task reference | Unassign task reference |
| `Goal` | `subjectId` | `subjects` | `id` | Optional | `undefined` / `null` | Unassign subject reference | Unassign subject reference |
| `AIConversation` | `subjectId` | `subjects` | `id` | Optional | `undefined` / `null` | Unassign subject reference | Unassign subject reference |
| `AIConversation` | `taskId` | `tasks` | `id` | Optional | `undefined` / `null` | Unassign task reference | Unassign task reference |
| `NotificationItem` | `relatedTaskId` | `tasks` | `id` | Optional | `undefined` / `null` | Unassign task reference | Unassign task reference |
| `NotificationItem` | `relatedSubjectId` | `subjects` | `id` | Optional | `undefined` / `null` | Unassign subject reference | Unassign subject reference |
| `UserAchievement` | `achievementId` | `achievement_definitions` | `id` | **Required** | None (Must exist) | Reject V2 file if definition unsupported | Reject import if definition unsupported |

---

## 13. Achievement Definition Authority Contract

- **Canonical Authority**: `achievement_definitions` are global application reference data, seeded in `src/db/database.ts` lines 460–470.
- **V2 Export**: Includes installed `achievement_definitions` array for diagnostic verification.
- **V2 Replace Restore**:
  - Validates incoming `achievement_definitions` against installed application canonical set.
  - Repopulates `achievement_definitions` using the canonical installed definition set.
  - Rejects backup if `user_achievements` reference unsupported achievement IDs. **Zero silent deletion of user achievements.**
- **Empty Workspace**: A clean empty workspace retains canonical achievement definitions (count > 0).

---

## 14. Pre-Restore Safety Backup Runtime Specifications

A Version 2 Replace Restore requires generating and validating a complete V2 safety backup before destructive database clearing begins.

### 14.1 Electron Desktop Environment
- Uses native safe file-write workflow.
- Success verification requires: File path selected -> write completes -> file handle closed -> readback validation confirms valid V2 envelope & matching counts.
- Failure / Cancel: If user cancels dialog or file write fails, restore aborts immediately. 0 database clearing.

### 14.2 Web Browser Environment
- Browser JavaScript cannot verify disk persistence after initiating a `Blob` download.
- **Phase 1 Browser Contract**: Generate and validate V2 safety backup Blob -> trigger browser download (`Aether_PreRestore_SafetyBackup_<ISO>.json`) -> display modal requiring explicit user confirmation ("I have saved my safety backup") -> proceed with restore only upon user confirmation.

---

## 15. Transaction Scope, Execution & Ordering

Restore executes under a single 14-table Dexie read-write transaction:

```ts
// Transaction Boundary in backupService.ts
await db.transaction('rw', [
  db.achievement_definitions, db.users, db.settings, db.subjects,
  db.ai_conversations, db.statistics, db.goals, db.topics,
  db.tasks, db.notes, db.flashcards, db.sessions,
  db.notifications, db.user_achievements
], async () => {
  // 1. Deterministic Clear Order
  await db.user_achievements.clear();
  await db.notifications.clear();
  await db.sessions.clear();
  await db.flashcards.clear();
  await db.notes.clear();
  await db.tasks.clear();
  await db.topics.clear();
  await db.goals.clear();
  await db.statistics.clear();
  await db.ai_conversations.clear();
  await db.subjects.clear();
  await db.settings.clear();
  await db.users.clear();
  await db.achievement_definitions.clear();

  // 2. Deterministic Insertion Order
  await db.achievement_definitions.bulkAdd(canonicalDefinitions);
  await db.users.bulkAdd(data.users);
  await db.settings.bulkAdd(data.settings);
  await db.subjects.bulkAdd(data.subjects);
  await db.ai_conversations.bulkAdd(data.ai_conversations);
  await db.statistics.bulkAdd(data.statistics);
  await db.goals.bulkAdd(data.goals);
  await db.topics.bulkAdd(data.topics);
  await db.tasks.bulkAdd(data.tasks);
  await db.notes.bulkAdd(data.notes);
  await db.flashcards.bulkAdd(data.flashcards);
  await db.sessions.bulkAdd(data.sessions);
  await db.notifications.bulkAdd(data.notifications);
  await db.user_achievements.bulkAdd(data.user_achievements);
});
```

- **Outside Transaction**: File parsing, JSON validation, schema verification, safety backup download, and user confirmation.
- **Inside Transaction**: Zero network calls, zero file downloads, zero DOM prompts. All-or-nothing rollback on any error.

---

## 16. Restore Teardown, Failure & Recovery Rules

1. **Pre-Transaction Failure / Cancel**: User cancels or safety backup fails -> 0 database modifications.
2. **In-Transaction Error**: Dexie rolls back all 14 tables automatically. Database reopens original uncorrupted state.
3. **Post-Commit Reopen Failure**: Transaction committed but database reopen throws -> application enters Recovery Required mode, presenting option to re-import safety backup.
4. **Post-Commit Integrity Failure**: Restored counts or required relations fail post-commit validation -> application flags verification error and offers safety backup restore.

---

## 17. Ten Ordered Work Packages

### WP-01 — Verified Persistence Inventory and Invariants
- **Scope**: Create test suite asserting exact reader/writer maps and ownership boundaries.
- **Files**: `src/db/__tests__/inventoryInvariants.test.ts` (new)
- **Commit**: `docs/tests: establish verified persistence invariants`

### WP-02 — Approved Persistence and Restore Contracts
- **Scope**: Finalize backup envelope types, relationship matrices, and AI single-writer contracts.
- **Files**: `src/types/backup.ts` (new)
- **Gate**: **CRITICAL REVIEW GATE**: No WP-03 or later implementation begins until an independent reviewer returns `PASS — READY FOR PHASE 1 IMPLEMENTATION` for WP-01 and WP-02 contracts.
- **Commit**: `docs: approve Phase 1 persistence and restore contracts`

### WP-03 — Real IndexedDB and Dexie Test Harness
- **Scope**: Build Vitest integration harness using `fake-indexeddb` for 14-table operations.
- **Files**: `src/db/__tests__/dexieHarness.test.ts` (new)
- **Commit**: `test: add real IndexedDB persistence harness`

### WP-04 — Backup Service Extraction and Version 2 Export
- **Scope**: Extract `SettingsView.tsx` export into `src/services/backupService.ts`, implementing V2 export.
- **Files**: `src/services/backupService.ts` (new), `src/views/SettingsView.tsx`
- **Commit**: `feat: add versioned complete backup service`

### WP-05 — Legacy Partial Import Implementation
- **Scope**: Implement `importLegacyBackup()` for 8-table non-destructive merge imports.
- **Files**: `src/services/backupService.ts`
- **Commit**: `feat: add legacy partial workspace import`

### WP-06 — Complete Version 2 Replace Restore Engine
- **Scope**: Implement mandatory pre-restore safety backup and 14-table transactional replace restore.
- **Files**: `src/services/backupService.ts`, `src/views/SettingsView.tsx`
- **Commit**: `feat: add transactional complete backup restore`

### WP-07 — AI Persistence Ownership and Status Hardening
- **Scope**: Enforce `aiOrchestrator.send()` as single writer; fix `subjectId` field assignment; add duplicate scanner.
- **Files**: `src/views/AIAssistantView.tsx`, `src/services/ai/orchestrator.ts`
- **Commit**: `fix: harden AI interaction persistence`

### WP-08 — Referential Integrity and Recovery Hardening
- **Scope**: Implement relationship pre-validators and post-commit recovery verifiers.
- **Files**: `src/services/__tests__/restoreIntegrity.test.ts` (new)
- **Commit**: `test: verify restore integrity and recovery paths`

### WP-09 — Security and Performance Characterisation
- **Scope**: Add automated secret redaction audit on exports and performance benchmark metrics.
- **Files**: `src/services/__tests__/backupSecurityPerformance.test.ts` (new)
- **Commit**: `test: verify backup security and performance`

### WP-10 — Browser, Electron, Regression, and Closeout
- **Scope**: Run full Vitest suite, Web build, Electron build, and cross-platform round-trip tests.
- **Files**: Entire repository.
- **Commit**: `docs: close Phase 1 verification`

---

## 18. Final Architecture Self-Audit Matrix

| Review Blocker | Repository Evidence | Plan Section Resolving It | Decision Finalized? | Test Coverage Specified? |
|---|---|---|---|---|
| False methods (`getUserById`, etc.) | `src/api/*` code inspection | Section 3 | Yes | Yes (WP-01) |
| Missing CRUD inventory | `src/api/*` code inspection | Section 3 | Yes | Yes (WP-01) |
| Writer-specific `userId` | `src/types/index.ts`, `src/api/*` | Section 4 | Yes | Yes (WP-01) |
| AI subject/profile confusion | `orchestrator.ts` line 224 | Section 5 | Yes | Yes (WP-07) |
| AI metadata omissions | `orchestrator.ts` line 217 | Section 5 | Yes | Yes (WP-07) |
| AI collisions | `orchestrator.ts` `requestId` | Section 7 | Yes | Yes (WP-07) |
| Complete/stopped/failed flows | `AIAssistantView.tsx` & `orchestrator.ts` | Section 6 | Yes | Yes (WP-07) |
| Partial & zero-output handling | `AIAssistantView.tsx` state machine | Section 6 | Yes | Yes (WP-07) |
| Missing statuses | `AIConversation` interface | Section 9 | Yes | Yes (WP-07) |
| Unknown statuses | `AIConversation` interface | Section 9 | Yes | Yes (WP-07) |
| Legacy structural detection | `SettingsView.tsx` `handleExportData` | Section 10 | Yes | Yes (WP-05) |
| Legacy unknown fields | `SettingsView.tsx` export format | Section 10 | Yes | Yes (WP-05) |
| Version 2 timestamps | `src/types/index.ts` timestamp fields | Section 11 | Yes | Yes (WP-04) |
| Version & schema rejection | `AetherBackupV2` header spec | Section 11 | Yes | Yes (WP-04) |
| Missing/additional tables | V2 14-table envelope spec | Section 11 | Yes | Yes (WP-04) |
| Count corruption | `recordCounts` interlock spec | Section 11 | Yes | Yes (WP-04) |
| Unknown record fields | Table-specific allowlist policy | Section 10 & 11 | Yes | Yes (WP-04, WP-05) |
| Secret-looking fields | API key pattern scanner | Section 11 | Yes | Yes (WP-09) |
| V2 incoming-only relationships | Relationship matrix | Section 12 | Yes | Yes (WP-08) |
| Legacy incoming+current relationships | Relationship matrix | Section 12 | Yes | Yes (WP-08) |
| Optional-reference representations | Relationship matrix | Section 12 | Yes | Yes (WP-08) |
| Achievement authority | `database.ts` lines 460–470 | Section 13 | Yes | Yes (WP-06) |
| Safety success in Electron | File-write readback verification | Section 14 | Yes | Yes (WP-06) |
| Safety limitations in browser | User modal confirmation interlock | Section 14 | Yes | Yes (WP-06) |
| Restore ordering | Dependency-safe clear & insert sequence | Section 15 | Yes | Yes (WP-06) |
| Rollback | Dexie 14-table transaction scope | Section 15 | Yes | Yes (WP-06) |
| Post-commit reopen failure | Recovery-required workflow | Section 16 | Yes | Yes (WP-08) |
| Verification failure | Post-commit verification check | Section 16 | Yes | Yes (WP-08) |
| Restart recovery | DB state-driven recovery check | Section 16 | Yes | Yes (WP-08) |
| Browser round trips | Vitest + jsdom/fake-indexeddb | Section 17 | Yes | Yes (WP-10) |
| Electron round trips | Vitest + Electron IPC harness | Section 17 | Yes | Yes (WP-10) |
| WP-02 approval gate | Explicit WP-02 review gate requirement | Section 17 | Yes | Yes (WP-02) |

---

## 19. Definition of Done

Phase 1 will be complete when:
1. Readers/writers map 100% to production code.
2. Completed AI interactions create exactly 1 persisted record.
3. Legacy 8-table exports import cleanly without altering absent tables.
4. Version 2 complete backups export and replace-restore all 14 tables inside a Dexie transaction.
5. Mandatory pre-restore safety backup downloads/saves successfully before restore writes.
6. 0 API keys or credentials exist in exported backups.
7. `npm test`, `npm run build`, `npm run build:electron` pass with 0 failures.
8. Independent review returns `PASS — READY FOR PHASE 1 IMPLEMENTATION`.

---

## 20. Material Decisions Summary
- **Remaining Material Decisions**: None
