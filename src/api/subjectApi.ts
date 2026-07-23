import { db } from '../db/database';
import { Subject } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export interface SubjectReferences {
  tasks: number;
  notes: number;
  flashcards: number;
  sessions: number;
  topics: number;
  goals: number;
  aiConversations: number;
  totalReferences: number;
  isDeletable: boolean;
}

export async function validateSubjectName(name: string, excludeSubjectId?: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Subject name cannot be empty');
  }
  const all = await db.subjects.toArray();
  const duplicate = all.find(
    (s) => s.id !== excludeSubjectId && s.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A subject named '${duplicate.name}' already exists.`);
  }
  return true;
}

export async function addSubject(subject: Subject): Promise<void> {
  try {
    await validateSubjectName(subject.name);
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

export async function updateSubject(id: string, updates: Partial<Subject>): Promise<void> {
  try {
    if (updates.name !== undefined) {
      await validateSubjectName(updates.name, id);
    }
    await db.subjects.update(id, updates);
  } catch (err) {
    logger.error('Failed to update subject', err);
    throw new StorageError('updateSubject', err);
  }
}

export async function checkSubjectReferences(subjectId: string): Promise<SubjectReferences> {
  try {
    const tasks = await db.tasks.where('subjectId').equals(subjectId).count();
    const notes = await db.notes.where('subjectId').equals(subjectId).count();
    const flashcards = await db.flashcards.where('subjectId').equals(subjectId).count();
    const sessions = await db.sessions.where('subjectId').equals(subjectId).count();
    const topics = await db.topics.where('subjectId').equals(subjectId).count();
    const goals = await db.goals.where('subjectId').equals(subjectId).count();
    const aiConversations = await db.ai_conversations.where('subjectId').equals(subjectId).count();

    const totalReferences =
      tasks + notes + flashcards + sessions + topics + goals + aiConversations;

    return {
      tasks,
      notes,
      flashcards,
      sessions,
      topics,
      goals,
      aiConversations,
      totalReferences,
      isDeletable: totalReferences === 0,
    };
  } catch (err) {
    logger.error('Failed to check subject references', err);
    throw new StorageError('checkSubjectReferences', err);
  }
}

export async function deleteSubject(subjectId: string): Promise<void> {
  try {
    const refs = await checkSubjectReferences(subjectId);
    if (!refs.isDeletable) {
      throw new Error(
        `Subject cannot be deleted because it is still referenced by ${refs.totalReferences} item(s).`
      );
    }
    await db.subjects.delete(subjectId);
  } catch (err) {
    logger.error('Failed to delete subject', err);
    throw new StorageError('deleteSubject', err);
  }
}
