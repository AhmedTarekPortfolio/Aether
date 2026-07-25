import {
  PrepareAIInput,
  PreparedAIRequest,
  LocalOnlyResult,
  NormalizedAIResponse,
  NormalizedAIRequest,
  NormalizedChatMessage,
  RequestPreviewMetadata,
  AIStreamHandlers,
} from './types';
import { getActiveProviderProfile, getProviderProfiles } from './providerProfiles';
import { providerRegistry } from './providerRegistry';
import { performLocalRetrieval } from './localRetrieval';
import {
  addAIConversation,
  getAIConversations,
} from '../../api/aiConversationApi';
import { buildSystemInstruction } from './systemPrompts';
import { aetherTransport, AITransportChatRequest } from './aetherTransport';
import type { AIConversation } from '../../types';

export interface SendAIOptions {
  streamHandlers?: AIStreamHandlers;
  signal?: AbortSignal;
}

export interface AIDuplicateConversationMatch {
  firstId: string;
  duplicateId: string;
}

export type AIConversationReadStatus =
  | 'complete'
  | 'stopped'
  | 'failed'
  | 'legacy-prompt-only'
  | 'invalid'
  | 'unknown';

export class AIConversationPersistenceError extends Error {
  readonly content: string;

  constructor(content: string) {
    super('The generated response could not be saved safely.');
    this.name = 'AIConversationPersistenceError';
    this.content = content;
  }
}

const MAX_ID_COLLISION_RETRIES = 3;
const DUPLICATE_TIMESTAMP_WINDOW_MS = 2_000;

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function isPrimaryKeyCollision(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'ConstraintError') return true;
  const candidate = error as { name?: unknown; message?: unknown };
  const combined = `${String(candidate?.name ?? '')} ${String(candidate?.message ?? '')}`;
  return /constraint|key already exists|primary key|collision/i.test(combined);
}

function isCancellation(error: unknown): boolean {
  const candidate = error as { name?: unknown; message?: unknown };
  return candidate?.name === 'AbortError'
    || /abort|cancel/i.test(String(candidate?.message ?? ''));
}

export function readAIConversationGenerationStatus(
  conversation: AIConversation | Record<string, unknown>,
): AIConversationReadStatus {
  const status = conversation.generationStatus;
  if (status === 'complete' || status === 'stopped' || status === 'failed') return status;
  if (status !== undefined) return 'unknown';
  const response = conversation.response ?? conversation.content;
  if (typeof response === 'string' && response.trim().length > 0) return 'complete';
  if (typeof conversation.prompt === 'string' && conversation.prompt.trim().length > 0) {
    console.warn('[AI Orchestrator] A legacy prompt-only conversation has no generation status.');
    return 'legacy-prompt-only';
  }
  return 'invalid';
}

export async function findDuplicateAIConversations(): Promise<AIDuplicateConversationMatch[]> {
  const conversations = await getAIConversations();
  const matches: AIDuplicateConversationMatch[] = [];

  for (let leftIndex = 0; leftIndex < conversations.length; leftIndex += 1) {
    const left = conversations[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < conversations.length; rightIndex += 1) {
      const right = conversations[rightIndex];
      if (
        left.prompt === right.prompt
        && left.response === right.response
        && Math.abs(left.timestamp - right.timestamp) <= DUPLICATE_TIMESTAMP_WINDOW_MS
      ) {
        matches.push({ firstId: left.id, duplicateId: right.id });
      }
    }
  }

  return matches;
}

class AIOrchestrator {
  private activeControllers: Map<string, AbortController> = new Map();

  private async persistConversation(record: AIConversation): Promise<AIConversation> {
    let candidate = { ...record };
    let collisionRetries = 0;

    while (true) {
      try {
        await addAIConversation(candidate);
        return candidate;
      } catch (error) {
        if (!isPrimaryKeyCollision(error) || collisionRetries >= MAX_ID_COLLISION_RETRIES) {
          console.error('[AI Orchestrator] Conversation persistence failed safely.');
          throw new AIConversationPersistenceError(
            candidate.response || candidate.content || '',
          );
        }
        collisionRetries += 1;
        candidate = { ...candidate, id: createRequestId() };
      }
    }
  }

  async persistLocalOnlyResult(result: LocalOnlyResult): Promise<AIConversation | null> {
    const content = result.message.trim();
    if (!content) return null;

    const persisted = await this.persistConversation({
      id: result.requestId,
      userId: result.userId,
      subjectId: result.subjectId ?? null,
      taskId: result.taskId ?? null,
      role: 'assistant',
      mode: result.mode,
      prompt: result.prompt,
      response: content,
      content,
      timestamp: Date.now(),
      generationStatus: 'complete',
    });
    result.requestId = persisted.id;
    return persisted;
  }

