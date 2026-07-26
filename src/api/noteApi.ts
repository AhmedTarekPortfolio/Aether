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
    if (!note.title.trim()) throw new Error('Note title cannot be empty.');
    const subject = await db.subjects.get(note.subjectId);
    if (!subject) throw new Error('The selected subject does not exist.');
    if (note.topicId) {
      const topic = await db.topics.get(note.topicId);
      if (!topic || topic.subjectId !== note.subjectId) throw new Error('The selected topic does not belong to the selected subject.');
    }
    await db.notes.add(note);
  } catch (err) {
    logger.error('Failed to add note', err);
    throw new StorageError('addNote', err);
  }
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<void> {
  try {
    const current = await db.notes.get(id);
    if (!current) throw new NotFoundError('Note', id);
    if (updates.title !== undefined && !updates.title.trim()) throw new Error('Note title cannot be empty.');
    const subjectId = updates.subjectId ?? current.subjectId;
    if (!await db.subjects.get(subjectId)) throw new Error('The selected subject does not exist.');
    const topicId = updates.topicId === undefined ? current.topicId : updates.topicId;
    if (topicId) {
      const topic = await db.topics.get(topicId);
      if (!topic || topic.subjectId !== subjectId) throw new Error('The selected topic does not belong to the selected subject.');
    }
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
    if (!await db.notes.get(id)) throw new NotFoundError('Note', id);
    await db.notes.delete(id);
  } catch (err) {
    logger.error(`Failed to delete note with id ${id}`, err);
    throw new StorageError('deleteNote', err);
  }
}
