import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../db/database';
import * as subjectApi from '../subjectApi';
import { Subject, Task, Note, Session } from '../../types';

describe('Safe Subject Deletion & Referential Integrity (subjectApi)', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
  });

  afterEach(() => {
    db.close();
  });

  it('1. Subject with no references -> deletion succeeds', async () => {
    const sub: Subject = {
      id: 'sub_clean',
      userId: 'default_user',
      name: 'Clean Subject',
      code: 'CS 101',
      color: '#4F7CFF',
      confidenceRating: 80,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);

    const refs = await subjectApi.checkSubjectReferences('sub_clean');
    expect(refs.isDeletable).toBe(true);
    expect(refs.totalReferences).toBe(0);

    await subjectApi.deleteSubject('sub_clean');

    const subjects = await subjectApi.getSubjects();
    expect(subjects.find((s) => s.id === 'sub_clean')).toBeUndefined();
  });

  it('2. Subject with Tasks -> deletion blocked', async () => {
    const sub: Subject = {
      id: 'sub_with_tasks',
      name: 'Subject With Tasks',
      color: '#4F7CFF',
      confidenceRating: 70,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);

    const task: Task = {
      id: 'task_blocker',
      subjectId: 'sub_with_tasks',
      title: 'Blocking Task',
      priority: 'high',
      estimatedMinutes: 30,
      completedMinutes: 0,
      status: 'todo',
      createdAt: Date.now(),
    };
    await db.tasks.add(task);

    const refs = await subjectApi.checkSubjectReferences('sub_with_tasks');
    expect(refs.isDeletable).toBe(false);
    expect(refs.tasks).toBe(1);
    expect(refs.totalReferences).toBe(1);

    await expect(subjectApi.deleteSubject('sub_with_tasks')).rejects.toThrow(
      /cannot be deleted/i
    );

    // Subject must remain untouched
    const subjects = await subjectApi.getSubjects();
    expect(subjects.find((s) => s.id === 'sub_with_tasks')).toBeDefined();
  });

  it('3. Subject with Notes -> deletion blocked', async () => {
    const sub: Subject = {
      id: 'sub_with_notes',
      name: 'Subject With Notes',
      color: '#4F7CFF',
      confidenceRating: 75,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);

    const note: Note = {
      id: 'note_blocker',
      subjectId: 'sub_with_notes',
      title: 'Blocking Note',
      content: 'Note content',
      tags: ['test'],
      updatedAt: Date.now(),
    };
    await db.notes.add(note);

    const refs = await subjectApi.checkSubjectReferences('sub_with_notes');
    expect(refs.isDeletable).toBe(false);
    expect(refs.notes).toBe(1);

    await expect(subjectApi.deleteSubject('sub_with_notes')).rejects.toThrow(
      /cannot be deleted/i
    );

    const subjects = await subjectApi.getSubjects();
    expect(subjects.find((s) => s.id === 'sub_with_notes')).toBeDefined();
  });

  it('4. Subject with Focus Sessions -> deletion blocked', async () => {
    const sub: Subject = {
      id: 'sub_with_sessions',
      name: 'Subject With Focus Sessions',
      color: '#4F7CFF',
      confidenceRating: 85,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);

    const session: Session = {
      id: 'session_blocker',
      subjectId: 'sub_with_sessions',
      type: 'pomodoro',
      durationMinutes: 25,
      distractionCount: 0,
      completedAt: Date.now(),
    };
    await db.sessions.add(session);

    const refs = await subjectApi.checkSubjectReferences('sub_with_sessions');
    expect(refs.isDeletable).toBe(false);
    expect(refs.sessions).toBe(1);

    await expect(subjectApi.deleteSubject('sub_with_sessions')).rejects.toThrow(
      /cannot be deleted/i
    );
  });

  it('5. Confirmation & validation checks accurately report blocking breakdown', async () => {
    const sub: Subject = {
      id: 'sub_multi_refs',
      name: 'Multi Reference Subject',
      color: '#4F7CFF',
      confidenceRating: 90,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);

    await db.tasks.add({ id: 't1', subjectId: 'sub_multi_refs', title: 'T1', priority: 'medium', estimatedMinutes: 30, completedMinutes: 0, status: 'todo', createdAt: Date.now() });
    await db.notes.add({ id: 'n1', subjectId: 'sub_multi_refs', title: 'N1', content: 'c', tags: [], updatedAt: Date.now() });
    await db.flashcards.add({ id: 'fc1', subjectId: 'sub_multi_refs', front: 'q', back: 'a', easeFactor: 2.5, interval: 1, repetitions: 1, nextReviewDate: Date.now() });

    const refs = await subjectApi.checkSubjectReferences('sub_multi_refs');
    expect(refs.isDeletable).toBe(false);
    expect(refs.tasks).toBe(1);
    expect(refs.notes).toBe(1);
    expect(refs.flashcards).toBe(1);
    expect(refs.totalReferences).toBe(3);
  });

  it('6. Blocked / cancelled deletion leaves the Subject unchanged', async () => {
    const sub: Subject = {
      id: 'sub_cancel',
      name: 'Cancelled Subject',
      color: '#4F7CFF',
      confidenceRating: 60,
      createdAt: Date.now(),
    };
    await subjectApi.addSubject(sub);
    await db.tasks.add({ id: 't_cancel', subjectId: 'sub_cancel', title: 'T', priority: 'low', estimatedMinutes: 10, completedMinutes: 0, status: 'todo', createdAt: Date.now() });

    try {
      await subjectApi.deleteSubject('sub_cancel');
    } catch {
      // Expected rejection
    }

    const subjects = await subjectApi.getSubjects();
    expect(subjects.length).toBe(1);
    expect(subjects[0].name).toBe('Cancelled Subject');
  });

  it('7. Successful deletion removes only the target Subject', async () => {
    const sub1: Subject = { id: 'sub_keep', name: 'Subject to Keep', color: '#2DD4BF', confidenceRating: 95, createdAt: Date.now() };
    const sub2: Subject = { id: 'sub_delete', name: 'Subject to Delete', color: '#FBBF24', confidenceRating: 50, createdAt: Date.now() };

    await subjectApi.addSubject(sub1);
    await subjectApi.addSubject(sub2);

    await subjectApi.deleteSubject('sub_delete');

    const remaining = await subjectApi.getSubjects();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('sub_keep');
  });
});
