import {
  AIProviderAdapter,
  AIRequest,
  AIProviderResponse,
  AIConnectionTestResult,
} from '../types';
import { AIProviderProfile } from '../../../types';
import { buildSystemInstruction } from '../systemPrompts';
import { getCredentials } from '../credentialStore';

export class GeminiAdapter implements AIProviderAdapter {
  id = 'gemini';
  name = 'Google Gemini Provider';
  supportsStreaming = false;
  supportsModelDiscovery = false;

  private getCleanBaseUrl(url?: string): string {
    if (!url || !url.trim()) return 'https://generativelanguage.googleapis.com/v1beta';
    return url.trim().replace(/\/+$/, '');
  }

  async generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const { messages, profileConfig } = request;
    const baseUrl = this.getCleanBaseUrl(profileConfig.baseUrl);
    const model = profileConfig.modelId || 'gemini-1.5-flash';
    const creds = getCredentials(profileConfig.id);
    const apiKey = creds.apiKey || '';

    const endpoint = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const systemPrompt = buildSystemInstruction(request);
    const contents = [
      {
        role: 'user',
        parts: [{ text: `[System Instructions]\n${systemPrompt}` }],
      },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        if (response.status === 400 || response.status === 403) {
          throw new Error('Google Gemini Authentication failed: Invalid API key or model request.');
        }
        throw new Error(`Gemini Error (${response.status}): ${errText.slice(0, 120)}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        content,
        providerId: profileConfig.id,
        providerName: profileConfig.name,
        modelId: profileConfig.modelId,
      };
    } catch (err: any) {
      throw new Error(err.message || 'Failed to generate Gemini response.');
    }
  }

  async testConnection(profileConfig: AIProviderProfile, signal?: AbortSignal): Promise<AIConnectionTestResult> {
    try {
      const res = await this.generate(
        {
          messages: [{ role: 'user', content: 'Ping' }],
          mode: 'chat',
          profileConfig,
        },
        signal
      );
      if (res.content) {
        return {
          success: true,
          status: 'Connected',
          message: 'Google Gemini API connected successfully.',
        };
      }
      return {
        success: false,
        status: 'Unsupported response format',
        message: 'Gemini endpoint returned an empty response.',
      };
    } catch (err: any) {
      return {
        success: false,
        status: err.message?.includes('Authentication') ? 'Authentication failed' : 'Network unavailable',
        message: err.message || 'Could not connect to Gemini API.',
      };
    }
  }
}
