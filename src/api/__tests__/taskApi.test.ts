import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../db/database';
import * as taskApi from '../taskApi';
import { Task } from '../../types';

describe('Task API Repository Layer (fake-indexeddb)', () => {
  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
  });

  afterEach(() => {
    db.close();
  });

  it('adds and retrieves a task by id', async () => {
    const newTask: Task = {
      id: 'task_test_1',
      userId: 'default_user',
      title: 'Unit Test Task',
      priority: 'high',
      estimatedMinutes: 60,
      completedMinutes: 0,
      status: 'todo',
      createdAt: Date.now(),
    };

    await taskApi.addTask(newTask);

    const fetched = await taskApi.getTaskById('task_test_1');
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe('Unit Test Task');
    expect(fetched?.priority).toBe('high');
  });

  it('lists all tasks', async () => {
    const t1: Task = { id: 't1', title: 'Task 1', priority: 'medium', estimatedMinutes: 30, completedMinutes: 0, status: 'todo', createdAt: Date.now() };
    const t2: Task = { id: 't2', title: 'Task 2', priority: 'low', estimatedMinutes: 15, completedMinutes: 0, status: 'completed', createdAt: Date.now() };

    await taskApi.addTask(t1);
    await taskApi.addTask(t2);

    const tasks = await taskApi.getTasks();
    expect(tasks.length).toBe(2);
  });

  it('updates an existing task status and completed minutes', async () => {
    const task: Task = { id: 't_update', title: 'Original Title', priority: 'medium', estimatedMinutes: 60, completedMinutes: 0, status: 'todo', createdAt: Date.now() };
    await taskApi.addTask(task);

    await taskApi.updateTask('t_update', { status: 'completed', completedMinutes: 60 });

    const updated = await taskApi.getTaskById('t_update');
    expect(updated?.status).toBe('completed');
    expect(updated?.completedMinutes).toBe(60);
  });

  it('deletes a task by id', async () => {
    const task: Task = { id: 't_del', title: 'Task to Delete', priority: 'low', estimatedMinutes: 15, completedMinutes: 0, status: 'todo', createdAt: Date.now() };
    await taskApi.addTask(task);

    await taskApi.deleteTask('t_del');

    const deleted = await taskApi.getTaskById('t_del');
    expect(deleted).toBeNull();
  });
});
