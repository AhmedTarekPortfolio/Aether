import { db } from '../db/database';
import { Topic } from '../types';
import { logger } from '../services/logger';
import { NotFoundError, StorageError } from './errors';

async function validateTopic(topic: Partial<Topic>, current?: Topic): Promise<void> {
  const title = topic.title ?? current?.title;
  const subjectId = topic.subjectId ?? current?.subjectId;
  if (!title?.trim()) throw new Error('Topic title cannot be empty.');
  if (!subjectId) throw new Error('A topic must belong to a subject.');
  if ((topic.masteryLevel ?? current?.masteryLevel ?? 0) < 0 || (topic.masteryLevel ?? current?.masteryLevel ?? 0) > 100) {
    throw new Error('Topic mastery must be between 0 and 100.');
  }
  const subject = await db.subjects.get(subjectId);
  if (!subject || (subject.userId && subject.userId !== 'default_user')) {
    throw new Error('The selected subject does not exist.');
  }
}

export async function getTopics(): Promise<Topic[]> {
  try {
    return await db.topics.toArray();
  } catch (err) {
    logger.error('Failed to fetch topics', err);
    throw new StorageError('getTopics', err);
  }
}

export async function addTopic(topic: Topic): Promise<void> {
  try {
    await validateTopic(topic);
    await db.topics.add({ ...topic, title: topic.title.trim() });
  } catch (err) {
    logger.error('Failed to add topic', err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('addTopic', err);
  }
}

export async function updateTopic(id: string, updates: Partial<Topic>): Promise<void> {
  try {
    const current = await db.topics.get(id);
    if (!current) throw new NotFoundError('Topic', id);
    await validateTopic(updates, current);
    const count = await db.topics.update(id, {
      ...updates,
      ...(updates.title !== undefined && { title: updates.title.trim() }),
    });
    if (!count) throw new NotFoundError('Topic', id);
  } catch (err) {
    logger.error(`Failed to update topic ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('updateTopic', err);
  }
}

export async function deleteTopic(id: string): Promise<void> {
  try {
    const topic = await db.topics.get(id);
    if (!topic) throw new NotFoundError('Topic', id);
    const [notes, flashcards] = await Promise.all([
      db.notes.where('topicId').equals(id).count(),
      db.flashcards.where('topicId').equals(id).count(),
    ]);
    if (notes + flashcards > 0) {
      throw new Error(`Topic cannot be deleted because it is referenced by ${notes + flashcards} item(s).`);
    }
    await db.topics.delete(id);
  } catch (err) {
    logger.error(`Failed to delete topic ${id}`, err);
    throw err instanceof Error && !(err instanceof DOMException) ? err : new StorageError('deleteTopic', err);
  }
}
