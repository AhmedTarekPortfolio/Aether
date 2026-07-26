import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIConversation } from '../../../types';
import * as aiConversationApi from '../../../api/aiConversationApi';
import * as noteApi from '../../../api/noteApi';
import * as subjectApi from '../../../api/subjectApi';
import { aetherTransport } from '../aetherTransport';
import {
  AIConversationPersistenceError,
  aiOrchestrator,
  findDuplicateAIConversations,
  readAIConversationGenerationStatus,
} from '../orchestrator';
import type { LocalOnlyResult, PreparedAIRequest } from '../types';

function preparedRequest(): PreparedAIRequest {
  return {
    type: 'prepared_request',
    requestId: 'req-original',
    userId: 'user-1',
    subjectId: 'subject-1',
    taskId: 'task-1',
    normalizedRequest: {
      model: 'model-1',
      messages: [{ role: 'user', content: 'Explain safely' }],
    },
    profileConfig: {
      id: 'provider-1',
      name: 'Provider One',
      type: 'openai_compatible',
      baseUrl: 'https://example.test/v1',
      modelId: 'model-1',
      temperature: 0.2,
      rememberApiKey: false,
      createdAt: 1,
      updatedAt: 1,
    },
    preview: {
      providerId: 'provider-1',
      providerName: 'Provider One',
      modelId: 'model-1',
      mode: 'tutor',
      historyMessageCount: 0,
      attachedResources: [],
      estimatedInputChars: 14,
      privacyMode: 'standard',
    },
    requiresConfirmation: false,
  };
}

function localOnlyResult(message = 'Local Search Results'): LocalOnlyResult {
  return {
    type: 'local_only_result',
    requestId: 'req-local',
    userId: 'user-1',
    subjectId: 'subject-1',
    taskId: 'task-1',
    prompt: 'Search my notes',
    mode: 'ask_resources',
    excerpts: [],
    message,
    isNoEvidenceWarning: true,
    outcome: 'no-evidence',
  };
}

