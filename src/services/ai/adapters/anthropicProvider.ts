import {
  AIProviderAdapter,
  AIRequest,
  AIStreamHandlers,
  AIProviderResponse,
  AIConnectionTestResult,
} from '../types';
import { AIProviderProfile } from '../../../types';
import { buildSystemInstruction } from '../systemPrompts';
import { getCredentials } from '../credentialStore';

export class AnthropicAdapter implements AIProviderAdapter {
  id = 'anthropic';
  name = 'Anthropic Claude Provider';
  supportsStreaming = false;
  supportsModelDiscovery = false;

  private getCleanBaseUrl(url?: string): string {
    if (!url || !url.trim()) return 'https://api.anthropic.com/v1';
    return url.trim().replace(/\/+$/, '');
  }

  async generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const { messages, profileConfig } = request;
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const endpoint = `${baseUrl}/messages`;

    const creds = getCredentials(profileConfig.id);
    const systemPrompt = buildSystemInstruction(request);
    const apiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': creds.apiKey || '',
      'anthropic-version': '2023-06-01',
    };

    const body = {
      model: profileConfig.modelId || 'claude-3-5-haiku-20241022',
      messages: apiMessages,
      system: systemPrompt,
      max_tokens: profileConfig.maxOutputTokens || 1024,
      temperature: profileConfig.temperature ?? 0.7,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new Error('Anthropic Authentication failed: Invalid API key.');
        }
        throw new Error(`Anthropic Error (${response.status}): ${errText.slice(0, 120)}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || '';

      return {
        content,
        providerId: profileConfig.id,
        providerName: profileConfig.name,
        modelId: profileConfig.modelId,
      };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to generate Anthropic response.');
    }
  }

  async testConnection(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    try {
      const res = await this.generate(
        {
          messages: [{ role: 'user', content: 'Ping' }],
          mode: 'chat',
          profileConfig: { ...profileConfig, maxOutputTokens: 5 },
        },
        signal
      );
      if (res.content) {
        return {
          success: true,
          status: 'Connected',
          message: 'Anthropic Claude API connected successfully.',
        };
      }
      return {
        success: false,
        status: 'Unsupported response format',
        message: 'Anthropic endpoint returned an empty response.',
      };
    } catch (err: any) {
      if (err.message && err.message.includes('Authentication failed')) {
        return {
          success: false,
          status: 'Authentication failed',
          message: 'Invalid Anthropic API Key (401/403).',
        };
      }
      return {
        success: false,
        status: 'Network unavailable',
        message: err.message || 'Could not connect to Anthropic API.',
      };
    }
  }
}
