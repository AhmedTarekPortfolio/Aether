import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../db/database';
import * as subjectApi from '../subjectApi';
import * as taskApi from '../taskApi';
import * as noteApi from '../noteApi';
import { Subject, Task, Note } from '../../types';

describe('Mini Phase 6.6 - Core Entity CRUD Lifecycle Audit & Unit Tests', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
  });

  afterEach(() => {
    db.close();
  });

  /* ------------------- SUBJECT CRUD TESTS ------------------- */
  describe('Subject CRUD & Validation', () => {
    it('Subject edit success preserving ID and relationships', async () => {
      const sub: Subject = {
        id: 'sub_math',
        name: 'Math 101',
        code: 'MTH 101',
        color: '#4F7CFF',
        confidenceRating: 60,
        createdAt: Date.now(),
      };
      await subjectApi.addSubject(sub);

      const task: Task = {
        id: 'task_math_1',
        subjectId: 'sub_math',
        title: 'Calculus HW',
        priority: 'high',
        estimatedMinutes: 45,
        completedMinutes: 0,
        status: 'todo',
        createdAt: Date.now(),
      };
      await taskApi.addTask(task);

      // Perform edit
      await subjectApi.updateSubject('sub_math', {
        name: 'Advanced Calculus',
        code: 'MTH 201',
        confidenceRating: 85,
      });

      const updatedSub = (await subjectApi.getSubjects()).find((s) => s.id === 'sub_math');
      expect(updatedSub).toBeDefined();
      expect(updatedSub?.name).toBe('Advanced Calculus');
      expect(updatedSub?.code).toBe('MTH 201');
      expect(updatedSub?.confidenceRating).toBe(85);

      // Verify relationship preservation
      const fetchedTask = await taskApi.getTaskById('task_math_1');
      expect(fetchedTask?.subjectId).toBe('sub_math');
    });

    it('Subject duplicate name rejection (case-insensitive)', async () => {
      await subjectApi.addSubject({
        id: 'sub_1',
        name: 'Physics',
        color: '#4F7CFF',
        confidenceRating: 70,
        createdAt: Date.now(),
      });

      await subjectApi.addSubject({
        id: 'sub_2',
        name: 'Chemistry',
        color: '#2DD4BF',
        confidenceRating: 80,
        createdAt: Date.now(),
      });

      // Attempting to rename Chemistry -> physics (case insensitive duplicate)
      await expect(
        subjectApi.updateSubject('sub_2', { name: '  pHySiCs  ' })
      ).rejects.toThrow(/already exists/i);

      // Editing Chemistry keeping its own name should succeed
      await expect(
        subjectApi.updateSubject('sub_2', { name: 'Chemistry', confidenceRating: 90 })
      ).resolves.not.toThrow();
    });

    it('Subject empty name rejection', async () => {
      const sub: Subject = {
        id: 'sub_empty_test',
        name: 'Biology',
        color: '#FBBF24',
        confidenceRating: 50,
        createdAt: Date.now(),
      };
      await subjectApi.addSubject(sub);

      await expect(subjectApi.updateSubject('sub_empty_test', { name: '   ' })).rejects.toThrow(
        /cannot be empty/i
      );
    });
  });

  /* ------------------- TASK CRUD TESTS ------------------- */
  describe('Task CRUD & Relationships', () => {
    it('Task edit success preserving Task ID and subject relationship', async () => {
      const sub: Subject = {
        id: 'sub_cs',
        name: 'Computer Science',
        color: '#4F7CFF',
        confidenceRating: 75,
        createdAt: Date.now(),
      };
      await subjectApi.addSubject(sub);

      const task: Task = {
        id: 'task_cs_1',
        subjectId: 'sub_cs',
        title: 'Original Title',
        description: 'Original Desc',
        priority: 'medium',
        estimatedMinutes: 30,
        completedMinutes: 0,
        status: 'todo',
        createdAt: Date.now(),
      };
      await taskApi.addTask(task);

      // Update task
      await taskApi.updateTask('task_cs_1', {
        title: 'Updated Data Structures HW',
        priority: 'urgent',
        estimatedMinutes: 60,
      });

      const updated = await taskApi.getTaskById('task_cs_1');
      expect(updated).not.toBeNull();
      expect(updated?.id).toBe('task_cs_1');
      expect(updated?.title).toBe('Updated Data Structures HW');
      expect(updated?.priority).toBe('urgent');
      expect(updated?.estimatedMinutes).toBe(60);
      expect(updated?.subjectId).toBe('sub_cs');
    });

    it('Task persistence after reload simulation', async () => {
      const task: Task = {
        id: 'task_persist',
        title: 'Persistent Task',
        priority: 'low',
        estimatedMinutes: 20,
        completedMinutes: 0,
        status: 'todo',
        createdAt: Date.now(),
      };
      await taskApi.addTask(task);
      await taskApi.updateTask('task_persist', { status: 'completed' });

      // Close and reopen database simulating app restart
      db.close();
      await db.open();

      const reloaded = await taskApi.getTaskById('task_persist');
      expect(reloaded?.status).toBe('completed');
    });
  });

  /* ------------------- NOTE CRUD TESTS ------------------- */
  describe('Note CRUD & Deletion', () => {
    it('Note edit success (title, content, tags)', async () => {
      const note: Note = {
        id: 'note_1',
        subjectId: 'sub_cs',
        title: 'Original Title',
        content: 'Original Content',
        tags: ['draft'],
        updatedAt: Date.now(),
      };
      await noteApi.addNote(note);

      await noteApi.updateNote('note_1', {
        title: 'Updated Note Title',
        content: '# Updated Markdown Notes',
        tags: ['revised', 'physics'],
      });

      const notes = await noteApi.getNotes();
      const updated = notes.find((n) => n.id === 'note_1');
      expect(updated?.title).toBe('Updated Note Title');
      expect(updated?.content).toBe('# Updated Markdown Notes');
      expect(updated?.tags).toEqual(['revised', 'physics']);
    });

    it('Note delete success and persistence after reload', async () => {
      const note: Note = {
        id: 'note_to_del',
        subjectId: 'sub_cs',
        title: 'Temporary Note',
        content: 'Delete me',
        tags: [],
        updatedAt: Date.now(),
      };
      await noteApi.addNote(note);

      await noteApi.deleteNote('note_to_del');

      db.close();
      await db.open();

      const remaining = await noteApi.getNotes();
      expect(remaining.find((n) => n.id === 'note_to_del')).toBeUndefined();
    });
  });
});
