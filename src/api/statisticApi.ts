import { db } from '../db/database';
import { Statistic } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

// TODO: populate via recompute job in a future phase
export async function getStatistics(): Promise<Statistic[]> {
  try {
    return await db.statistics.toArray();
  } catch (err) {
    logger.error('Failed to fetch statistics cache', err);
    throw new StorageError('getStatistics', err);
  }
}
