import { db } from '../db/database';
import { Subject } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function addSubject(subject: Subject): Promise<void> {
  try {
    await db.subjects.add(subject);
  } catch (err) {
    logger.error('Failed to add subject', err);
    throw new StorageError('addSubject', err);
  }
}

export async function getSubjects(): Promise<Subject[]> {
  try {
    return await db.subjects.toArray();
  } catch (err) {
    logger.error('Failed to fetch subjects', err);
    throw new StorageError('getSubjects', err);
  }
}
