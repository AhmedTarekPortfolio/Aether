import { db } from '../db/database';
import { AIGroundingRecord } from '../types';
import { logger } from '../services/logger';
import { StorageError } from './errors';

export async function addAIGroundingRecord(record: AIGroundingRecord): Promise<void> {
  try {
    if (!record.userId || !await db.users.get(record.userId)) {
      throw new Error('Grounding record user does not exist');
    }
    if (!record.requestId) throw new Error('requestId is required');
    if (!record.conversationId) throw new Error('conversationId is required');
    if (!record.assistantMessageId) throw new Error('assistantMessageId is required');
    if (!record.evidenceLabel) throw new Error('evidenceLabel is required');
    if (!record.evidenceType) throw new Error('evidenceType is required');
    if (!record.displayTitle) throw new Error('displayTitle is required');
    if (!record.locatorSnapshot) throw new Error('locatorSnapshot is required');
    if (!record.excerptSnapshot) throw new Error('excerptSnapshot is required');
    if (!/^[a-f0-9]{64}$/.test(record.excerptHash)) {
      throw new Error('excerptHash must be 64-character lowercase hex SHA-256');
    }
    if (!Number.isSafeInteger(record.sentOrder) || record.sentOrder < 1) {
      throw new Error('sentOrder must be a positive safe integer');
    }

    // Verify conversation exists
    const conversation = await db.ai_conversations.get(record.conversationId);
    if (!conversation) throw new Error('Conversation does not exist');
    if ((conversation.userId ?? 'default_user') !== record.userId) {
      throw new Error('Conversation user mismatch');
    }

    // Historical navigation pointers may already be absent after purge. When
    // present, they must never cross user or lineage boundaries.
    if (record.noteId) {
      const note = await db.notes.get(record.noteId);
      if (note && (note.userId ?? 'default_user') !== record.userId) {
        throw new Error('Note user mismatch');
      }
    }

    if (record.sourceId) {
      const source = await db.study_sources.get(record.sourceId);
      if (source && source.userId !== record.userId) throw new Error('Source user mismatch');
    }
    if (record.sourceVersionId) {
      const version = await db.source_versions.get(record.sourceVersionId);
      if (version) {
        if (version.userId !== record.userId) throw new Error('Source version user mismatch');
        if (record.sourceId && version.sourceId !== record.sourceId) {
          throw new Error('Source version does not belong to the referenced source');
        }
      }
    }
    if (record.segmentId) {
      const segment = await db.source_segments.get(record.segmentId);
      if (segment) {
        if (segment.userId !== record.userId) throw new Error('Source segment user mismatch');
        if (record.sourceId && segment.sourceId !== record.sourceId) {
          throw new Error('Source segment does not belong to the referenced source');
        }
        if (record.sourceVersionId && segment.sourceVersionId !== record.sourceVersionId) {
          throw new Error('Source segment does not belong to the referenced version');
        }
      }
    }

    await db.ai_grounding_records.add(record);
  } catch (err) {
    logger.error('Failed to add AI grounding record', err);
    throw new StorageError('addAIGroundingRecord', err);
  }
}

export async function addAIGroundingRecordsBulk(records: AIGroundingRecord[]): Promise<void> {
  try {
    await db.transaction(
      'rw',
      [
        db.ai_grounding_records,
        db.users,
        db.ai_conversations,
        db.notes,
        db.study_sources,
        db.source_versions,
        db.source_segments,
      ],
      async () => {
        for (const record of records) {
          await addAIGroundingRecord(record);
        }
      },
    );
  } catch (err) {
    logger.error('Failed to bulk add AI grounding records', err);
    throw new StorageError('addAIGroundingRecordsBulk', err);
  }
}

export async function getAIGroundingRecordsByRequest(requestId: string): Promise<AIGroundingRecord[]> {
  try {
    return await db.ai_grounding_records.where('requestId').equals(requestId).sortBy('sentOrder');
  } catch (err) {
    logger.error('Failed to fetch AI grounding records by request', err);
    throw new StorageError('getAIGroundingRecordsByRequest', err);
  }
}

export async function getAIGroundingRecordsByConversation(conversationId: string): Promise<AIGroundingRecord[]> {
  try {
    return await db.ai_grounding_records
      .where('conversationId')
      .equals(conversationId)
      .sortBy('sentOrder');
  } catch (err) {
    logger.error('Failed to fetch AI grounding records by conversation', err);
    throw new StorageError('getAIGroundingRecordsByConversation', err);
  }
}

export async function getAIGroundingRecordsByConversationAndMessage(
  conversationId: string,
  assistantMessageId: string
): Promise<AIGroundingRecord[]> {
  try {
    return await db.ai_grounding_records
      .where('[conversationId+assistantMessageId]')
      .equals([conversationId, assistantMessageId])
      .sortBy('sentOrder');
  } catch (err) {
    logger.error('Failed to fetch AI grounding records by conversation and message', err);
    throw new StorageError('getAIGroundingRecordsByConversationAndMessage', err);
  }
}

export async function getAIGroundingRecordsBySource(sourceId: string): Promise<AIGroundingRecord[]> {
  try {
    return await db.ai_grounding_records.where('sourceId').equals(sourceId).toArray();
  } catch (err) {
    logger.error('Failed to fetch AI grounding records by source', err);
    throw new StorageError('getAIGroundingRecordsBySource', err);
  }
}
