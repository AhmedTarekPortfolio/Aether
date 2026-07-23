import { db } from '../db/database';
import { Flashcard } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getFlashcards(): Promise<Flashcard[]> {
  try {
    return await db.flashcards.toArray();
  } catch (err) {
    logger.error('Failed to fetch flashcards', err);
    throw new StorageError('getFlashcards', err);
  }
}