  /**
   * Phase 1: Request Preparation (0 Network Calls)
   * Resolves resources, enforces privacy, limits history, builds request preview.
   */
  async prepare(input: PrepareAIInput): Promise<PreparedAIRequest | LocalOnlyResult> {
    const promptText = input.prompt.trim();
    if (!promptText) {
      throw new Error('Prompt input cannot be empty.');
    }

    const privacyMode = input.privacyMode || 'standard';
    const requestId = createRequestId();

    // Privacy Guard: Local Tools Only (Block external network calls)
    if (privacyMode === 'local_tools_only') {
      const excerpts = await performLocalRetrieval(promptText, input.selectedResourceIds);
      return {
        type: 'local_only_result',
        requestId,
        userId: input.userId,
        subjectId: input.subjectId,
        taskId: input.taskId,
        prompt: promptText,
        mode: input.mode,
        excerpts,
        message: excerpts.length > 0
          ? `Local Search Results (${excerpts.length} matching excerpts found). Provider network calls blocked by Local Tools Only mode.`
          : 'The selected resources do not contain enough information to answer this question.',
        isNoEvidenceWarning: excerpts.length === 0,
      };
    }

    // Resolve Provider Profile
    const profiles = getProviderProfiles();
    const activeProfile = input.profileId
      ? profiles.find((p) => p.id === input.profileId) || getActiveProviderProfile()
      : getActiveProviderProfile();

    // Local Retrieval
    const excerpts = await performLocalRetrieval(promptText, input.selectedResourceIds);

    // Ask Resources Mode No-Evidence Guard
    if (input.mode === 'ask_resources' && excerpts.length === 0) {
      return {
        type: 'local_only_result',
        requestId,
        userId: input.userId,
        subjectId: input.subjectId,
        taskId: input.taskId,
        prompt: promptText,
        mode: input.mode,
        excerpts: [],
        message: 'The selected resources do not contain enough information to answer this question.',
        isNoEvidenceWarning: true,
      };
    }

    // History Limiting (Latest 12 messages)
    const rawHistory = input.conversationHistory || [];
    const limitedHistory = privacyMode === 'sensitive_study_mode' ? [] : rawHistory.slice(-12);

    // Message Formatting
    const messages: NormalizedChatMessage[] = [
      ...limitedHistory.map((h) => ({
        role: h.role || 'user',
        content: h.prompt || h.content || '',
      })),
      { role: 'user', content: promptText },
    ];

    // Resource Context System Instruction Enhancement
    let resourceSystemAddendum = '';
    if (excerpts.length > 0) {
      resourceSystemAddendum = '\n\nReference Resources:\n' +
        excerpts.map((e) => `[${e.sourceId}] ${e.title}${e.section ? ` (${e.section})` : ''}:\n${e.excerpt}`).join('\n\n');
    }

    const baseSystemPrompt = buildSystemInstruction({
      messages,
      mode: input.mode,
      profileConfig: activeProfile,
    });

    const systemInstruction = baseSystemPrompt + resourceSystemAddendum;

    const normalizedRequest: NormalizedAIRequest = {
      model: activeProfile.modelId,
      messages,
      systemInstruction,
      temperature: activeProfile.temperature ?? 0.7,
      maximumOutputTokens: activeProfile.maxOutputTokens || 1024,
      stream: activeProfile.type !== 'local',
    };

    const estimatedInputChars = systemInstruction.length + promptText.length;

    const preview: RequestPreviewMetadata = {
      providerId: activeProfile.id,
      providerName: activeProfile.name,
      modelId: activeProfile.modelId,
      mode: input.mode,
      historyMessageCount: limitedHistory.length,
      attachedResources: excerpts,
      estimatedInputChars,
      privacyMode,
    };

    return {
      type: 'prepared_request',
      requestId,
      userId: input.userId,
      subjectId: input.subjectId,
      taskId: input.taskId,
      normalizedRequest,
      profileConfig: activeProfile,
      preview,
      requiresConfirmation: privacyMode === 'ask_before_sending',
    };
  }

