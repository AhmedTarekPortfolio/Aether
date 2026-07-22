import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { AetherDatabase } from '../src/db/database';

async function runMigrationTest() {
  console.log('=== AETHER PHASE 4 MIGRATION TEST ===\n');

  // Step 1: Create an old v2 Dexie database using identical database name AetherPhase1DB
  const oldDb = new Dexie('AetherPhase1DB');
  oldDb.version(2).stores({
    subjects: 'id, name, confidenceRating',
    topics: 'id, subjectId, title, masteryLevel',
    tasks: 'id, subjectId, priority, status, dueDate',
    notes: 'id, subjectId, topicId, title, updatedAt',
    flashcards: 'id, subjectId, topicId, nextReviewDate',
    focusSessions: 'id, subjectId, taskId, completedAt, durationMinutes',
    aiInteractions: 'id, mode, timestamp',
    notifications: 'id, type, read, createdAt',
    userProfile: 'id',
  });

  const now = Date.now();
  await oldDb.open();

  // Populate representative Phase 2/3 (v2) data
  await oldDb.table('userProfile').put({
    id: 'default_user',
    name: 'Alex Rivera',
    email: 'alex.rivera@university.edu',
    academicLevel: 'B.S. Computer Science',
    studyGoalHoursWeekly: 25,
    theme: 'dark',
    soundEnabled: true,
    aiProvider: 'local',
  });

  await oldDb.table('subjects').bulkAdd([
    { id: 'sub_1', name: 'Algorithms', code: 'CS 301', color: '#4F7CFF', confidenceRating: 60, createdAt: now },
    { id: 'sub_2', name: 'Physics', code: 'PHYS 202', color: '#8B5CF6', confidenceRating: 40, createdAt: now },
  ]);

  await oldDb.table('tasks').bulkAdd([
    { id: 'task_1', title: 'DP Problem Set', subjectId: 'sub_1', priority: 'high', estimatedMinutes: 60, completedMinutes: 0, status: 'todo', createdAt: now },
    { id: 'task_2', title: 'Schrödinger Proof', subjectId: 'sub_2', priority: 'urgent', estimatedMinutes: 45, completedMinutes: 45, status: 'completed', createdAt: now },
  ]);

  await oldDb.table('focusSessions').bulkAdd([
    { id: 'focus_1', taskId: 'task_2', subjectId: 'sub_2', durationMinutes: 45, type: 'pomodoro', distractionCount: 0, reflectionRating: 5, completedAt: now },
  ]);

  await oldDb.table('aiInteractions').bulkAdd([
    { id: 'ai_1', role: 'assistant', mode: 'tutor', content: 'Quantum wave mechanics summary', timestamp: now, contextSubjectId: 'sub_2' },
  ]);

  await oldDb.table('notifications').bulkAdd([
    { id: 'notif_1', type: 'deadline', title: 'Urgent Deadline', message: 'Proof due soon', read: false, createdAt: now },
  ]);

  console.log('✔ Phase 2/v2 test database seeded successfully.');
  oldDb.close();

  // Step 2: Open with new version(3) AetherDatabase class to trigger .upgrade()
  let upgradeError = null;
  const newDb = new AetherDatabase();

  try {
    await newDb.open();
    console.log('PASS [1/5]: No exception thrown during version(3) Dexie upgrade.');
  } catch (err: any) {
    upgradeError = err;
    console.error('FAIL [1/5]: Exception thrown during upgrade:', err);
  }

  if (upgradeError) return;

  // Step 3: Assertions
  const subCount = await newDb.subjects.count();
  const taskCount = await newDb.tasks.count();
  const sessionCount = await newDb.sessions.count();
  const aiCount = await newDb.ai_conversations.count();
  const notifCount = await newDb.notifications.count();

  const isCountPreserved = subCount === 2 && taskCount === 2 && sessionCount === 1 && aiCount === 1 && notifCount === 1;
  console.log(
    isCountPreserved
      ? `PASS [2/5]: Every pre-existing row count preserved (subjects: ${subCount}, tasks: ${taskCount}, sessions: ${sessionCount}, ai_conversations: ${aiCount}, notifications: ${notifCount}).`
      : `FAIL [2/5]: Row counts mismatched.`
  );

  // Check userId === 'default_user' on migrated rows
  const subs = await newDb.subjects.toArray();
  const tasks = await newDb.tasks.toArray();
  const sessions = await newDb.sessions.toArray();
  const aiConvs = await newDb.ai_conversations.toArray();
  const notifs = await newDb.notifications.toArray();

  const allHaveUserId =
    subs.every((s) => s.userId === 'default_user') &&
    tasks.every((t) => t.userId === 'default_user') &&
    sessions.every((s) => s.userId === 'default_user') &&
    aiConvs.every((a) => a.userId === 'default_user') &&
    notifs.every((n) => n.userId === 'default_user');

  console.log(
    allHaveUserId
      ? 'PASS [3/5]: Every migrated row has userId === "default_user" set.'
      : 'FAIL [3/5]: Some migrated rows are missing userId.'
  );

  // Check 1:1 split users + settings
  const user = await newDb.users.get('default_user');
  const settings = await newDb.settings.get('default_settings');

  const isProfileMigrated =
    user?.name === 'Alex Rivera' &&
    user?.email === 'alex.rivera@university.edu' &&
    settings?.theme === 'dark' &&
    settings?.studyGoalHoursWeekly === 25;

  console.log(
    isProfileMigrated
      ? `PASS [4/5]: users & settings 1:1 rows created with profile data (User: ${user?.name}, Theme: ${settings?.theme}, Goal: ${settings?.studyGoalHoursWeekly}h).`
      : 'FAIL [4/5]: userProfile split migration failed.'
  );

  // Check renamed tables vs dropped old tables
  const tableNames = newDb.tables.map((t) => t.name);
  const isRenamedCorrectly =
    tableNames.includes('sessions') &&
    tableNames.includes('ai_conversations') &&
    !tableNames.includes('focusSessions') &&
    !tableNames.includes('aiInteractions');

  console.log(
    isRenamedCorrectly
      ? 'PASS [5/5]: Renamed tables (sessions, ai_conversations) exist; old table names (focusSessions, aiInteractions) are dropped from schema.'
      : `FAIL [5/5]: Table rename failed. Present tables: ${tableNames.join(', ')}`
  );

  newDb.close();
  console.log('\n=== ALL MIGRATION TESTS COMPLETE ===');
}

runMigrationTest().catch(console.error);
