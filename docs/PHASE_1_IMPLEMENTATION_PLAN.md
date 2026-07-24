# Phase 1 Implementation Plan — Final Persistence Architecture Contract

## 1. Executive Summary & Repository Baseline

### Architectural Purpose & Scope
This document serves as the authoritative, repository-grounded Phase 1 Persistence Architecture Contract for Aether across Web and Windows Desktop environments. Every claim, reader, writer, data shape, relationship rule, transaction boundary, and test requirement in this document is verified directly against `src/db/database.ts`, `src/types/index.ts`, `src/api/*`, `src/store/useAppStore.ts`, `src/views/SettingsView.tsx`, `src/services/ai/orchestrator.ts`, `src/services/ai/types.ts`, and `package.json`.

### Confirmed Repository Baseline
- **Active Branch**: `main`
- **Current HEAD Commit**: `6625f45f86165583cf66c2f9997f7daff18aef62` (`docs: finalize Phase 1 persistence architecture`)
- **Divergence from `origin/main`**: Local `main` is 3 commits ahead (`0 left, 3 right`)
- **Local Planning Commits**: `d85e431`, `35e3e45`, `6625f45`
- **Annotated Tag**: `phase-0-baseline` (pointing to commit `4bac10a72bf20f569eca5d4fb599f7ba855a16cd`)
- **Working Tree State During This Contract Revision**: Only `docs/PHASE_1_IMPLEMENTATION_PLAN.md` is modified; no production, test, package, schema, migration, or generated file is changed.
- **Inherited Phase 0 Verification Gates**: `npm test` (31 test files, 168 tests passed), `npm run build` (0 errors), `npm run build:electron` (0 errors). These results apply to the unchanged production tree at `6625f45`; the documentation-only working-tree revision does not claim that they were re-run.

### Non-Negotiable Architecture Invariants
- **Database Identity**: IndexedDB database name is `AetherPhase1DB`, running on **Dexie Version 3** with **14 normalized tables** (Dexie npm package `^4.0.10` installed in `package.json`).
- **No Dexie Version 4 Schema Upgrade**: No schema migration is required or permitted during Phase 1. Dexie Version 3 already declares all 14 database tables in `src/db/database.ts`.
- **AI Conversation Persistence**: Retains flat `AIConversation` interaction records (**Strategy A**). No embedded `messages[]` aggregate schema modification.
- **Single AI Persistence Owner**: `AIOrchestrator` owns the only code path that calls `addAIConversation()`. Provider outcomes reach that path through `send()`; local-only/no-evidence outcomes reach it through an explicit orchestrator method. `AIAssistantView` never writes AI records directly and remains a reactive consumer driven by `useLiveQuery`.
- **Backup & Restore Strategy**:
  - **Version 2 Complete Backup**: **Replace Restore Only** for 14-table backups, guarded by mandatory pre-restore safety backups and a single 14-table Dexie transaction.
  - **Legacy Eight-Table Export**: **Partial Merge Import Only** for unversioned legacy Phase 0 exports. The 6 absent tables remain completely untouched.
- **Compatibility Statement**: Preserving the flat AI interaction model minimises schema-migration risk and retains the existing record representation. Backward compatibility remains an implementation objective that must be demonstrated through real IndexedDB integration tests and the complete Phase 0 regression suite.

---

## 2. Literal Repository Persistence Inventory (14 Tables)

The inventory below distinguishes seed/init writes from ordinary runtime Add operations, explicit API reads, reactive queries, and direct Dexie access across production code:

| Table | TypeScript Type | Primary Key | Indexes | Seed / Init Write | Ordinary Runtime Add | Runtime Put | Runtime Update | Runtime Delete | Runtime Clear | Direct DB Access Files | API Wrapper File & Methods | Reactive Query | Export Read | Missing Operations Inventory |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `users` | `User` | `id` (String) | `id, &email` | `database.ts` (l.213) | Not currently implemented | Not currently implemented | `userApi.ts` (`updateUser`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/userApi.ts` (`getUser`, `updateUser`) | `useAppStore.ts` (`db.users.get`) | `SettingsView.tsx` (`db.users.toArray()`) | `addUser`, `putUser`, `deleteUser`, `clearUsers` |
| `settings` | `Settings` | `id` (String) | `id, &userId` | `database.ts` (l.221) | Not currently implemented | Not currently implemented | `settingsApi.ts` (`updateSettings`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/settingsApi.ts` (`getSettings`, `updateSettings`) | `useAppStore.ts` (`db.settings.get`) | `SettingsView.tsx` (`db.settings.toArray()`) | `addSettings`, `putSettings`, `deleteSettings`, `clearSettings` |
| `subjects` | `Subject` | `id` (String) | `id, userId, name, confidenceRating` | `database.ts` (l.237) | `subjectApi.ts` (`addSubject`) | Not currently implemented | `subjectApi.ts` (`updateSubject`) | `subjectApi.ts` (`deleteSubject`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx` | `src/api/subjectApi.ts` (`getSubjects`, `addSubject`, `updateSubject`, `deleteSubject`, `checkSubjectReferences`, `validateSubjectName`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.subjects.toArray()`) | `putSubject`, `clearSubjects` |
| `topics` | `Topic` | `id` (String) | `id, subjectId, title, masteryLevel` | `database.ts` (l.285) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/topicApi.ts` (`getTopics`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.topics.toArray()`) | `addTopic`, `putTopic`, `updateTopic`, `deleteTopic`, `clearTopics` |
| `tasks` | `Task` | `id` (String) | `id, userId, subjectId, priority, status, dueDate` | `database.ts` (l.294) | `taskApi.ts` (`addTask`) | Not currently implemented | `taskApi.ts` (`updateTask`) | `taskApi.ts` (`deleteTask`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/taskApi.ts` (`getTasks`, `getTaskById`, `addTask`, `updateTask`, `deleteTask`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.tasks.toArray()`) | `putTask`, `clearTasks` |
| `notes` | `Note` | `id` (String) | `id, userId, subjectId, topicId, title, updatedAt` | `database.ts` (l.339) | `noteApi.ts` (`addNote`) | Not currently implemented | `noteApi.ts` (`updateNote`) | `noteApi.ts` (`deleteNote`) | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/noteApi.ts` (`getNotes`, `addNote`, `updateNote`, `deleteNote`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.notes.toArray()`) | `putNote`, `clearNotes` |
| `flashcards` | `Flashcard` | `id` (String) | `id, userId, subjectId, topicId, nextReviewDate` | V3 migration `userId` backfill in `database.ts` | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/flashcardApi.ts` (`getFlashcards`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.flashcards.toArray()`) | `addFlashcard`, `putFlashcard`, `updateFlashcard`, `deleteFlashcard`, `clearFlashcards` |
| `sessions` | `Session` | `id` (String) | `id, userId, subjectId, taskId, completedAt` | `database.ts` (l.393) | `sessionApi.ts` (`addSession`) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts`, `SettingsView.tsx`, `subjectApi.ts` | `src/api/sessionApi.ts` (`getSessions`, `addSession`) | `useAppStore.ts` (`useLiveQuery`) | `SettingsView.tsx` (`db.sessions.toArray()`) | `putSession`, `updateSession`, `deleteSession`, `clearSessions` |
| `goals` | `Goal` | `id` (String) | `id, userId, subjectId, status` | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts`, `subjectApi.ts` | `src/api/goalApi.ts` (`getGoals`) | None | None | `addGoal`, `putGoal`, `updateGoal`, `deleteGoal`, `clearGoals` |
| `ai_conversations` | `AIConversation` | `id` (String) | `id, userId, subjectId, mode, timestamp` | V3 migration and initial seed in `database.ts` | `orchestrator.ts` -> `addAIConversation`; `AIAssistantView.tsx` -> `onAddAIMessage` -> `useAppStore.ts` -> `addAIConversation` (duplicate path) | Not currently implemented | Not currently implemented | Not currently implemented | `aiConversationApi.ts` (`clearAIConversations`) | `database.ts`, `useAppStore.ts`, `subjectApi.ts` | `src/api/aiConversationApi.ts` (`getAIConversations`, `addAIConversation`, `clearAIConversations`) | `useAppStore.ts` (`useLiveQuery`) | None | `putAIConversation`, `updateAIConversation`, `deleteAIConversation` |
| `statistics` | `Statistic` | `id` (String) | `id, userId, [userId+metricKey+periodStart]` | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/statisticApi.ts` (`getStatistics`) | None | None | `addStatistic`, `putStatistic`, `updateStatistic`, `deleteStatistic`, `clearStatistics` |
| `achievement_definitions` | `AchievementDefinition` | `id` (String) | `id, &key` | `database.ts` (l.460) | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/achievementApi.ts` (`getAchievementDefinitions`) | None | None | `addAchievementDefinition`, `putAchievementDefinition`, `updateAchievementDefinition`, `deleteAchievementDefinition`, `clearAchievementDefinitions` |
| `user_achievements` | `UserAchievement` | `id` (String) | `id, userId, [userId+achievementId]` | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | Not currently implemented | `database.ts` | `src/api/achievementApi.ts` (`getUserAchievements`) | None | None | `addUserAchievement`, `putUserAchievement`, `updateUserAchievement`, `deleteUserAchievement`, `clearUserAchievements` |
| `notifications` | `NotificationItem` | `id` (String) | `id, userId, type, createdAt` | `database.ts` (l.435) | Not currently implemented | Not currently implemented | `notificationApi.ts` (`markNotificationAsRead`, `markAllNotificationsAsRead`) | Not currently implemented | Not currently implemented | `database.ts`, `useAppStore.ts` | `src/api/notificationApi.ts` (`getNotifications`, `markNotificationAsRead`, `markAllNotificationsAsRead`) | `useAppStore.ts` (`useLiveQuery`) | None | `addNotification`, `putNotification`, `deleteNotification`, `clearNotifications` |