describe('WP-07 AI persistence ownership and status hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(noteApi, 'getNotes').mockResolvedValue([]);
    vi.spyOn(subjectApi, 'getSubjects').mockResolvedValue([]);
    vi.spyOn(aiConversationApi, 'addAIConversation').mockResolvedValue();
    vi.spyOn(aiConversationApi, 'getAIConversations').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('propagates user, subject, and task context without reinterpretation', async () => {
    const result = await aiOrchestrator.prepare({
      prompt: 'Explain safely',
      mode: 'tutor',
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: null,
    });

    expect(result).toMatchObject({
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: null,
    });
  });

  it('persists one complete provider result with authoritative metadata and no forbidden fields', async () => {
    vi.spyOn(aetherTransport, 'send').mockResolvedValue({
      content: 'Safe answer',
      reasoning: 'Safe reasoning',
    });
    const prepared = preparedRequest();

    await expect(aiOrchestrator.send(prepared)).resolves.toMatchObject({
      content: 'Safe answer',
      providerId: 'provider-1',
      providerName: 'Provider One',
    });

    expect(aiConversationApi.addAIConversation).toHaveBeenCalledOnce();
    const record = vi.mocked(aiConversationApi.addAIConversation).mock.calls[0][0];
    expect(record).toMatchObject({
      id: 'req-original',
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: 'task-1',
      role: 'assistant',
      mode: 'tutor',
      prompt: 'Explain safely',
      response: 'Safe answer',
      content: 'Safe answer',
      providerId: 'provider-1',
      providerName: 'Provider One',
      modelId: 'model-1',
      generationStatus: 'complete',
    });
    expect(record).not.toHaveProperty('providerType');
    expect(record).not.toHaveProperty('error');
  });

  it.each([
    ['stopped', new DOMException('Operation aborted', 'AbortError'), 'stopped'],
    ['failed', new Error('provider failed with sk-private-value'), 'failed'],
  ] as const)('persists a %s partial stream once without raw error data', async (
    _outcome,
    failure,
    expectedStatus,
  ) => {
    vi.spyOn(aetherTransport, 'stream').mockImplementation(async (_request, handlers) => {
      handlers.onToken('Partial answer');
      throw failure;
    });
    const prepared = preparedRequest();

    await expect(aiOrchestrator.send(prepared, {
      streamHandlers: {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      },
    })).rejects.toThrow();

    expect(aiConversationApi.addAIConversation).toHaveBeenCalledOnce();
    const record = vi.mocked(aiConversationApi.addAIConversation).mock.calls[0][0];
    expect(record.response).toBe('Partial answer');
    expect(record.generationStatus).toBe(expectedStatus);
    expect(JSON.stringify(record)).not.toContain('sk-private-value');
    expect(record).not.toHaveProperty('error');
  });

  it.each([
    ['stopped', new DOMException('Operation aborted', 'AbortError')],
    ['failed', new Error('provider failed')],
  ])('does not persist a %s zero-output outcome', async (_outcome, failure) => {
    vi.spyOn(aetherTransport, 'send').mockRejectedValue(failure);

    await expect(aiOrchestrator.send(preparedRequest())).rejects.toThrow();

    expect(aiConversationApi.addAIConversation).not.toHaveBeenCalled();
  });

  it('rejects a successful transport with empty output without persisting it', async () => {
    vi.spyOn(aetherTransport, 'send').mockResolvedValue({ content: '   ' });

    await expect(aiOrchestrator.send(preparedRequest())).rejects.toThrow(/empty response/i);

    expect(aiConversationApi.addAIConversation).not.toHaveBeenCalled();
  });

  it('persists local-only and no-evidence durable results through the same owner', async () => {
    const result = localOnlyResult('No matching evidence was found.');

    await expect(aiOrchestrator.persistLocalOnlyResult(result)).resolves.toMatchObject({
      userId: 'user-1',
      subjectId: 'subject-1',
      taskId: 'task-1',
      prompt: 'Search my notes',
      response: 'No matching evidence was found.',
      generationStatus: 'complete',
    });

    expect(aiConversationApi.addAIConversation).toHaveBeenCalledOnce();
    const record = vi.mocked(aiConversationApi.addAIConversation).mock.calls[0][0];
    expect(record).not.toHaveProperty('providerId');
    expect(record).not.toHaveProperty('providerName');
    expect(record).not.toHaveProperty('modelId');
  });

  it('leaves empty local-only results transient', async () => {
    await expect(aiOrchestrator.persistLocalOnlyResult(localOnlyResult('   '))).resolves.toBeNull();
    expect(aiConversationApi.addAIConversation).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('retries a primary-key collision successfully on retry %i', async (retry) => {
    const add = vi.mocked(aiConversationApi.addAIConversation);
    for (let attempt = 0; attempt < retry; attempt += 1) {
      add.mockRejectedValueOnce(new DOMException('Key already exists', 'ConstraintError'));
    }
    add.mockResolvedValueOnce();
    vi.spyOn(aetherTransport, 'send').mockResolvedValue({ content: 'Collision-safe answer' });
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.3);
    const prepared = preparedRequest();

    await aiOrchestrator.send(prepared);

    expect(add).toHaveBeenCalledTimes(retry + 1);
    expect(new Set(add.mock.calls.map(([record]) => record.id)).size).toBe(retry + 1);
    expect(prepared.requestId).toBe(add.mock.calls[retry][0].id);
  });

  it('stops after three collision retries without overwriting and preserves response text', async () => {
    vi.mocked(aiConversationApi.addAIConversation).mockRejectedValue(
      new DOMException('Key already exists', 'ConstraintError'),
    );
    vi.spyOn(aetherTransport, 'send').mockResolvedValue({ content: 'Unsaved answer' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = await aiOrchestrator.send(preparedRequest()).catch((caught) => caught);

    expect(aiConversationApi.addAIConversation).toHaveBeenCalledTimes(4);
    expect(error).toBeInstanceOf(AIConversationPersistenceError);
    expect(error.content).toBe('Unsaved answer');
  });

  it('reports historical duplicates without any write, delete, or merge', async () => {
    const conversations: AIConversation[] = [
      { id: 'a', mode: 'tutor', prompt: 'P', response: 'R', timestamp: 1_000 },
      { id: 'b', mode: 'tutor', prompt: 'P', response: 'R', timestamp: 2_999 },
      { id: 'c', mode: 'tutor', prompt: 'P', response: 'R', timestamp: 5_100 },
    ];
    vi.mocked(aiConversationApi.getAIConversations).mockResolvedValue(conversations);

    await expect(findDuplicateAIConversations()).resolves.toEqual([
      { firstId: 'a', duplicateId: 'b' },
    ]);
    expect(aiConversationApi.addAIConversation).not.toHaveBeenCalled();
    expect(conversations.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('interprets historical statuses at read time without mutating records', () => {
    const missingWithResponse: AIConversation = {
      id: 'legacy-response',
      mode: 'tutor',
      response: 'Legacy answer',
      timestamp: 1,
    };
    const promptOnly: AIConversation = {
      id: 'legacy-prompt',
      mode: 'tutor',
      prompt: 'Legacy prompt',
      timestamp: 2,
    };
    const unknown = {
      id: 'legacy-unknown',
      mode: 'tutor',
      response: 'Answer',
      timestamp: 3,
      generationStatus: 'pending',
    };
    const promptWarning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(readAIConversationGenerationStatus(missingWithResponse)).toBe('complete');
    expect(readAIConversationGenerationStatus(promptOnly)).toBe('legacy-prompt-only');
    expect(readAIConversationGenerationStatus(unknown)).toBe('unknown');
    expect(missingWithResponse).not.toHaveProperty('generationStatus');
    expect(promptOnly).not.toHaveProperty('generationStatus');
    expect(unknown.generationStatus).toBe('pending');
    expect(promptWarning).toHaveBeenCalledOnce();
  });
});
