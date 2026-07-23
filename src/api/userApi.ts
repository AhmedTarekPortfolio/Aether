import { db } from '../db/database';
import { User } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function getUser(id: string): Promise<User | null> {
  try {
    const user = await db.users.get(id);
    return user || null;
  } catch (err) {
    logger.error(`Failed to fetch user with id ${id}`, err);
    throw new StorageError('getUser', err);
  }
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
  try {
    const count = await db.users.update(id, updates);
    if (count === 0) {
      throw new NotFoundError('User', id);
    }
  } catch (err) {
    logger.error(`Failed to update user with id ${id}`, err);
    throw err instanceof NotFoundError ? err : new StorageError('updateUser', err);
  }
}