*Note: The "Missing Operations Inventory" column explicitly lists missing API methods. This list is descriptive only and does NOT authorize creating missing API methods during Phase 1.*

---

## 3. Entity Ownership & `userId` Matrix

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
| `Goal` | Yes | Optional (`userId?`) | None; no current record writer | N/A | User / Subject Goal |
| `AIConversation` | Yes | Optional (`userId?`) | `database.ts` migration/seed, `useAppStore.ts` (`addAIMessage`, invoked by `AIAssistantView`) | `orchestrator.ts` runtime writer | User / Subject / Task AI Record |
| `Statistic` | Yes | Optional (`userId?`) | None; no current record writer | N/A | User Metric |
| `AchievementDefinition` | **NO** | **Absent** | N/A | N/A | **Global Reference Data** (Unscoped) |
| `UserAchievement` | Yes | Optional (`userId?`) | None; no current record writer | N/A | User Achievement Progress |
| `NotificationItem` | Yes | Optional (`userId?`) | `database.ts` | None | User Notification |

---

## 4. Implementable AI Context Propagation & Record Contract

### 4.1 Context Propagation Analysis
In `src/services/ai/types.ts`:
- `PrepareAIInput` contains `subjectId?: string | null` and `taskId?: string | null`.
- `PreparedAIRequest` contains `type`, `requestId`, `normalizedRequest`, `profileConfig`, `preview`, `requiresConfirmation`.
- **Phase 1 Update (WP-07)**:
  - `PrepareAIInput` gains `userId: string`; the view supplies `userProfile.id`, falling back to the existing `default_user` only when the current production bootstrap has not yet exposed a profile.
  - `PreparedAIRequest` gains `userId: string`, `subjectId?: string | null`, and `taskId?: string | null`, copied without reinterpretation from `PrepareAIInput` during `aiOrchestrator.prepare()`.
  - `LocalOnlyResult` carries the same user/subject/task context plus the original `prompt` and `mode`, so a local-only outcome can use the same orchestrator-owned persistence helper without returning persistence ownership to the view.

### 4.2 Explicit Sources and Meanings for Metadata Fields
When `aiOrchestrator.send()` constructs the authoritative `AIConversation` record:
1. `id`: `prepared.requestId` (Deterministic string generated in `prepare()`).
2. `subjectId`: `prepared.subjectId ?? null` (Real study subject context from UI request, never `profileConfig.id`).
3. `taskId`: `prepared.taskId ?? null` (Real active task context from UI request).
4. `userId`: `prepared.userId` (Active application user propagated from `userProfile.id`; no provider-derived or hardcoded identity is written).
5. `providerType`: `prepared.profileConfig.type`, whose production union is `'local' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'lmstudio' | 'openai_compatible' | 'nvidia_nim'`. It controls dispatch and validation but is **not persisted**, because `AIConversation` has no `providerType` field.
6. `providerId`: `prepared.profileConfig.id` (Provider profile ID: `'profile_local'`, `'profile_nvidia'`). Written to `AIConversation.providerId`.
7. `providerName`: `prepared.profileConfig.name` (Display label: `'Local Offline Synthesizer'`, `'NVIDIA NIM'`). Written to `AIConversation.providerName`.
8. `modelId`: `prepared.profileConfig.modelId` (Model string: `'meta/llama-3.1-70b-instruct'`). Written to `AIConversation.modelId`.

### 4.3 Database Schema & Compatibility
- `userId`, `subjectId`, `taskId`, `providerId`, `providerName`, `modelId`, and `generationStatus` already exist as optional properties on `AIConversation` in `src/types/index.ts`. No new persisted AI field is proposed.
- IndexedDB stores raw JS objects without requiring column schema alterations for optional properties. Therefore, **no Dexie Version 4 migration is required**, and legacy records missing these optional fields remain 100% readable and compatible.
- `AIConversation` has no error field. Failed records persist only `generationStatus: 'failed'` and non-empty partial response content. Sanitized messages remain transient; raw errors, headers, credentials, stack traces, and provider payloads are never persisted or exported.

---

## 5. Flow Specifications for Every AI Outcome

### 5.1 Completed Request
- Exactly 1 record written by `aiOrchestrator.send()` with `generationStatus: 'complete'`.
- `AIAssistantView.tsx` line 221 does **not** call `onAddAIMessage()`.
- Dexie live query `useLiveQuery(() => db.ai_conversations.orderBy('timestamp').toArray())` reactively updates UI.

### 5.2 User-Stopped Request with Partial Output
- User cancels stream via `aiOrchestrator.cancel(requestId)`.
- `aiOrchestrator.send()` catches `AbortError`, flushes accumulated `finalContent` buffer, and writes 1 record with `generationStatus: 'stopped'`.

