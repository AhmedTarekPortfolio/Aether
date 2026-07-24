import {
  NormalizedAIResponse,
  AIConnectionTestResult,
  AIModelOption,
  AIStreamHandlers,
} from '../services/ai/types';
import { CredentialStatus } from '../services/ai/aetherTransport';

const getAiBase = () => {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http')) {
    return '/api/ai';
  }
  return 'http://localhost:3001/api/ai';
};

export const browserFallback = {
  async send(request: any, signal?: AbortSignal): Promise<NormalizedAIResponse> {
    const res = await fetch(`${getAiBase()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream: false }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `Error (${res.status})` }));
      throw new Error(err.message || `Proxy error (${res.status})`);
    }
    return res.json();
  },

  async stream(request: any, handlers: AIStreamHandlers, signal?: AbortSignal): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${getAiBase()}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, stream: true }),
        signal,
      });
    } catch (err: any) {
      handlers.onError(err);
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `Stream error (${res.status})` }));
      handlers.onError(new Error(err.message || `Stream error (${res.status})`));
      return;
    }

    if (!res.body) {
      try {
        const data = await res.json();
        handlers.onToken(data.content || '');
        handlers.onComplete(data.content || '', data.reasoning);
      } catch (e: any) {
        handlers.onError(e);
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedContent = '';
    let accumulatedReasoning = '';

    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        handlers.onError(new Error('Streaming cancelled by user.'));
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(trimmed.slice(6));
          if (event.type === 'token' && event.text) {
            accumulatedContent += event.text;
            handlers.onToken(event.text);
          } else if (event.type === 'reasoning' && event.text) {
            accumulatedReasoning += event.text;
            handlers.onReasoningToken?.(event.text);
          } else if (event.type === 'done') {
            handlers.onComplete(event.content || accumulatedContent, event.reasoning || accumulatedReasoning || undefined);
            return;
          } else if (event.type === 'error') {
            handlers.onError(new Error(event.message));
            return;
          }
        } catch {
          // Ignore
        }
      }
    }
    handlers.onComplete(accumulatedContent, accumulatedReasoning || undefined);
  },

  async testConnection(request: any, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    try {
      const res = await fetch(`${getAiBase()}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      const data = await res.json();
      return {
        success: data.success ?? false,
        status: data.status || 'Connected',
        message: data.message || '',
        latencyMs: data.latencyMs,
      };
    } catch {
      return { success: false, status: 'provider-unreachable', message: 'Could not reach the Aether AI proxy server. Is the server running?' };
    }
  },

  async listModels(request: any, signal?: AbortSignal): Promise<AIModelOption[]> {
    try {
      const res = await fetch(`${getAiBase()}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.models) ? data.models : [];
    } catch {
      return [];
    }
  },

  async saveCredential(profileId: string, apiKey: string, organizationId?: string): Promise<{ success: boolean; mask: string }> {
    const res = await fetch(`${getAiBase()}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, apiKey, organizationId }),
    });
    return res.json();
  },

  async deleteCredential(profileId: string): Promise<void> {
    await fetch(`${getAiBase()}/credentials/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
  },

  async getCredentialStatus(profileId: string): Promise<CredentialStatus> {
    try {
      const res = await fetch(`${getAiBase()}/credentials/${encodeURIComponent(profileId)}/status`);
      if (!res.ok) return { configured: false, mask: '' };
      return res.json();
    } catch {
      return { configured: false, mask: '' };
    }
  },
};
