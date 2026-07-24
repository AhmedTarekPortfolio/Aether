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
import { addAIConversation } from '../../api/aiConversationApi';
import { buildSystemInstruction } from './systemPrompts';
import { aetherTransport, AITransportChatRequest } from './aetherTransport';

export interface SendAIOptions {
  streamHandlers?: AIStreamHandlers;
  signal?: AbortSignal;
}

class AIOrchestrator {
  private activeControllers: Map<string, AbortController> = new Map();

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
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Privacy Guard: Local Tools Only (Block external network calls)
    if (privacyMode === 'local_tools_only') {
      const excerpts = await performLocalRetrieval(promptText, input.selectedResourceIds);
      return {
        type: 'local_only_result',
        requestId,
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
        role: (h as any).role || 'user',
        content: (h as any).prompt || (h as any).content || '',
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
    const controller = new AbortController();
    this.activeControllers.set(prepared.requestId, controller);

    const signal = options?.signal || controller.signal;
    const profile = prepared.profileConfig;

    try {
      let finalContent = '';
      let finalReasoning = '';

      // Local provider: use adapter directly (no network call)
      if (profile.type === 'local') {
        const adapter = providerRegistry.getAdapterForProfile(profile);
        const aiRequest = {
          messages: prepared.normalizedRequest.messages,
          mode: prepared.preview.mode as any,
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

      // Persist Conversation Messages
      const now = Date.now();
      const lastUserMsg = prepared.normalizedRequest.messages[prepared.normalizedRequest.messages.length - 1]?.content || '';

      await addAIConversation({
        id: prepared.requestId,
        mode: prepared.preview.mode as any,
        prompt: lastUserMsg,
        response: finalContent,
        explanation: finalReasoning ? { confidence: 0.9, factors: [finalReasoning] } : undefined,
        timestamp: now,
        subjectId: prepared.profileConfig.id,
      }).catch(() => {
        console.error('[AI Orchestrator] Conversation persistence failed.');
      });

      const result: NormalizedAIResponse = {
        content: finalContent,
        reasoning: finalReasoning || undefined,
        model: prepared.profileConfig.modelId,
        providerId: prepared.profileConfig.id,
        providerName: prepared.profileConfig.name,
        finishReason: 'stop',
      };

      return result;
    } finally {
      this.activeControllers.delete(prepared.requestId);
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
