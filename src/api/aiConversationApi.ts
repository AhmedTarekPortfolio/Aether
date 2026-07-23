import { db } from '../db/database';
import { AIConversation } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function getAIConversations(): Promise<AIConversation[]> {
  try {
    return await db.ai_conversations.orderBy('timestamp').toArray();
  } catch (err) {
    logger.error('Failed to fetch AI conversations', err);
    throw new StorageError('getAIConversations', err);
  }
}

export async function addAIConversation(conversation: AIConversation): Promise<void> {
  try {
    await db.ai_conversations.add(conversation);
  } catch (err) {
    logger.error('Failed to add AI conversation', err);
    throw new StorageError('addAIConversation', err);
  }
}

export async function clearAIConversations(): Promise<void> {
  try {
    await db.ai_conversations.clear();
  } catch (err) {
    logger.error('Failed to clear AI conversations', err);
    throw new StorageError('clearAIConversations', err);
  }
}