  /**
   * Phase 2: Request Execution & Transport
   * For local providers: uses LocalTemplateAdapter directly.
   * For all external providers: routes through Aether's secure backend proxy via aetherTransport.
   * The frontend never contacts external provider URLs or handles raw API keys.
   */
  async send(prepared: PreparedAIRequest, options?: SendAIOptions): Promise<NormalizedAIResponse> {
    const activeRequestId = prepared.requestId;
    const controller = new AbortController();
    this.activeControllers.set(activeRequestId, controller);

    const signal = options?.signal || controller.signal;
    const profile = prepared.profileConfig;
    let finalContent = '';
    let finalReasoning = '';

    try {
      // Local provider: use adapter directly (no network call)
      if (profile.type === 'local') {
        const adapter = providerRegistry.getAdapterForProfile(profile);
        const aiRequest = {
          messages: prepared.normalizedRequest.messages,
          mode: prepared.preview.mode,
          profileConfig: profile,
          normalizedRequest: prepared.normalizedRequest,
        };

        const response = await adapter.generate(aiRequest, signal);
        finalContent = response.content;
        finalReasoning = response.reasoning || '';
      } else {
        // External provider: route through secure backend proxy
        const transportRequest: AITransportChatRequest = {
          requestId: prepared.requestId,
          profileId: profile.id,
          providerType: profile.type,
          baseUrl: profile.baseUrl || '',
          endpoint: profile.endpointPath,
          model: prepared.normalizedRequest.model,
          messages: prepared.normalizedRequest.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemInstruction: prepared.normalizedRequest.systemInstruction,
          temperature: prepared.normalizedRequest.temperature,
          maxTokens: prepared.normalizedRequest.maximumOutputTokens,
          stream: !!(options?.streamHandlers),
          extraBody: prepared.normalizedRequest.extraBody,
        };

        if (options?.streamHandlers) {
          // Streaming via proxy
          await aetherTransport.stream(
            transportRequest,
            {
              onToken: (token) => {
                finalContent += token;
                options.streamHandlers?.onToken(token);
              },
              onReasoningToken: (token) => {
                finalReasoning += token;
                options.streamHandlers?.onReasoningToken?.(token);
              },
              onComplete: (content, reasoning) => {
                finalContent = content || finalContent;
                finalReasoning = reasoning || finalReasoning;
                options.streamHandlers?.onComplete(finalContent, finalReasoning);
              },
              onError: (err) => options.streamHandlers?.onError(err),
            },
            signal
          );
        } else {
          // Non-streaming via proxy
          const response = await aetherTransport.send(transportRequest, signal);
          finalContent = response.content;
          finalReasoning = response.reasoning || '';
        }
      }

      if (!finalContent.trim()) {
        throw new Error('The AI provider returned an empty response.');
      }

      const lastUserMsg = prepared.normalizedRequest.messages[prepared.normalizedRequest.messages.length - 1]?.content || '';
      const persisted = await this.persistConversation({
        id: prepared.requestId,
        userId: prepared.userId,
        subjectId: prepared.subjectId ?? null,
        taskId: prepared.taskId ?? null,
        role: 'assistant',
        mode: prepared.preview.mode,
        prompt: lastUserMsg,
        response: finalContent,
        content: finalContent,
        explanation: finalReasoning ? { confidence: 0.9, factors: [finalReasoning] } : undefined,
        timestamp: Date.now(),
        providerId: profile.id,
        providerName: profile.name,
        modelId: profile.modelId,
        generationStatus: 'complete',
      });
      prepared.requestId = persisted.id;

      const result: NormalizedAIResponse = {
        content: finalContent,
        reasoning: finalReasoning || undefined,
        model: prepared.profileConfig.modelId,
        providerId: prepared.profileConfig.id,
        providerName: prepared.profileConfig.name,
        finishReason: 'stop',
      };

      return result;
    } catch (error) {
      if (error instanceof AIConversationPersistenceError) throw error;

      if (finalContent.trim().length > 0) {
        const lastUserMsg = prepared.normalizedRequest.messages[
          prepared.normalizedRequest.messages.length - 1
        ]?.content || '';
        await this.persistConversation({
          id: prepared.requestId,
          userId: prepared.userId,
          subjectId: prepared.subjectId ?? null,
          taskId: prepared.taskId ?? null,
          role: 'assistant',
          mode: prepared.preview.mode,
          prompt: lastUserMsg,
          response: finalContent,
          content: finalContent,
          explanation: finalReasoning
            ? { confidence: 0.9, factors: [finalReasoning] }
            : undefined,
          timestamp: Date.now(),
          providerId: profile.id,
          providerName: profile.name,
          modelId: profile.modelId,
          generationStatus: isCancellation(error) ? 'stopped' : 'failed',
        });
      }
      throw error;
    } finally {
      this.activeControllers.delete(activeRequestId);
    }
  }

  cancel(requestId: string): void {
    const controller = this.activeControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(requestId);
    }
  }
}

export const aiOrchestrator = new AIOrchestrator();