### 5.3 User-Stopped Request with Zero Output (0 Tokens Received)
- **Phase 1 Policy**: Do **not** persist an empty record to IndexedDB.
- Display transient UI toast "Generation Cancelled". The original user prompt remains in composer input.

### 5.4 Failed Request with Partial Output
- Transport error occurs mid-stream.
- `aiOrchestrator.send()` writes 1 record with accumulated partial text and `generationStatus: 'failed'`.
- Raw stack traces, API keys, or provider response headers are **never** persisted.

### 5.5 Failed Request with Zero Output (0 Tokens Received)
- **Phase 1 Policy**: Do **not** persist an empty record.
- Display transient, sanitized error banner in `AIAssistantView.tsx`. Retain redacted diagnostics in log file.

### 5.6 Reactive UI & State Synchronization
- In-progress text is held in React local state (`streamingText`, `streamingReasoning`).
- `AIAssistantView` renders live streaming display while `generationState === 'generating'`.
- Upon `aiOrchestrator.send()` completion, local streaming state clears (`streamingText = ''`).
- The newly written Dexie record flows through `useLiveQuery` into `aiChats`, replacing local streaming state without flickering or duplicate rendering.

### 5.7 Local-Only and No-Evidence Outcomes
- `AIAssistantView` does not call `onAddAIMessage()` for `LocalOnlyResult`.
- A local-only result with user-visible non-empty content is passed to `aiOrchestrator.persistLocalOnlyResult()`, which delegates to the same private collision-safe `persistConversation()` helper used by `send()` and writes exactly one `complete` record.
- The record uses the propagated user/subject/task context. A deterministic local-search/no-evidence result that invoked no provider omits `providerId`, `providerName`, and `modelId`; a response actually generated by the configured local provider goes through `send()` and records that local profile normally. No record presents retrieval-only output as a hosted-provider response.
- A no-evidence result follows the same one-record policy when shown as a durable answer. Cancellation or an empty result remains transient and creates no empty record.
- The private persistence helper is the only caller of `addAIConversation()`; reactive refresh performs no write.

---

## 6. Collision-Safe AI Record IDs & Non-Destructive Duplicate Scanner

