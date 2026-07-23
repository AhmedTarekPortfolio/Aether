import { db } from '../db/database';
import { Topic } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getTopics(): Promise<Topic[]> {
  try {
    return await db.topics.toArray();
  } catch (err) {
    logger.error('Failed to fetch topics', err);
    throw new StorageError('getTopics', err);
  }
}
