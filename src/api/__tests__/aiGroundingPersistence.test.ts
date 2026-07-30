import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../../db/database';
import type { AIGroundingRecord, AIConversation } from '../../types';
import { addAIConversation, clearAIConversations } from '../aiConversationApi';
import { sha256Text } from '../../services/sources/textNormalisation';

describe('WP-LOCAL-05 atomic conversation grounding persistence', () => {
  let excerptHash = '';

  beforeEach(async () => {
    db.close();
    await Dexie.delete('AetherPhase1DB');
    await db.open();
    await db.users.add({
      id: 'u1', name: 'One', email: 'one@test.dev', academicLevel: 'UG', createdAt: 1, updatedAt: 1,
    });
    await db.subjects.add({
      id: 'subject-1', userId: 'u1', name: 'Biology', color: '#fff', confidenceRating: 0, createdAt: 1,
    });
    await db.notes.add({
      id: 'note-1', userId: 'u1', subjectId: 'subject-1',
      title: 'Cell note', content: 'ATP note evidence', tags: [], updatedAt: 1,
    });
    await db.study_sources.add({
      id: 'source-1', userId: 'u1', displayName: 'Cell PDF', sourceType: 'pdf',
      status: 'active', currentVersionId: 'version-1', createdAt: 1, updatedAt: 1,
      archivedAt: null, trashedAt: null, purgedAt: null,
    });
    await db.source_versions.add({
      id: 'version-1', userId: 'u1', sourceId: 'source-1', versionNumber: 1,
      assetId: null, originalFilename: null, versionReason: 'import',
      processorFingerprint: 'test', status: 'ready', pageCount: 1, lineCount: null,
      segmentCount: 1, charCount: 19, errorCode: null, errorMessage: null,
      createdAt: 1, readyAt: 1,
    });
    const segmentText = 'ATP source evidence';
    await db.source_segments.add({
      id: 'segment-1', userId: 'u1', sourceId: 'source-1', sourceVersionId: 'version-1',
      ordinal: 1, segmentType: 'pdf_page', text: segmentText,
      textHash: await sha256Text(segmentText), heading: null, physicalPage: 1,
      printedPageLabel: '1', lineStart: null, lineEnd: null, timeStartMs: null,
      timeEndMs: null, boundingBox: null, confidence: null,
      extractionMethod: 'pdf_text', createdAt: 1,
    });
    excerptHash = await sha256Text('exact excerpt');
  });

  afterEach(() => db.close());

  function conversation(id = 'request-1'): AIConversation {
    return {
      id,
      userId: 'u1',
      subjectId: 'subject-1',
      role: 'assistant',
      mode: 'ask_resources',
      prompt: 'Where is ATP?',
      response: 'In the evidence [R1] [S1].',
      content: 'In the evidence [R1] [S1].',
      timestamp: 1,
      generationStatus: 'complete',
    };
  }

  function records(id = 'request-1'): AIGroundingRecord[] {
    return [
      {
        id: `${id}-grounding-1`, userId: 'u1', requestId: id,
        conversationId: id, assistantMessageId: id, evidenceLabel: 'R1',
        evidenceType: 'note', sourceId: null, sourceVersionId: null, segmentId: null,
        noteId: 'note-1', displayTitle: 'Cell note', locatorSnapshot: 'Note',
        excerptSnapshot: 'exact excerpt', excerptHash, sentOrder: 1, createdAt: 1,
      },
      {
        id: `${id}-grounding-2`, userId: 'u1', requestId: id,
        conversationId: id, assistantMessageId: id, evidenceLabel: 'S1',
        evidenceType: 'source_segment', sourceId: 'source-1', sourceVersionId: 'version-1',
        segmentId: 'segment-1', noteId: null, displayTitle: 'Cell PDF',
        locatorSnapshot: 'Physical page 1 (printed label 1)',
        excerptSnapshot: 'exact excerpt', excerptHash, sentOrder: 2, createdAt: 1,
      },
    ];
  }

  it('commits the conversation and all exact ordered grounding snapshots together', async () => {
    await addAIConversation(conversation(), records());
    expect(await db.ai_conversations.count()).toBe(1);
    const saved = (await db.ai_grounding_records.toArray())
      .sort((left, right) => left.sentOrder - right.sentOrder);
    expect(saved).toHaveLength(2);
    expect(saved.map((record) => [record.evidenceLabel, record.evidenceType, record.sentOrder]))
      .toEqual([['R1', 'note', 1], ['S1', 'source_segment', 2]]);
    expect(saved.every((record) =>
      record.excerptSnapshot === 'exact excerpt' && record.excerptHash === excerptHash)).toBe(true);
  });

  it('rolls back the conversation and every grounding row on any grounding failure', async () => {
    const invalid = records();
    invalid[1] = { ...invalid[1], excerptHash: 'a'.repeat(64) };
    await expect(addAIConversation(conversation(), invalid)).rejects.toThrow();
    expect(await db.ai_conversations.count()).toBe(0);
    expect(await db.ai_grounding_records.count()).toBe(0);
  });

  it('does not duplicate either side when the same request is retried', async () => {
    await addAIConversation(conversation(), records());
    await expect(addAIConversation(conversation(), records())).rejects.toThrow();
    expect(await db.ai_conversations.count()).toBe(1);
    expect(await db.ai_grounding_records.count()).toBe(2);
  });

  it('allows a missing historical note pointer while retaining its snapshot', async () => {
    await db.notes.delete('note-1');
    await addAIConversation(conversation(), [records()[0]]);
    expect((await db.ai_grounding_records.get('request-1-grounding-1'))?.excerptSnapshot)
      .toBe('exact excerpt');
  });

  it('clears conversations and their grounding records atomically', async () => {
    await addAIConversation(conversation(), records());
    await clearAIConversations();
    expect(await db.ai_conversations.count()).toBe(0);
    expect(await db.ai_grounding_records.count()).toBe(0);
  });
});
