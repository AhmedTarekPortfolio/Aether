import { db } from '../db/database';
import { Settings } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function getSettings(id: string): Promise<Settings | null> {
  try {
    const settings = await db.settings.get(id);
    return settings || null;
  } catch (err) {
    logger.error(`Failed to fetch settings with id ${id}`, err);
    throw new StorageError('getSettings', err);
  }
}

export async function updateSettings(id: string, updates: Partial<Settings>): Promise<void> {
  try {
    const count = await db.settings.update(id, updates);
    if (count === 0) {
      throw new NotFoundError('Settings', id);
    }
  } catch (err) {
    logger.error(`Failed to update settings with id ${id}`, err);
    throw err instanceof NotFoundError ? err : new StorageError('updateSettings', err);
  }
}
