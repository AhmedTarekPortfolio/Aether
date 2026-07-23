import { db } from '../db/database';
import { Goal } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getGoals(): Promise<Goal[]> {
  try {
    return await db.goals.toArray();
  } catch (err) {
    logger.error('Failed to fetch goals', err);
    throw new StorageError('getGoals', err);
  }
}
