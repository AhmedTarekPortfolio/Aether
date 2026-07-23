import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { AetherDatabase } from '../database';

describe('Dexie Database Schema Migration (Version 2 -> Version 3)', () => {

  beforeEach(async () => {
    // Clean up indexedDB before test run
    await Dexie.delete('AetherPhase1DB');
  });

  it('PASS [1/5]: completes version(3) Dexie upgrade without throwing an exception', async () => {
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

    await oldDb.open();
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
    oldDb.close();

    const newDb = new AetherDatabase();
    await expect(newDb.open()).resolves.not.toThrow();
    newDb.close();
  });

  it('PASS [2/5]: preserves all pre-existing row counts across migrated tables', async () => {
    const now = Date.now();
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

    await oldDb.open();
    await oldDb.table('subjects').bulkAdd([
      { id: 'sub_1', name: 'Algorithms', confidenceRating: 60, createdAt: now },
      { id: 'sub_2', name: 'Physics', confidenceRating: 40, createdAt: now },
    ]);
    await oldDb.table('tasks').bulkAdd([
      { id: 'task_1', title: 'DP Set', priority: 'high', estimatedMinutes: 60, completedMinutes: 0, status: 'todo', createdAt: now },
      { id: 'task_2', title: 'Wave Proof', priority: 'urgent', estimatedMinutes: 45, completedMinutes: 45, status: 'completed', createdAt: now },
    ]);
    await oldDb.table('focusSessions').bulkAdd([
      { id: 'focus_1', taskId: 'task_2', durationMinutes: 45, type: 'pomodoro', completedAt: now },
    ]);
    await oldDb.table('aiInteractions').bulkAdd([
      { id: 'ai_1', role: 'assistant', mode: 'tutor', content: 'Summary', timestamp: now },
    ]);
    await oldDb.table('notifications').bulkAdd([
      { id: 'notif_1', type: 'deadline', title: 'Deadline', message: 'Urgent', read: false, createdAt: now },
    ]);
    oldDb.close();

    const newDb = new AetherDatabase();
    await newDb.open();

    expect(await newDb.subjects.count()).toBe(2);
    expect(await newDb.tasks.count()).toBe(2);
    expect(await newDb.sessions.count()).toBe(1);
    expect(await newDb.ai_conversations.count()).toBe(1);
    expect(await newDb.notifications.count()).toBe(1);

    newDb.close();
  });

  it('PASS [3/5]: sets userId === "default_user" on every migrated row', async () => {
    const now = Date.now();
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

    await oldDb.open();
    await oldDb.table('subjects').add({ id: 'sub_1', name: 'Algorithms', confidenceRating: 60, createdAt: now });
    await oldDb.table('tasks').add({ id: 'task_1', title: 'DP Set', priority: 'high', estimatedMinutes: 60, completedMinutes: 0, status: 'todo', createdAt: now });
    oldDb.close();

    const newDb = new AetherDatabase();
    await newDb.open();

    const subs = await newDb.subjects.toArray();
    const tasks = await newDb.tasks.toArray();

    expect(subs.every((s) => s.userId === 'default_user')).toBe(true);
    expect(tasks.every((t) => t.userId === 'default_user')).toBe(true);

    newDb.close();
  });

  it('PASS [4/5]: creates 1:1 users and settings rows populated from old userProfile data', async () => {
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

    await oldDb.open();
    await oldDb.table('userProfile').put({
      id: 'default_user',
      name: 'Alex Rivera',
      email: 'alex.rivera@university.edu',
      academicLevel: 'B.S. Computer Science',
      studyGoalHoursWeekly: 30,
      theme: 'dark',
      soundEnabled: true,
      aiProvider: 'local',
    });
    oldDb.close();

    const newDb = new AetherDatabase();
    await newDb.open();

    const user = await newDb.users.get('default_user');
    const settings = await newDb.settings.get('default_settings');

    expect(user?.name).toBe('Alex Rivera');
    expect(user?.email).toBe('alex.rivera@university.edu');
    expect(settings?.theme).toBe('dark');
    expect(settings?.studyGoalHoursWeekly).toBe(30);

    newDb.close();
  });

  it('PASS [5/5]: includes renamed tables (sessions, ai_conversations) and drops old table names', async () => {
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

    await oldDb.open();
    oldDb.close();

    const newDb = new AetherDatabase();
    await newDb.open();

    const tableNames = newDb.tables.map((t) => t.name);

    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('ai_conversations');
    expect(tableNames).not.toContain('focusSessions');
    expect(tableNames).not.toContain('aiInteractions');

    newDb.close();
  });
});
