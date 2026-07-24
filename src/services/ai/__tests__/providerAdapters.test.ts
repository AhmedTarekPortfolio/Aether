import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalTemplateAdapter } from '../adapters/localProvider';
import { OpenAICompatibleAdapter } from '../adapters/openaiCompatibleProvider';
import { DEFAULT_LOCAL_PROFILE } from '../providerProfiles';
import { saveCredentials } from '../credentialStore';
import { AIRequest } from '../types';
import { aetherTransport } from '../aetherTransport';

describe('AI Provider Adapters (src/services/ai/adapters/)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(aetherTransport, 'saveCredential').mockResolvedValue({ success: true, mask: '••••2345' });
  });
  it('1. LocalTemplateAdapter generates offline response cleanly', async () => {
    const adapter = new LocalTemplateAdapter();
    const request: AIRequest = {
      messages: [{ role: 'user', content: 'What is a binary tree?' }],
      mode: 'tutor',
      profileConfig: DEFAULT_LOCAL_PROFILE,
    };

    const response = await adapter.generate(request);
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(10);
    expect(response.providerId).toBe(DEFAULT_LOCAL_PROFILE.id);
  });

  it('2. LocalTemplateAdapter has supportsStreaming = false per Correction #1', () => {
    const adapter = new LocalTemplateAdapter();
    expect(adapter.supportsStreaming).toBe(false);
  });

  it('3. LocalTemplateAdapter connection test succeeds', async () => {
    const adapter = new LocalTemplateAdapter();
    const result = await adapter.testConnection(DEFAULT_LOCAL_PROFILE);
    expect(result.success).toBe(true);
    expect(result.status).toBe('Connected');
  });

  it('4. OpenAICompatibleAdapter handles connection test failure safely without leaking API key', async () => {
    const adapter = new OpenAICompatibleAdapter();
    await saveCredentials('test_prof', { apiKey: 'sk-secret-key-12345' }, false);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid key' }), { status: 401 })
    );

    const result = await adapter.testConnection({
      id: 'test_prof',
      name: 'Test Endpoint',
      type: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o',
      temperature: 0.7,
      rememberApiKey: false,
      createdAt: 0,
      updatedAt: 0,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('Authentication failed');
    expect(result.message).not.toContain('sk-secret-key-12345');

    fetchSpy.mockRestore();
  });
});
