import { db } from '../db/database';
import { Task } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function getTasks(): Promise<Task[]> {
  try {
    return await db.tasks.toArray();
  } catch (err) {
    logger.error('Failed to fetch tasks', err);
    throw new StorageError('getTasks', err);
  }
}

export async function getTaskById(id: string): Promise<Task | null> {
  try {
    const task = await db.tasks.get(id);
    return task || null;
  } catch (err) {
    logger.error(`Failed to fetch task with id ${id}`, err);
    throw new StorageError('getTaskById', err);
  }
}

export async function addTask(task: Task): Promise<void> {
  try {
    await db.tasks.add(task);
  } catch (err) {
    logger.error('Failed to add task', err);
    throw new StorageError('addTask', err);
  }
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  try {
    const count = await db.tasks.update(id, updates);
    if (count === 0) {
      throw new NotFoundError('Task', id);
    }
  } catch (err) {
    logger.error(`Failed to update task with id ${id}`, err);
    throw err instanceof NotFoundError ? err : new StorageError('updateTask', err);
  }
}

export async function deleteTask(id: string): Promise<void> {
  try {
    await db.tasks.delete(id);
  } catch (err) {
    logger.error(`Failed to delete task with id ${id}`, err);
    throw new StorageError('deleteTask', err);
  }
}
