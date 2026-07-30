import { db } from '../db/database';
import { AIGroundingRecord, AIConversation } from '../types';
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

export async function addAIConversation(
  conversation: AIConversation,
  groundingRecords: AIGroundingRecord[] = [],
): Promise<void> {
  try {
    if (groundingRecords.length === 0) {
      await db.ai_conversations.add(conversation);
      return;
    }
    const userId = conversation.userId ?? 'default_user';
    await db.transaction(
      'rw',
      [
        db.ai_conversations,
        db.ai_grounding_records,
        db.users,
        db.notes,
        db.study_sources,
        db.source_versions,
        db.source_segments,
      ],
      async () => {
        if (!await db.users.get(userId)) throw new Error('Conversation user does not exist');
        await db.ai_conversations.add(conversation);
        for (const record of groundingRecords) {
          if (
            record.userId !== userId
            || record.conversationId !== conversation.id
            || record.assistantMessageId !== conversation.id
            || record.requestId !== conversation.id
          ) throw new Error('Grounding record conversation identity mismatch');
          if (!/^[RS]\d+$/.test(record.evidenceLabel)) {
            throw new Error('Grounding evidence label is invalid');
          }
          if (!record.excerptSnapshot || !/^[a-f0-9]{64}$/.test(record.excerptHash)) {
            throw new Error('Grounding excerpt snapshot or hash is invalid');
          }
          if (!Number.isSafeInteger(record.sentOrder) || record.sentOrder < 1) {
            throw new Error('Grounding sent order is invalid');
          }
          if (record.evidenceType === 'note') {
            const note = record.noteId ? await db.notes.get(record.noteId) : undefined;
            if (note && (note.userId ?? 'default_user') !== userId) {
              throw new Error('Grounding note user mismatch');
            }
          } else if (record.evidenceType === 'source_segment') {
            const [source, version, segment] = await Promise.all([
              record.sourceId ? db.study_sources.get(record.sourceId) : undefined,
              record.sourceVersionId ? db.source_versions.get(record.sourceVersionId) : undefined,
              record.segmentId ? db.source_segments.get(record.segmentId) : undefined,
            ]);
            if (
              !source || source.userId !== userId
              || !version || version.userId !== userId || version.sourceId !== source.id
              || !segment || segment.userId !== userId
              || segment.sourceId !== source.id || segment.sourceVersionId !== version.id
            ) throw new Error('Grounding source lineage is invalid');
          }
          await db.ai_grounding_records.add(record);
        }
      },
    );
  } catch (err) {
    logger.error('Failed to add AI conversation safely', err);
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
