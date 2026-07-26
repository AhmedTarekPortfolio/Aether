import { db } from '../db/database';
import { Goal } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

async function validateGoal(goal: Partial<Goal>, current?: Goal): Promise<void> {
  if (!(goal.title ?? current?.title)?.trim()) throw new Error('Goal title cannot be empty.');
  const target = goal.targetValue ?? current?.targetValue ?? 0;
  const progress = goal.currentValue ?? current?.currentValue ?? 0;
  if (!Number.isFinite(target) || target <= 0) throw new Error('Goal target must be greater than zero.');
  if (!Number.isFinite(progress) || progress < 0) throw new Error('Goal progress cannot be negative.');
  const subjectId = goal.subjectId === undefined ? current?.subjectId : goal.subjectId;
  if (subjectId) {
    const subject = await db.subjects.get(subjectId);
    if (!subject || (subject.userId && subject.userId !== 'default_user')) throw new Error('The selected subject does not exist.');
  }
}

export async function getGoals(): Promise<Goal[]> {
  try {
    return await db.goals.toArray();
  } catch (err) {
    logger.error('Failed to fetch goals', err);
    throw new StorageError('getGoals', err);
  }
}

export async function addGoal(goal: Goal): Promise<void> {
  try {
    if (goal.userId && goal.userId !== 'default_user') throw new Error('Goal ownership is invalid.');
    await validateGoal(goal);
    await db.goals.add({ ...goal, userId: 'default_user', title: goal.title.trim() });
  } catch (err) {
    logger.error('Failed to add goal', err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('addGoal', err);
  }
}

export async function updateGoal(id: string, updates: Partial<Goal>): Promise<void> {
  try {
    const current = await db.goals.get(id);
    if (!current) throw new NotFoundError('Goal', id);
    if (current.userId && current.userId !== 'default_user') throw new Error('Goal ownership is invalid.');
    await validateGoal(updates, current);
    const status = updates.status ?? current.status;
    await db.goals.update(id, {
      ...updates,
      ...(updates.title !== undefined && { title: updates.title.trim() }),
      completedAt: status === 'completed' ? (updates.completedAt ?? current.completedAt ?? Date.now()) : null,
    });
  } catch (err) {
    logger.error(`Failed to update goal ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('updateGoal', err);
  }
}

export async function deleteGoal(id: string): Promise<void> {
  try {
    const goal = await db.goals.get(id);
    if (!goal) throw new NotFoundError('Goal', id);
    if (goal.userId && goal.userId !== 'default_user') throw new Error('Goal ownership is invalid.');
    await db.goals.delete(id);
  } catch (err) {
    logger.error(`Failed to delete goal ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('deleteGoal', err);
  }
}
