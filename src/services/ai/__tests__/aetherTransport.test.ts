import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aetherTransport } from '../aetherTransport';

describe('Aether AI Transport (CORS Proxy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Transport routing', () => {
    it('sends chat requests to /api/ai/chat, not to external provider URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'Hello!', reasoning: undefined }), { status: 200 })
      );

      await aetherTransport.send({
        profileId: 'prof_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'deepseek-ai/deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toBe('/api/ai/chat');
      expect(callUrl).not.toContain('integrate.api.nvidia.com');

      fetchSpy.mockRestore();
    });

    it('does not include API key in frontend request body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ content: 'OK' }), { status: 200 })
      );

      await aetherTransport.send({
        profileId: 'prof_nvidia_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'deepseek-ai/deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(callInit.body as string);
      expect(body.apiKey).toBeUndefined();
      expect(body.Authorization).toBeUndefined();
      expect(callInit.headers).toBeDefined();
      const headers = callInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it('sends connection test requests to /api/ai/test', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'connected', message: 'OK', latencyMs: 50 }), { status: 200 })
      );

      const result = await aetherTransport.testConnection({
        profileId: 'prof_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toBe('/api/ai/test');
      expect(result.success).toBe(true);

      fetchSpy.mockRestore();
    });

    it('sends model discovery requests to /api/ai/models', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [{ id: 'model-1', name: 'Model 1' }] }), { status: 200 })
      );

      const models = await aetherTransport.listModels({
        profileId: 'prof_1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toBe('/api/ai/models');
      expect(models).toHaveLength(1);

      fetchSpy.mockRestore();
    });
  });

  describe('Credential management', () => {
    it('saves credentials via /api/ai/credentials', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, mask: '••••••••4F2A' }), { status: 200 })
      );

      const result = await aetherTransport.saveCredential('prof_1', 'nvapi-test-key-4F2A');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toBe('/api/ai/credentials');
      expect(result.mask).toContain('4F2A');

      fetchSpy.mockRestore();
    });

    it('checks credential status via /api/ai/credentials/:id/status', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ configured: true, mask: '••••••••ABCD' }), { status: 200 })
      );

      const status = await aetherTransport.getCredentialStatus('prof_1');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callUrl = fetchSpy.mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/ai/credentials/prof_1/status');
      expect(status.configured).toBe(true);

      fetchSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('throws on authentication failure from proxy', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'authentication-failed', message: 'The provider rejected the API key.' }), { status: 401 })
      );

      await expect(aetherTransport.send({
        profileId: 'prof_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      })).rejects.toThrow('The provider rejected the API key.');
    });

    it('returns timeout status from connection test', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, status: 'timeout', message: 'Timed out' }), { status: 200 })
      );

      const result = await aetherTransport.testConnection({
        profileId: 'prof_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('timeout');
    });

    it('handles network failure to proxy server gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await aetherTransport.testConnection({
        profileId: 'prof_1',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Aether AI proxy server');
    });
  });
});