- **ID Generation**: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` generated during `aiOrchestrator.prepare()`.
- **Primary Key Insertion**: Uses `db.ai_conversations.add(record)` (which throws on ID collision) rather than `db.ai_conversations.put()`.
- **Collision Retry Interlock**: If `add()` throws a key collision error, `aiOrchestrator` regenerates `prepared.requestId`, updates record `id`, and retries up to **3 times**.
- **Exhaustion Policy**: If 3 retries fail, `aiOrchestrator` aborts persistence, logs a redacted error, and surfaces response content in transient UI so user text is not lost.
- **Historical Duplicate Reporting**: `findDuplicateAIConversations()` (WP-07) performs non-destructive read scans matching same `prompt`, same `response`, and `timestamp` within 2,000ms. **Zero automatic deletion, zero automatic merge, zero database mutation.**

---

## 7. `generationStatus` Compatibility Contract

Approved statuses: `'complete' | 'stopped' | 'failed'`.

- **Missing Status with Assistant Content**: Intercepted at read-time as `complete`. **Never rewritten to database during routine application startup.**
- **Missing Status with Prompt Only**: Preserved as legacy historical interaction. Surface non-destructive warning in developer logs; export unchanged.
- **Missing Status with No Content**: Structurally invalid. Preserved in IndexedDB, reported in V2 pre-export validation, and rejected if present in incoming V2 restore files.
- **Unknown Status Values**: Preserved in database; treated at read-time as unknown status; rejected if encountered in incoming V2 restore files.

---

## 8. Legacy Unversioned Eight-Table Export Specification

Legacy exports from `SettingsView.tsx` (`handleExportData()`) contain 8 tables (`users`, `settings`, `subjects`, `topics`, `tasks`, `notes`, `flashcards`, `sessions`) and `exportedAt`.

### Validation & Merge Semantics
- **Classification**: Classified as `legacy-v1` if valid JSON, missing V2 envelope header `"format": "aether-backup"`, and all 8 legacy table arrays exist. (Files are **not** required to contain `"version": 1`).
- **`exportedAt`**: Informational. If absent or invalid, import proceeds with a user warning.
- **Empty Table Arrays**: Valid (0 incoming items for that table). **Must never clear existing database table.**
- **6 Omitted Tables**: `goals`, `ai_conversations`, `statistics`, `achievement_definitions`, `user_achievements`, `notifications` remain completely unmodified.
- **Merge Precedence**: Matching primary key (`id`) replaces existing database record after validation. Non-matching key is inserted. Existing records absent from file remain unchanged.
- **Unknown Top-Level / Record Fields**: Extra benign fields stripped before persistence; keys matching secret patterns (`key`, `token`, `secret`, `auth`) trigger **immediate rejection**.
- **Atomic File Validation**: Any malformed record or duplicate primary key inside file causes **100% rejection** prior to any database mutation.
- **Atomic Merge Execution**: After complete validation, the eight incoming arrays are applied with `put()`/`bulkPut()` inside one Dexie read-write transaction scoped only to `users`, `settings`, `subjects`, `topics`, `tasks`, `notes`, `flashcards`, and `sessions`. No table is cleared. Any write failure rolls back all eight incoming-table changes, and the six omitted tables are neither scoped nor touched.

---

## 9. Complete Version 2 Backup Envelope Specification

```ts
export interface AetherBackupV2 {
  format: 'aether-backup';
  version: 2;
  schemaVersion: 3;
  applicationVersion: string;
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

### Format, Timestamps & Secret Policy
- **Validation**: `format === 'aether-backup'`, `version === 2`, `schemaVersion === 3`. The top level, `recordCounts`, and `data` must each contain exactly their declared keys; missing or additional table/count keys trigger immediate rejection.
- **Application Version**: The exporter always writes the non-empty application version from `package.json`. A different application version produces a compatibility warning but does not override the format/schema decision: only exactly Version 2 / schema Version 3 is accepted.
- **Envelope Timestamp**: `exportedAt` is a valid ISO 8601 string that round-trips through `Date.parse`; entity timestamps are never converted to ISO text.
- **Entity Timestamp Matrix**:
  - `users`: `createdAt`, `updatedAt` — finite epoch-millisecond numbers.
  - `settings`: `updatedAt` — finite epoch-millisecond number.
  - `subjects`: `createdAt` — finite epoch-millisecond number.
  - `topics`: `lastReviewedAt` optional — finite epoch-millisecond number.
  - `tasks`: `createdAt` required; `dueDate` and `completedAt` optional — finite epoch-millisecond numbers.
  - `notes`: `updatedAt` — finite epoch-millisecond number.
  - `flashcards`: `nextReviewDate` — finite epoch-millisecond number.
  - `sessions`: `completedAt` — finite epoch-millisecond number.
  - `goals`: `createdAt` required; `deadline` and `completedAt` optional and may be `null` — otherwise finite epoch-millisecond numbers.
  - `ai_conversations`: `timestamp` — finite epoch-millisecond number.
  - `statistics`: `periodStart`, `periodEnd`, `computedAt` — finite epoch-millisecond numbers, with `periodEnd >= periodStart`.
  - `achievement_definitions`: no timestamp field.
  - `user_achievements`: `unlockedAt` optional and may be `null` — otherwise a finite epoch-millisecond number.
  - `notifications`: `createdAt` — finite epoch-millisecond number.
- **Counts Interlock**: Every `recordCounts[table]` must exactly equal `data[table].length`.
- **Secret Scan**: Table allowlists exclude credential/profile-secret fields. A recursive value/name scanner rejects API-key patterns (`sk-`, `nvapi-`), Bearer tokens, and secret-like keys such as `apiKey`, `authorization`, `token`, or `secret`. Export validation never reads or decrypts the Electron/server credential stores merely to compare secrets. Non-secret settings (`settings.theme`, `settings.aiProvider`) are included.
- **Strict Unknown Field Policy**: Validators maintain an explicit allowlist for every table from `src/types/index.ts`. Any unknown top-level key, count key, table, or record property causes 100% rejection. Optional properties may be absent but unvalidated fields never reach IndexedDB.
- **Primary Keys**: Every record must have a non-empty string `id`; duplicate primary keys within any incoming table reject the complete file.
- **Empty Workspace**: Empty arrays and zero counts are valid for every workspace table. `achievement_definitions` follows Section 11: an empty diagnostic array is accepted, but restore still installs the canonical definition set.
- **Validation Stages**:
  1. **Pre-export**: Read all 14 tables, validate record shapes, IDs, timestamps, statuses, relationships, and secrets before offering a file. Invalid current data blocks export with redacted diagnostics and no database mutation.
  2. **Post-export**: Serialize, parse the produced JSON again, run the complete V2 validator, verify all counts, and only then save/download it.
  3. **Pre-restore**: Parse and validate the complete incoming file—including all relationships—before creating the safety backup and before opening the destructive transaction.

---

## 10. Complete Table-Specific Relationship Validation Matrix

An optional relationship may be absent, but a non-empty referenced ID may never dangle. Restore/import preserves the incoming absence representation and never silently converts an invalid ID to `null` or `undefined`.

| Child / Field | Parent | Required / Exact Absence | Current Writer Behavior | V2 Replace Policy | Legacy Partial Merge Policy |
|---|---|---|---|---|---|
| `Settings.userId` | `users.id` | Required; no absence | Bootstrap writes `default_user` | Referenced user must exist in incoming `users` | Parent may exist incoming or current |
| `Subject.userId` | `users.id` | Optional; omitted/`undefined` | Seed and store add write active user | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Topic.subjectId` | `subjects.id` | Required; no absence | Seed writes subject ID | Parent must exist incoming | Parent may exist incoming or current |
| `Task.userId` | `users.id` | Optional; omitted/`undefined` | Seed and store add write active user | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Task.subjectId` | `subjects.id` | Optional; omitted/`undefined` | Seed/store normally write selected subject | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Note.userId` | `users.id` | Optional; omitted/`undefined` | Seed and store add write active user | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Note.subjectId` | `subjects.id` | Required; no absence | Seed/store write selected subject | Parent must exist incoming | Parent may exist incoming or current |
| `Note.topicId` | `topics.id` | Optional; omitted/`undefined` | Seed may write topic; store may omit | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Flashcard.userId` | `users.id` | Optional; omitted/`undefined` | Seed writes active user | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Flashcard.subjectId` | `subjects.id` | Required; no absence | Seed writes subject ID | Parent must exist incoming | Parent may exist incoming or current |
| `Flashcard.topicId` | `topics.id` | Optional; omitted/`undefined` | Seed may write topic | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Session.userId` | `users.id` | Optional; omitted/`undefined` | Seed/store logging writes active user | If present, parent must exist incoming | If present, parent may exist incoming or current |
| `Session.subjectId` | `subjects.id` | Optional; omitted/`undefined`/`null` | Logging may write selected ID or `null` | If string, parent must exist incoming | If string, parent may exist incoming or current |
| `Session.taskId` | `tasks.id` | Optional; omitted/`undefined`/`null` | Logging may write selected ID or `null` | If string, parent must exist incoming | If string, parent may exist incoming or current |
| `Goal.userId` | `users.id` | Optional; omitted/`undefined` | Current seed writes active user | If present, parent must exist incoming | V1 omits table; unchanged |
| `Goal.subjectId` | `subjects.id` | Optional; omitted/`undefined`/`null` | Current seed writes subject or omits | If string, parent must exist incoming | V1 omits table; unchanged |
| `AIConversation.userId` | `users.id` | Optional for legacy; proposed writer always supplies string | Current writers omit; WP-07 propagates active user | If present, parent must exist incoming | V1 omits table; unchanged |
| `AIConversation.subjectId` | `subjects.id` | Optional; omitted/`undefined`/`null` | Current orchestrator is defective; WP-07 writes real context | If string, parent must exist incoming | V1 omits table; unchanged |
| `AIConversation.taskId` | `tasks.id` | Optional; omitted/`undefined`/`null` | Current writers omit; WP-07 writes real context | If string, parent must exist incoming | V1 omits table; unchanged |
| `Statistic.userId` | `users.id` | Optional; omitted/`undefined` | Current seed writes active user | If present, parent must exist incoming | V1 omits table; unchanged |
| `UserAchievement.userId` | `users.id` | Optional; omitted/`undefined` | Current seed writes active user | If present, parent must exist incoming | V1 omits table; unchanged |
| `UserAchievement.achievementId` | `achievement_definitions.id` | Required; no absence | Current seed references canonical ID | Must reference installed canonical definition | V1 omits table; unchanged |
| `NotificationItem.userId` | `users.id` | Optional; omitted/`undefined` | Current seed writes active user | If present, parent must exist incoming | V1 omits table; unchanged |
| `NotificationItem.relatedTaskId` | `tasks.id` | Optional; omitted/`undefined` | Current seed may write task ID | If present, parent must exist incoming | V1 omits table; unchanged |
| `NotificationItem.relatedSubjectId` | `subjects.id` | Optional; omitted/`undefined` | Current seed may write subject ID | If present, parent must exist incoming | V1 omits table; unchanged |

`User.id` and `AchievementDefinition.id` are roots, while `Topic` and `AchievementDefinition` have no `userId`. Empty strings are invalid for every relationship. V2 validation uses incoming parents only; legacy validation uses the complete post-merge view of incoming plus current records.

Because JSON cannot encode `undefined`, an optional `string | undefined` field must be omitted in the serialized backup. The word `undefined` in the matrix describes the in-memory production type only. Fields whose production type explicitly includes `null` may serialize `null`, and restore preserves whether the JSON property was omitted or explicitly `null`.

---

## 11. Achievement Definition Authority Contract

- **Canonical Authority**: `achievement_definitions` are global application reference data. WP-06 extracts the four installed definitions from `src/db/database.ts` into one exported `CANONICAL_ACHIEVEMENT_DEFINITIONS` constant reused by seeding, validation, and restore; this is a behavior-preserving refactor, not a schema change.
- **V2 Backup & Restore Behavior**:
  - V2 Backup exports `achievement_definitions` array for diagnostic verification.
  - A compatible incoming definition has an installed canonical `id`, the same unique `key`, and identical `title`, `description`, `category`, `targetValue`, and `icon`. Duplicate IDs/keys, changed fields, and unsupported IDs/keys reject the entire restore.
  - A non-empty incoming array may be an exact canonical set or a compatible subset from an older installation. An empty array is accepted as an empty-workspace diagnostic case. Missing installed definitions are not treated as user data.
  - Repopulates `achievement_definitions` using installed canonical set.
  - If `user_achievements` reference an unsupported achievement ID, the restore is **rejected**. Zero silent progress deletion.
  - Incoming `recordCounts.achievement_definitions` is checked against the incoming diagnostic array. The separate expected post-restore count equals `CANONICAL_ACHIEVEMENT_DEFINITIONS.length`; every other table's expected post-restore count equals its incoming array length.
- **Empty Workspace**: A clean empty workspace retains canonical achievement definitions (count = installed canonical count > 0).
- **Startup Seeding**: Current production behavior is preserved: it inserts the complete canonical set only when `achievement_definitions.count() === 0`; repeated startup does not duplicate or overwrite definitions, and a partially populated table is not silently repaired. Restore itself always installs the complete canonical set. Tests cover empty, complete, and partial pre-existing tables.
- **Legacy Import**: Leaves both `achievement_definitions` and `user_achievements` completely unchanged.

---

## 12. Pre-Restore Safety Backup Runtime Specifications

All incoming V2 structure, record, timestamp, secret, ID, status, achievement, and relationship validation completes before the application creates a safety backup. A Version 2 Replace Restore then requires generating and validating a complete V2 safety backup before destructive database clearing begins.

### 12.1 Electron Desktop Environment
1. Triggers native `saveDialog` for user to select path.
2. Writes V2 safety backup JSON file.
3. Closes file handle.
4. Verifies file existence on disk.
5. Performs readback validation: parses file, confirms V2 envelope format, matches record counts, and completes 0-secret scan.
6. Failure / Cancel: If user cancels dialog or write/readback validation fails, restore aborts immediately. 0 database clearing.

### 12.2 Web Browser Environment
1. Generates V2 safety backup `Blob`.
2. Validates Blob format, record counts, and secret scan.
3. Triggers browser file download (`Aether_PreRestore_SafetyBackup_<ISO>.json`).
4. Displays modal prompt requiring explicit user confirmation ("I have saved my safety backup").
5. Decline / Cancel: If user declines confirmation, restore aborts immediately. 0 database clearing.

---

## 13. Transaction Scope, Execution & Ordering

Restore executes under a single 14-table Dexie read-write transaction:

```ts
// Explicit 14-Table Transaction Scope in backupService.ts
await db.transaction('rw', [
  db.user_achievements, db.notifications, db.sessions, db.flashcards,
  db.notes, db.tasks, db.topics, db.goals, db.statistics,
  db.ai_conversations, db.subjects, db.settings, db.users,
  db.achievement_definitions
], async () => {
  // 1. Child-First Clear Order
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

  // 2. Parent-First Insertion Order (Tasks before AIConversations!)
  await db.achievement_definitions.bulkAdd(canonicalDefinitions);
  await db.users.bulkAdd(data.users);
  await db.settings.bulkAdd(data.settings);
  await db.subjects.bulkAdd(data.subjects);
  await db.goals.bulkAdd(data.goals);
  await db.topics.bulkAdd(data.topics);
  await db.tasks.bulkAdd(data.tasks);             // Tasks inserted before AIConversations
  await db.ai_conversations.bulkAdd(data.ai_conversations); // AIConversations can reference tasks
  await db.statistics.bulkAdd(data.statistics);
  await db.notes.bulkAdd(data.notes);
  await db.flashcards.bulkAdd(data.flashcards);
  await db.sessions.bulkAdd(data.sessions);
  await db.notifications.bulkAdd(data.notifications);
  await db.user_achievements.bulkAdd(data.user_achievements);

  // 3. In-Transaction Count & Relationship Verification
  const expectedCounts = {
    users: data.users.length,
    settings: data.settings.length,
    subjects: data.subjects.length,
    topics: data.topics.length,
    tasks: data.tasks.length,
    notes: data.notes.length,
    flashcards: data.flashcards.length,
    sessions: data.sessions.length,
    goals: data.goals.length,
    ai_conversations: data.ai_conversations.length,
    statistics: data.statistics.length,
    achievement_definitions: canonicalDefinitions.length,
    user_achievements: data.user_achievements.length,
    notifications: data.notifications.length,
  };
  const actualCounts = await readAllTransactionCounts(db);
  if (!equalTableCounts(actualCounts, expectedCounts)) {
    throw new Error('Restore count verification failed.');
  }
  await assertAllRelationshipsWithinTransaction(db);
});
```

- **Outside Transaction**: File parsing, format detection, schema validation, safety backup download, and user prompts.
- **Inside Transaction**: `readAllTransactionCounts()` reads all 14 scoped tables and `assertAllRelationshipsWithinTransaction()` enforces every required/present optional relation in Section 10 using only transaction-bound Dexie reads. Zero network calls, file I/O, downloads, timers, or DOM prompts occur. Any count/relationship failure throws before callback completion and Dexie rolls back all 14 tables.

---

## 14. Post-Commit Failure & Recovery Workflow

### 14.1 Durable Verification Marker
Immediately before opening the restore transaction, the application writes a non-secret `aether.restoreVerification.v1` local-storage marker containing only:

- state (`transaction-started` or `verification-failed`);
- expected post-restore counts for all 14 tables;
- SHA-256 digest of the validated incoming backup;
- start timestamp and runtime (`browser` or `electron`).

The marker contains no records, prompt content, credentials, provider payloads, or filesystem path and requires no Dexie field or version bump. Failure to write/read back the marker aborts restore before the transaction with zero database mutation. It is cleared only after transaction commit, database reopen, all count/relationship checks, and application-store refresh succeed.

### 14.2 Failure and Restart Transitions
1. **Failure before commit**: Dexie rolls back. The marker remains, so the UI reports an interrupted restore rather than success. A read-only verification determines whether current contents match the incoming expected counts; no automatic retry or mutation occurs.
2. **Reopen, integrity, or pre-refresh failure after commit**: Update the marker to `verification-failed`; do not claim success. Render a persistent `Restore Verification Warning` with redacted diagnostics, "Retry Verification", and "Restore from Safety Backup".
3. **Store refresh**: After a verified reopen, stores reload from actual IndexedDB contents. If refresh fails, the marker remains and the success UI is withheld.
4. **Restart**: Startup checks the marker before normal application initialization, reopens `AetherPhase1DB`, compares all 14 counts with the marker, and reruns Section 10 relationships. Success clears the marker and then refreshes stores. Failure keeps the warning state.
5. **Safety-backup selection**: The application never assumes a browser `File`, Blob, or Electron path survives restart. Recovery always asks the user to reselect the saved safety-backup file, validates it fully, displays its timestamp/count summary, and requires deliberate confirmation before invoking the normal restore workflow.
6. **No automatic mutation**: Recovery checks are read-only. Restoring the safety backup is a new user-confirmed restore with a newly validated safety backup; the system never automatically clears, rewrites, or retries database mutations.
7. **Clearing state**: Only successful verification plus store refresh clears the marker/banner. A user may dismiss explanatory text but cannot dismiss the unresolved recovery state.

---

## 15. Comprehensive Test Matrix

1. **Repository inventory and startup**
   - Assert all 14 Dexie declarations, indexes, application-supplied string IDs, real API exports, direct readers/writers, reactive reads, export reads, and intentionally missing CRUD symbols.
   - Open an empty database, populated database, and the same database repeatedly.
   - Exercise every declared index query and prove startup/seeding idempotency for empty, complete, and partially populated achievement definitions.
2. **Legacy eight-table import**
   - Accept the real unversioned eight-array export with valid or absent/invalid informational `exportedAt`.
   - Reject malformed JSON, a missing/non-array required table, invalid record, duplicate ID, secret top-level/record field, and a missing required parent.
   - Strip benign unknown fields by table allowlist with warnings.
   - Prove matching IDs replace, non-matching IDs insert, absent current records remain, empty arrays clear nothing, and all six omitted tables are byte-for-byte unchanged.
   - Validate required parents against the computed incoming-plus-current post-merge view and prove any validation failure causes zero mutations.
3. **Version 2 envelope and export**
   - Validate exact format/version/schema/application-version/exportedAt policy and all 14 arrays/count keys.
   - Reject missing/additional top-level, count, table, or record fields; unsupported version/schema; malformed/duplicate IDs; secret-like fields; and every count mismatch.
   - Test every timestamp field and nullable timestamp variant in Section 9, including rejection of ISO `Task.dueDate`, `NaN`, infinities, and invalid ordering.
   - Cover pre-export rejection, serialize/parse post-export validation, pre-restore validation, empty workspace, and zero/non-zero table counts.
4. **Relationships and absence representations**
   - One test for every row in Section 10: valid parent, dangling ID rejection, and each supported omitted/`undefined`/`null` form.
   - Prove V2 never uses current database parents and legacy may use incoming plus current parents.
   - Prove empty strings and silent nulling/unassignment are rejected.
5. **Achievement authority**
   - Accept exact, compatible-subset, and zero incoming definitions; reject changed fields, duplicate ID/key, and unsupported definitions.
   - Reject unsupported `user_achievements` without deleting or resetting progress.
   - Verify incoming diagnostic count separately from canonical post-restore count and verify repeated startup behavior.
6. **Electron safety backup**
   - Success covers save dialog, selected path, write, close, existence, readback parse, all counts, and secret scan.
   - Cancellation and injected write, close, existence, readback, count, or secret-scan failures each block restore with zero database mutations.
7. **Browser safety backup**
   - Validate the generated Blob before download; verify download initiation is not treated as durable delivery.
   - Explicit confirmation permits restore; decline, modal close, or download-generation failure causes zero database mutations.
8. **Transaction, rollback, reopen, and recovery**
   - Inject failure during every clear/insert phase, each of the 14 count checks, and relationship verification; prove all 14 tables roll back to their original contents.
   - Verify parent-first insertion, canonical achievement count, successful reopen, actual-data store refresh, and marker clearing.
   - Inject marker write/readback, post-commit reopen, count, relationship, and pre-refresh/store-refresh failures; prove pre-transaction marker failure writes nothing, later failures withhold success, diagnostics are redacted, the marker survives restart, and checks never mutate data.
   - Test restart after pre-commit interruption and every post-commit failure; require safety-file reselection, validation, confirmation, and verification after deliberate recovery.
9. **AI persistence**
   - Complete, stopped-partial, stopped-zero, failed-partial, and failed-zero outcomes.
   - Local-only and no-evidence durable outcomes, plus empty/cancelled transient outcomes.
   - Exactly one persisted record per persisted outcome and none for zero-output policy cases; reactive refresh performs no second write.
   - Correct user/subject/task/provider-profile/display-name/model/status metadata and full provider-type dispatch without persisting `providerType`.
   - No persisted error metadata or secrets; partial content survives persistence failure in transient UI.
   - Deterministic injected-ID collision success on retries 1–3 and exhaustion after retry 3, using `add()` and proving no overwrite.
   - Missing/unknown historical statuses remain unmodified and incoming unsupported V2 statuses reject before safety/destructive work.
10. **Platform round trips and gates**
    - Real browser export → import/restore → reopen round trips for legacy and V2 with IDs, settings, relationships, AI history, statistics, achievements, and notifications preserved.
    - Real packaged-Electron export → save/readback → import/restore → restart round trips, not builds alone.
    - Run the complete Phase 0 regression suite and record exact discovered-file/test totals.
    - Require `npm test`, `npm run build`, and `npm run build:electron` to exit successfully; do not hardcode 31/168 as a future Phase 1 total.

---

## 16. Ten Detailed Work Packages

### WP-01 — Verified Persistence Inventory and Invariants
- **Purpose**: Establish automated test assertions for persistence symbols and ownership rules.
- **Scope**: Audit all 14 table definitions, indexes, and API exports.
- **Existing Files**: `src/db/database.ts`, `src/api/*`, `src/types/index.ts`.
- **Proposed Files**: `src/db/__tests__/inventoryInvariants.test.ts`.
- **Expected Production Changes**: None.
- **Explicit Exclusions**: No production code edits.
- **Dependencies**: None.
- **Risks**: Stale or falsely classified symbols could authorize an implementation against nonexistent production paths.
- **Automated Tests**: Vitest suite asserting symbol presence and table declarations.
- **Manual Verification**: Code inspection.
- **Security Checks**: Verify no credentials in DB schemas.
- **Acceptance Criteria**: Every inventory entry resolves to production code, seed/init is not runtime CRUD, and reactive/API/direct reads are distinguishable.
- **Commit Boundary**: `docs/tests: establish verified persistence invariants`
- **Independent-Review Gate**: Verification gate for inventory contract.

### WP-02 — Approved Persistence and Restore Contracts
- **Purpose**: Define formal TypeScript backup interfaces, relationship matrices, and AI single-writer specifications.
- **Scope**: Create `src/types/backup.ts` and freeze the exact V2 envelope, per-table allowlists/timestamps, relationship matrix, achievement authority, AI context, and recovery-marker contracts.
- **Existing Files**: `src/types/index.ts`.
- **Proposed Files**: `src/types/backup.ts`.
- **Expected Production Changes**: None.
- **Explicit Exclusions**: No implementation code.
- **Dependencies**: WP-01.
- **Risks**: A structurally valid but semantically incomplete contract could permit destructive restore of invalid data.
- **Automated Tests**: TypeScript compilation plus contract fixtures for required/optional keys, timestamps, relationships, and expected post-restore counts.
- **Manual Verification**: Code review against `database.ts`, all production entity types, AI request types, and both runtime boundaries.
- **Security Checks**: Validate secret exclusion rules in types.
- **Acceptance Criteria**: `backup.ts` compiles and represents every finalized rule in Sections 4 and 8–14 without `any`, implicit unknown-field persistence, or unresolved data-safety choice.
- **Commit Boundary**: `docs: approve Phase 1 persistence and restore contracts`
- **Independent-Review Gate**: Code review for backup contract interfaces.
  > **CRITICAL REVIEW GATE**: No WP-03 or later implementation begins until an independent reviewer returns `PASS — READY FOR PHASE 1 IMPLEMENTATION` for the WP-01 and WP-02 contracts.

### WP-03 — Real IndexedDB and Dexie Test Harness
- **Purpose**: Implement Vitest integration test infrastructure for 14-table Dexie operations.
- **Scope**: Configure `fake-indexeddb` harness.
- **Existing Files**: `package.json`, `vitest.config.ts`.
- **Proposed Files**: `src/db/__tests__/dexieHarness.test.ts`.
- **Expected Production Changes**: Test setup helper code.
- **Explicit Exclusions**: No production code edits.
- **Dependencies**: Independent PASS on WP-01 and WP-02.
- **Risks**: Mock environment mismatch.
- **Automated Tests**: Live Dexie CRUD tests in `fake-indexeddb`.
- **Manual Verification**: Run `npm test`.
- **Security Checks**: Ensure isolated in-memory DB context.
- **Acceptance Criteria**: Harness initializes `AetherPhase1DB` V3 cleanly in Vitest.
- **Commit Boundary**: `test: add real IndexedDB persistence harness`
- **Independent-Review Gate**: Harness code review.

### WP-04 — Backup Service Extraction and Version 2 Export
- **Purpose**: Extract export logic into `src/services/backupService.ts` and implement V2 14-table export.
- **Scope**: Export service implementation and `SettingsView.tsx` integration.
- **Existing Files**: `src/views/SettingsView.tsx`.
- **Proposed Files**: `src/services/backupService.ts`, `src/services/__tests__/backupExport.test.ts`.
- **Expected Production Changes**: Refactor `SettingsView.tsx` export handler to invoke `backupService.exportFullBackup()`.
- **Explicit Exclusions**: No restore implementation yet.
- **Dependencies**: WP-03.
- **Risks**: Incomplete data serialization.
- **Automated Tests**: All Section 15 V2 export/envelope/timestamp/unknown-field/count/secret tests.
- **Manual Verification**: Download backup JSON from Settings View and inspect structure.
- **Security Checks**: Automated 0-secret scan on export output.
- **Acceptance Criteria**: Pre-export and post-serialization validation pass; output contains exactly all 14 tables/counts and no unknown or secret field.
- **Commit Boundary**: `feat: add versioned complete backup service`
- **Independent-Review Gate**: Code review for export service.

### WP-05 — Legacy Partial Import Implementation
- **Purpose**: Implement `importLegacyBackup()` for 8-table non-destructive merge imports.
- **Scope**: Legacy V1 import handler in `backupService.ts`.
- **Existing Files**: `src/services/backupService.ts`, `src/views/SettingsView.tsx`.
- **Proposed Files**: `src/services/__tests__/legacyImport.test.ts`.
- **Expected Production Changes**: Add legacy import button/modal in `SettingsView.tsx`.
- **Explicit Exclusions**: V2 replace restore.
- **Dependencies**: WP-04.
- **Risks**: Overwriting existing records incorrectly.
- **Automated Tests**: Every Section 15 legacy malformed/allowlist/secret/duplicate/conflict/parent/atomicity case.
- **Manual Verification**: Import legacy Phase 0 export JSON.
- **Security Checks**: Input validation & secret scan on import.
- **Acceptance Criteria**: The validated eight-table merge applies exact conflict precedence atomically and proves the six absent tables remain byte-for-byte unchanged.
- **Commit Boundary**: `feat: add legacy partial workspace import`
- **Independent-Review Gate**: Code review for legacy import handler.

### WP-06 — Complete Version 2 Replace Restore Engine
- **Purpose**: Implement mandatory pre-restore safety backup and 14-table transactional replace restore.
- **Scope**: Replace restore implementation in `backupService.ts`.
- **Existing Files**: `src/services/backupService.ts`, `src/views/SettingsView.tsx`.
- **Proposed Files**: `src/services/__tests__/replaceRestore.test.ts`.
- **Expected Production Changes**: Add V2 restore confirmation modal in `SettingsView.tsx`.
- **Explicit Exclusions**: No database-version migration, automatic recovery mutation, or legacy-import behavior.
- **Dependencies**: WP-04, WP-05.
- **Risks**: Database clearing on unvalidated file.
- **Automated Tests**: All V2 safety-backup, parent-first insertion, 14-count, relationship, rollback, and canonical-achievement cases in Section 15.
- **Manual Verification**: Test full restore flow in browser and Electron.
- **Security Checks**: Ensure safety backup completes before clear.
- **Acceptance Criteria**: Full restore starts only after complete prevalidation and a verified safety backup; all 14 tables are replaced and verified inside one transaction, and any injected failure rolls back all tables.
- **Commit Boundary**: `feat: add transactional complete backup restore`
- **Independent-Review Gate**: Code review for restore engine.

### WP-07 — AI Persistence Ownership and Status Hardening
- **Purpose**: Make `AIOrchestrator` the single persistence owner, propagate real context, preserve local-only history, and add collision-safe outcome persistence.
- **Scope**: AI request/result types, orchestrator-owned private persistence helper, provider and local-only outcome paths, and `AIAssistantView` cleanup.
- **Existing Files**: `src/services/ai/orchestrator.ts`, `src/services/ai/types.ts`, `src/views/AIAssistantView.tsx`.
- **Proposed Files**: `src/services/ai/__tests__/aiPersistenceHardening.test.ts`.
- **Expected Production Changes**: Propagate `userId`/`subjectId`/`taskId`; route provider and local-only outcomes through the sole orchestrator helper; remove every AI-record `onAddAIMessage()` call from `AIAssistantView.tsx`.
- **Explicit Exclusions**: No UI redesign.
- **Dependencies**: WP-03. (Can proceed independently of WP-05/WP-06 once WP-03 passes).
- **Risks**: Missing conversation context.
- **Automated Tests**: Every AI case in Section 15, including local-only/no-evidence, correct metadata, zero-output, reactive no-write, and deterministic collision exhaustion.
- **Manual Verification**: Send AI queries in AIAssistantView and verify DB records.
- **Security Checks**: Assert no error metadata, raw provider error, stack, headers, payload, or credential is persisted/exported; sanitized errors remain transient only.
- **Acceptance Criteria**: Every persisted outcome produces exactly one correct record through the orchestrator helper, every zero-output policy case produces none, and local/reactive UI creates no second write.
- **Commit Boundary**: `fix: harden AI interaction persistence`
- **Independent-Review Gate**: Code review for AI persistence changes.

### WP-08 — Referential Integrity and Recovery Hardening
- **Purpose**: Implement relationship pre-validators and post-commit recovery verifiers.
- **Scope**: Integrity validation plus durable non-secret restore-verification marker and restart recovery workflow.
- **Existing Files**: `src/services/backupService.ts`.
- **Proposed Files**: `src/services/integrityService.ts`, `src/services/restoreVerificationState.ts`, `src/services/__tests__/integrityRecovery.test.ts`.
- **Expected Production Changes**: Integrate all-table count/relationship checks, local-storage marker transitions, startup verification, safety-file reselection, and actual-data store refresh.
- **Explicit Exclusions**: No Dexie schema field/version change, automatic retry, automatic database mutation, or persisted user content/path in the marker.
- **Dependencies**: WP-06, WP-07.
- **Risks**: False-positive integrity rejections.
- **Automated Tests**: Every relationship, marker transition, pre-/post-commit failure, restart, reselection, verification, and store-refresh case in Section 15.
- **Manual Verification**: Test importing files with broken foreign keys.
- **Security Checks**: Redact diagnostic messages on recovery.
- **Acceptance Criteria**: No dangling present reference commits; success is withheld until reopen/integrity/store refresh pass; every interrupted or failed state survives restart without automatic mutation and has a deliberate recovery path.
- **Commit Boundary**: `feat: add restore integrity and recovery state`
- **Independent-Review Gate**: Code review for integrity service.

### WP-09 — Security and Performance Characterisation
- **Purpose**: Add automated secret redaction audit on exports and gather baseline benchmark performance metrics.
- **Scope**: Benchmark script and security test suite.
- **Existing Files**: `src/services/backupService.ts`.
- **Proposed Files**: `src/services/__tests__/backupSecurityPerformance.test.ts`.
- **Expected Production Changes**: None.
- **Explicit Exclusions**: No hardcoded performance thresholds that break builds.
- **Dependencies**: WP-06.
- **Risks**: Over-broad scanning can expose or falsely classify sensitive values; benchmark fixtures can accidentally include real user content.
- **Automated Tests**: Prohibited secret pattern scan tests, benchmark measurement tests.
- **Manual Verification**: Inspect benchmark output logs.
- **Security Checks**: Full pattern scan across synthetic exports.
- **Acceptance Criteria**: Secret scan passes with 0 leaks; performance benchmarks recorded.
- **Commit Boundary**: `test: verify backup security and performance`
- **Independent-Review Gate**: Security audit review.

### WP-10 — Browser, Electron, Regression, and Closeout
- **Purpose**: Execute cross-platform persistence round-trip verification and Phase 1 closeout.
- **Scope**: Full test suite and production build validation across Web and Electron.
- **Existing Files**: Entire repository.
- **Proposed Files**: `docs/ai/PHASE_1_CLOSEOUT_REPORT.md`.
- **Expected Production Changes**: None.
- **Explicit Exclusions**: No new features.
- **Dependencies**: WP-01 through WP-09.
- **Risks**: Platform-specific persistence bugs.
- **Automated Tests**: Full current `npm test` suite with recorded discovery totals, `npm run build`, `npm run build:electron`, and browser/Electron integration coverage from Section 15.
- **Manual Verification**: Perform real browser legacy/V2 round trips and packaged-Electron save/readback/restore/restart round trips with disposable data.
- **Security Checks**: Final security audit across all artifacts.
- **Acceptance Criteria**: All Section 15 automated gates pass and both real runtime round trips preserve IDs, settings, relationships, AI history, statistics, achievements, and notifications with zero secret leakage.
- **Commit Boundary**: `docs: close Phase 1 verification`
- **Independent-Review Gate**: Final Phase 1 Independent Closeout Pass.

---

## 17. Final Architecture Self-Audit Matrix

| Review Blocker | Repository Evidence | Plan Section Resolving It | Decision Finalized? | Test Coverage Specified? |
|---|---|---|---|---|
| False methods (`getUserById`, etc.) | `src/api/*` code inspection | Section 2 | Yes | Yes (WP-01) |
| Missing CRUD inventory | `src/api/*` code inspection | Section 2 | Yes | Yes (WP-01) |
| Writer-specific `userId` | `src/types/index.ts`, `src/api/*` | Section 3 | Yes | Yes (WP-01) |
| AI subject/profile confusion | `orchestrator.ts` line 224 | Section 4 | Yes | Yes (WP-07) |
| AI metadata omissions | `orchestrator.ts` line 217 | Section 4 | Yes | Yes (WP-07) |
| Local-only persistence ownership | `AIAssistantView.tsx` local-result branch | Sections 4–5 | Yes | Yes (WP-07) |
| Nonexistent persisted error field | `AIConversation` interface | Sections 4–5 | Yes | Yes (WP-07) |
| AI collisions | `orchestrator.ts` `requestId` | Section 6 | Yes | Yes (WP-07) |
| Complete/stopped/failed flows | `AIAssistantView.tsx` & `orchestrator.ts` | Section 5 | Yes | Yes (WP-07) |
| Partial & zero-output handling | `AIAssistantView.tsx` state machine | Section 5 | Yes | Yes (WP-07) |
| Missing statuses | `AIConversation` interface | Section 7 | Yes | Yes (WP-07) |
| Unknown statuses | `AIConversation` interface | Section 7 | Yes | Yes (WP-07) |
| Legacy structural detection | `SettingsView.tsx` `handleExportData` | Section 8 | Yes | Yes (WP-05) |
| Legacy unknown fields | `SettingsView.tsx` export format | Section 8 | Yes | Yes (WP-05) |
| Version 2 timestamps | `src/types/index.ts` timestamp fields | Section 9 | Yes | Yes (WP-04) |
| Version & schema rejection | `AetherBackupV2` header spec | Section 9 | Yes | Yes (WP-04) |
| Missing/additional tables | V2 14-table envelope spec | Section 9 | Yes | Yes (WP-04) |
| Count corruption | `recordCounts` interlock spec | Section 9 | Yes | Yes (WP-04) |
| All-table in-transaction counts | Dexie transaction contract | Section 13 | Yes | Yes (WP-06) |
| Unknown record fields | Strict allowlist rejection policy | Section 8 & 9 | Yes | Yes (WP-04, WP-05) |
| Secret-looking fields | API key pattern scanner | Section 9 | Yes | Yes (WP-09) |
| V2 incoming-only relationships | Relationship matrix | Section 10 | Yes | Yes (WP-08) |
| Legacy incoming+current relationships | Relationship matrix | Section 10 | Yes | Yes (WP-08) |
| Optional-reference representations | Relationship matrix (`undefined` vs `null`) | Section 10 | Yes | Yes (WP-08) |
| Achievement authority | `database.ts` lines 460–470 | Section 11 | Yes | Yes (WP-06) |
| Safety success in Electron | File-write readback verification | Section 12 | Yes | Yes (WP-06) |
| Safety limitations in browser | User modal confirmation interlock | Section 12 | Yes | Yes (WP-06) |
| Restore ordering | Child-first clear & parent-first insert | Section 13 | Yes | Yes (WP-06) |
| Rollback | Dexie 14-table transaction scope | Section 13 | Yes | Yes (WP-06) |
| Post-commit reopen failure | Durable non-secret verification marker | Section 14 | Yes | Yes (WP-08) |
| Verification failure | Post-commit verification check | Section 14 | Yes | Yes (WP-08) |
| Restart recovery | DB integrity check on startup | Section 14 | Yes | Yes (WP-08) |
| Browser round trips | Real browser plus integration harness | Section 15 | Yes | Yes (WP-10) |
| Electron round trips | Packaged Electron plus IPC harness | Section 15 | Yes | Yes (WP-10) |
| WP-02 approval gate | Explicit WP-02 review gate requirement | Section 16 | Yes | Yes (WP-02) |

---

## 18. Definition of Done

Phase 1 will be complete when:
1. Readers/writers map 100% to production code.
2. Every persisted provider or local-only AI outcome creates exactly one correctly scoped record; zero-output policy cases create none.
3. Legacy 8-table exports import cleanly without altering absent tables.
4. Version 2 complete backups validate, export, replace, and verify all 14 tables inside a rollback-safe Dexie transaction.
5. Mandatory pre-restore safety backup downloads/saves successfully before restore writes.
6. 0 API keys or credentials exist in exported backups.
7. `npm test`, `npm run build`, `npm run build:electron` pass with 0 failures.
8. Interrupted and post-commit failures remain recoverable across restart without automatic database mutation.
9. Independent review returns `PASS — READY FOR PHASE 1 IMPLEMENTATION`.

---

## 19. Material Decisions Summary
- **Remaining Material Decisions**: None
