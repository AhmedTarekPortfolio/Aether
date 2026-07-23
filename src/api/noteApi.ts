import { db } from '../db/database';
import { Note } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

export async function getNotes(): Promise<Note[]> {
  try {
    return await db.notes.orderBy('updatedAt').reverse().toArray();
  } catch (err) {
    logger.error('Failed to fetch notes', err);
    throw new StorageError('getNotes', err);
  }
}

export async function addNote(note: Note): Promise<void> {
  try {
    await db.notes.add(note);
  } catch (err) {
    logger.error('Failed to add note', err);
    throw new StorageError('addNote', err);
  }
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<void> {
  try {
    const count = await db.notes.update(id, updates);
    if (count === 0) {
      throw new NotFoundError('Note', id);
    }
  } catch (err) {
    logger.error(`Failed to update note with id ${id}`, err);
    throw err instanceof NotFoundError ? err : new StorageError('updateNote', err);
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    await db.notes.delete(id);
  } catch (err) {
    logger.error(`Failed to delete note with id ${id}`, err);
    throw new StorageError('deleteNote', err);
  }
}
