import { db } from '../db/database';
import { Flashcard } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

async function validateFlashcard(card: Partial<Flashcard>, current?: Flashcard): Promise<void> {
  const subjectId = card.subjectId ?? current?.subjectId;
  const topicId = card.topicId === undefined ? current?.topicId : card.topicId;
  if (!(card.front ?? current?.front)?.trim()) throw new Error('Flashcard question cannot be empty.');
  if (!(card.back ?? current?.back)?.trim()) throw new Error('Flashcard answer cannot be empty.');
  if (!subjectId) throw new Error('A flashcard must belong to a subject.');
  const subject = await db.subjects.get(subjectId);
  if (!subject || (subject.userId && subject.userId !== 'default_user')) throw new Error('The selected subject does not exist.');
  if (topicId) {
    const topic = await db.topics.get(topicId);
    if (!topic || topic.subjectId !== subjectId) throw new Error('The selected topic does not belong to the selected subject.');
  }
}

export async function getFlashcards(): Promise<Flashcard[]> {
  try {
    return await db.flashcards.toArray();
  } catch (err) {
    logger.error('Failed to fetch flashcards', err);
    throw new StorageError('getFlashcards', err);
  }
}

export async function addFlashcard(card: Flashcard): Promise<void> {
  try {
    if (card.userId && card.userId !== 'default_user') throw new Error('Flashcard ownership is invalid.');
    await validateFlashcard(card);
    await db.flashcards.add({ ...card, userId: 'default_user', front: card.front.trim(), back: card.back.trim() });
  } catch (err) {
    logger.error('Failed to add flashcard', err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('addFlashcard', err);
  }
}

export async function updateFlashcard(id: string, updates: Partial<Flashcard>): Promise<void> {
  try {
    const current = await db.flashcards.get(id);
    if (!current) throw new NotFoundError('Flashcard', id);
    if (current.userId && current.userId !== 'default_user') throw new Error('Flashcard ownership is invalid.');
    await validateFlashcard(updates, current);
    await db.flashcards.update(id, {
      ...updates,
      ...(updates.front !== undefined && { front: updates.front.trim() }),
      ...(updates.back !== undefined && { back: updates.back.trim() }),
      userId: current.userId || 'default_user',
    });
  } catch (err) {
    logger.error(`Failed to update flashcard ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('updateFlashcard', err);
  }
}

export async function deleteFlashcard(id: string): Promise<void> {
  try {
    const card = await db.flashcards.get(id);
    if (!card) throw new NotFoundError('Flashcard', id);
    if (card.userId && card.userId !== 'default_user') throw new Error('Flashcard ownership is invalid.');
    await db.flashcards.delete(id);
  } catch (err) {
    logger.error(`Failed to delete flashcard ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('deleteFlashcard', err);
  }
}
