import {
  AIProviderAdapter,
  AIRequest,
  AIStreamHandlers,
  AIProviderResponse,
  AIModelOption,
  AIConnectionTestResult,
} from '../types';
import { AIProviderProfile } from '../../../types';
import { buildSystemInstruction } from '../systemPrompts';
import { getCredentials } from '../credentialStore';
import { SSEStreamParser } from '../streaming/sseParser';

export class OpenAICompatibleAdapter implements AIProviderAdapter {
  id = 'openai_compatible';
  name = 'OpenAI Compatible Provider';
  supportsStreaming = true;
  supportsModelDiscovery = true;

  private getCleanBaseUrl(url?: string): string {
    if (!url || !url.trim()) return 'https://api.openai.com/v1';
    return url.trim().replace(/\/+$/, '');
  }

  private getHeaders(profileId: string): Record<string, string> {
    const creds = getCredentials(profileId);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey && creds.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${creds.apiKey.trim()}`;
    }
    if (creds.organizationId && creds.organizationId.trim()) {
      headers['OpenAI-Organization'] = creds.organizationId.trim();
    }
    return headers;
  }

  async generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const { messages, profileConfig } = request;
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const endpoint = `${baseUrl}/chat/completions`;

    const systemPrompt = buildSystemInstruction(request);
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const body: Record<string, any> = {
      model: profileConfig.modelId || 'gpt-4o-mini',
      messages: apiMessages,
      temperature: profileConfig.temperature ?? 0.7,
    };

    if (profileConfig.maxOutputTokens) {
      body.max_tokens = profileConfig.maxOutputTokens;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(profileConfig.id),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed: Invalid API key or unauthorized access.');
        } else if (response.status === 404) {
          throw new Error(`Model '${profileConfig.modelId}' or endpoint not found (404).`);
        } else {
          throw new Error(`API Error (${response.status}): ${errText.slice(0, 120) || response.statusText}`);
        }
      }

      const data = await response.json();
      const choiceMsg = data.choices?.[0]?.message;
      const content = choiceMsg?.content || '';
      const reasoning = choiceMsg?.reasoning || choiceMsg?.reasoning_content || undefined;

      return {
        content,
        reasoning,
        providerId: profileConfig.id,
        providerName: profileConfig.name,
        modelId: profileConfig.modelId,
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw new Error('Generation cancelled by user.');
      }
      throw new Error(err.message || 'Failed to connect to AI provider endpoint.');
    }
  }

  async stream(request: AIRequest, handlers: AIStreamHandlers, signal?: AbortSignal): Promise<void> {
    const { messages, profileConfig } = request;
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const endpoint = `${baseUrl}/chat/completions`;

    const systemPrompt = buildSystemInstruction(request);
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const body: Record<string, any> = {
      model: profileConfig.modelId || 'gpt-4o-mini',
      messages: apiMessages,
      temperature: profileConfig.temperature ?? 0.7,
      stream: true,
    };

    if (profileConfig.maxOutputTokens) {
      body.max_tokens = profileConfig.maxOutputTokens;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(profileConfig.id),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed: Invalid API key.');
        }
        throw new Error(`Stream API error (${response.status}): ${errText.slice(0, 120)}`);
      }

      if (!response.body) {
        const res = await this.generate(request, signal);
        handlers.onToken(res.content);
        handlers.onComplete(res.content);
        return;
      }

      const reader = response.body.getReader();
      const parser = new SSEStreamParser();
      let accumulatedText = '';

      while (true) {
        if (signal?.aborted) {
          reader.cancel().catch(() => {});
          handlers.onError(new Error('Streaming cancelled by user.'));
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const { tokens, isDone } = parser.parseChunk(value);
        for (const token of tokens) {
          accumulatedText += token;
          handlers.onToken(token);
        }

        if (isDone) break;
      }

      const flushedTokens = parser.flush();
      for (const token of flushedTokens) {
        accumulatedText += token;
        handlers.onToken(token);
      }

      handlers.onComplete(accumulatedText);
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        handlers.onError(new Error('Streaming cancelled by user.'));
      } else {
        handlers.onError(err);
      }
    }
  }

  async testConnection(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const endpoint = `${baseUrl}/chat/completions`;
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(profileConfig.id),
        body: JSON.stringify({
          model: profileConfig.modelId || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 1,
        }),
        signal,
      });

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          status: 'Connected',
          message: `Connection successful (${latencyMs}ms latency).`,
          latencyMs,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          status: 'Authentication failed',
          message: 'API Key or authorization credentials were rejected by the server (401/403).',
          latencyMs,
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          status: 'Model not found',
          message: `The endpoint URL or model ID '${profileConfig.modelId}' was not found (404).`,
          latencyMs,
        };
      }

      const errBody = await response.text().catch(() => '');
      return {
        success: false,
        status: 'Unsupported response format',
        message: `Endpoint returned HTTP ${response.status}: ${errBody.slice(0, 100)}`,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;

      if (err.name === 'AbortError') {
        return {
          success: false,
          status: 'Request timed out',
          message: 'Connection request timed out.',
          latencyMs,
        };
      }

      if (err.message && err.message.includes('Failed to fetch')) {
        return {
          success: false,
          status: 'Network unavailable',
          message: 'Network error contacting provider endpoint.',
          latencyMs,
        };
      }

      return {
        success: false,
        status: 'Network unavailable',
        message: err.message || 'Unable to reach the provider endpoint.',
        latencyMs,
      };
    }
  }

  async listModels(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIModelOption[]> {
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const endpoint = `${baseUrl}/models`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.getHeaders(profileConfig.id),
        signal,
      });

      if (!response.ok) return [];

      const data = await response.json();
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

      const models: AIModelOption[] = rawList
        .map((m: any) => ({
          id: typeof m === 'string' ? m : m.id || m.name,
          name: typeof m === 'string' ? m : m.id || m.name,
          description: m.owned_by ? `By ${m.owned_by}` : undefined,
        }))
        .filter((m: AIModelOption) => m.id && typeof m.id === 'string');

      const seen = new Set<string>();
      return models.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    } catch {
      return [];
    }
  }
}
