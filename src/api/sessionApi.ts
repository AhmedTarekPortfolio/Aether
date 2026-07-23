import { db } from '../db/database';
import { Session } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getSessions(): Promise<Session[]> {
  try {
    return await db.sessions.toArray();
  } catch (err) {
    logger.error('Failed to fetch focus sessions', err);
    throw new StorageError('getSessions', err);
  }
}

export async function addSession(session: Session): Promise<void> {
  try {
    await db.sessions.add(session);
  } catch (err) {
    logger.error('Failed to add focus session', err);
    throw new StorageError('addSession', err);
  }
}
