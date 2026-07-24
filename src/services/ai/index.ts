import {
  AIRequest,
  AIStreamHandlers,
  AIProviderResponse,
  AIConnectionTestResult,
  AIModelOption,
} from './types';
import { AIProviderProfile, AIInteraction, UserProfile, Subject, Task } from '../../types';
import { providerRegistry } from './providerRegistry';
import { aetherTransport } from './aetherTransport';
import { buildSystemInstruction } from './systemPrompts';
import {
  getActiveProviderProfile,
  getProviderProfiles,
  saveProfile,
  deleteProfile,
  setActiveProviderProfile,
  sanitizeProfileForExport,
  getDefaultConfigForType,
  LOCAL_PROVIDER_ID,
} from './providerProfiles';
import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  maskApiKey,
  getCredentialStatus,
} from './credentialStore';

/**
 * Generate AI Response using active profile or provided request.
 * For local providers: uses adapter directly.
 * For external providers: routes through the secure backend proxy.
 */
export async function generateAIResponse(
  prompt: string,
  mode: AIInteraction['mode'],
  profile: UserProfile,
  context?: { subject?: Subject; task?: Task },
  customProfile?: AIProviderProfile,
  signal?: AbortSignal
): Promise<AIProviderResponse> {
  const profileConfig = customProfile || getActiveProviderProfile();

  // Local provider: use adapter directly (no network call)
  if (profileConfig.type === 'local') {
    const adapter = providerRegistry.getAdapterForProfile(profileConfig);
    const request: AIRequest = {
      messages: [{ role: 'user', content: prompt }],
      mode,
      profile,
      subject: context?.subject,
      task: context?.task,
      profileConfig,
    };
    return adapter.generate(request, signal);
  }

  // External providers: route through secure proxy
  const systemInstruction = buildSystemInstruction({
    messages: [{ role: 'user', content: prompt }],
    mode,
    profileConfig,
  });

  const response = await aetherTransport.send(
    {
      profileId: profileConfig.id,
      providerType: profileConfig.type,
      baseUrl: profileConfig.baseUrl || '',
      endpoint: profileConfig.endpointPath,
      model: profileConfig.modelId || '',
      messages: [{ role: 'user', content: prompt }],
      systemInstruction,
      temperature: profileConfig.temperature,
      maxTokens: profileConfig.maxOutputTokens,
    },
    signal
  );

  return {
    content: response.content,
    reasoning: response.reasoning,
    providerId: profileConfig.id,
    providerName: profileConfig.name,
    modelId: profileConfig.modelId,
  };
}

/**
 * Stream AI Response using active profile or custom profile.
 * For local providers: uses adapter directly.
 * For external providers: routes through the secure backend proxy.
 */
export async function streamAIResponse(
  request: AIRequest,
  handlers: AIStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const profileConfig = request.profileConfig || getActiveProviderProfile();

  // Local provider: use adapter directly
  if (profileConfig.type === 'local') {
    const adapter = providerRegistry.getAdapterForProfile(profileConfig);
    if (adapter.supportsStreaming && adapter.stream) {
      return adapter.stream(request, handlers, signal);
    }
    try {
      const res = await adapter.generate(request, signal);
      handlers.onToken(res.content);
      handlers.onComplete(res.content);
    } catch (err: any) {
      handlers.onError(err);
    }
    return;
  }

  // External providers: route through secure proxy
  const systemInstruction = request.normalizedRequest?.systemInstruction ||
    buildSystemInstruction(request);

  await aetherTransport.stream(
    {
      profileId: profileConfig.id,
      providerType: profileConfig.type,
      baseUrl: profileConfig.baseUrl || '',
      endpoint: profileConfig.endpointPath,
      model: profileConfig.modelId || '',
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      systemInstruction,
      temperature: profileConfig.temperature,
      maxTokens: profileConfig.maxOutputTokens,
      extraBody: request.normalizedRequest?.extraBody,
    },
    handlers,
    signal
  );
}

/**
 * Test Connection for a provider profile.
 * Routes through the secure backend proxy for all external providers.
 */
export async function testProviderConnection(
  profileConfig: AIProviderProfile,
  signal?: AbortSignal
): Promise<AIConnectionTestResult> {
  // Local provider: test directly
  if (profileConfig.type === 'local') {
    const adapter = providerRegistry.getAdapterForProfile(profileConfig);
    return adapter.testConnection(profileConfig, signal);
  }

  // External providers: test through the secure proxy
  return aetherTransport.testConnection(
    {
      profileId: profileConfig.id,
      providerType: profileConfig.type,
      baseUrl: profileConfig.baseUrl || '',
      endpoint: profileConfig.endpointPath,
      model: profileConfig.modelId,
      timeoutMs: profileConfig.timeoutMs,
    },
    signal
  );
}

/**
 * Fetch available models for a provider profile.
 * Routes through the secure backend proxy.
 */
export async function listProviderModels(
  profileConfig: AIProviderProfile,
  signal?: AbortSignal
): Promise<AIModelOption[]> {
  // Local provider: no model discovery
  if (profileConfig.type === 'local') {
    return [];
  }

  return aetherTransport.listModels(
    {
      profileId: profileConfig.id,
      providerType: profileConfig.type,
      baseUrl: profileConfig.baseUrl || '',
    },
    signal
  );
}

export * from './types';
export * from './credentialStore';
export * from './providerProfiles';
export * from './providerRegistry';
export * from './systemPrompts';
export * from './orchestrator';
export * from './localRetrieval';
export * from './errorTaxonomy';
export * from './curlImporter';
export { aetherTransport } from './aetherTransport';
