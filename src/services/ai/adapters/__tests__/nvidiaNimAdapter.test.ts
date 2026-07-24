import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NvidiaNimAdapter } from '../nvidiaNimAdapter';
import { validateNvidiaUrl, sanitizeNvidiaHeaders } from '../../nvidia/ssrfProtection';
import { validateAndSanitizeParameters } from '../../nvidia/parameterValidator';
import { saveCredentials } from '../../credentialStore';
import { AIRequest } from '../../types';
import { aetherTransport } from '../../aetherTransport';

describe('NVIDIA NIM Platform Integration (src/services/ai/adapters/nvidiaNimAdapter.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(aetherTransport, 'saveCredential').mockResolvedValue({ success: true, mask: '••••9999' });
  });

  describe('1. SSRF Protection & URL Validation', () => {
    it('allows legitimate integrate.api.nvidia.com hosted endpoints', () => {
      const res = validateNvidiaUrl('https://integrate.api.nvidia.com', '/v1/chat/completions', { source: 'nvidia_build' });
      expect(res.valid).toBe(true);
      expect(res.fullUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    });

    it('allows valid NVCF invocation endpoints', () => {
      const res = validateNvidiaUrl('https://abc123.invocation.api.nvcf.nvidia.com', '/v1/chat/completions', { source: 'nvcf_invocation' });
      expect(res.valid).toBe(true);
    });

    it('rejects unsupported protocols (e.g. file:, ftp:)', () => {
      const res = validateNvidiaUrl('file:///etc/passwd', '', {});
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsupported protocol');
    });

    it('rejects embedded URL credentials (user:pass@host)', () => {
      const res = validateNvidiaUrl('https://user:secret@integrate.api.nvidia.com', '/v1/chat/completions', {});
      expect(res.valid).toBe(false);
      expect(res.error).toContain('embedded credentials');
    });

    it('blocks cloud metadata IP addresses (e.g. 169.254.169.254)', () => {
      const res = validateNvidiaUrl('http://169.254.169.254', '/latest/meta-data', {});
      expect(res.valid).toBe(false);
      expect(res.error).toContain('cloud metadata');
    });

    it('blocks localhost endpoints unless marked as Self-Hosted NIM', () => {
      const resBlocked = validateNvidiaUrl('http://localhost:8000', '/v1/chat/completions', { isSelfHosted: false });
      expect(resBlocked.valid).toBe(false);

      const resAllowed = validateNvidiaUrl('http://localhost:8000', '/v1/chat/completions', { isSelfHosted: true, allowLocalhost: true });
      expect(resAllowed.valid).toBe(true);
    });
  });

  describe('2. Header Sanitization & Header Injection Protection', () => {
    it('strips forbidden host and proxy headers', () => {
      const headers = sanitizeNvidiaHeaders({
        Host: 'evil.com',
        Cookie: 'session=123',
        Authorization: 'Bearer fake',
        'X-Custom-Header': 'SafeValue',
      });

      expect(headers['Host']).toBeUndefined();
      expect(headers['Cookie']).toBeUndefined();
      expect(headers['Authorization']).toBeUndefined();
      expect(headers['X-Custom-Header']).toBe('SafeValue');
    });

    it('rejects headers containing CRLF injection sequences', () => {
      const headers = sanitizeNvidiaHeaders({
        'X-Header\r\nInject': 'value',
        'X-Safe': 'value\r\nInjectedHeader: true',
      });

      expect(headers['X-Header\r\nInject']).toBeUndefined();
      expect(headers['X-Safe']).toBeUndefined();
    });
  });

  describe('3. Parameter Validation & Prototype Pollution Protection', () => {
    it('blocks prototype pollution keys (__proto__, constructor, prototype)', () => {
      const payload: Record<string, any> = { temperature: 0.7 };
      Object.defineProperty(payload, 'constructor', { value: 'polluted', enumerable: true });

      const res = validateAndSanitizeParameters([], payload);

      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('prototype pollution guard');
    });

    it('validates number limits and type bounds correctly', () => {
      const defs = [
        { key: 'temp', label: 'Temp', type: 'number' as const, required: false, minimum: 0, maximum: 2 },
      ];

      const invalidRes = validateAndSanitizeParameters(defs, { temp: 5 });
      expect(invalidRes.valid).toBe(false);

      const validRes = validateAndSanitizeParameters(defs, { temp: 0.8 });
      expect(validRes.valid).toBe(true);
      expect(validRes.cleanParams.temp).toBe(0.8);
    });
  });

  describe('4. Capabilities & Requests Execution', () => {
    it('executes chat completion request cleanly', async () => {
      const adapter = new NvidiaNimAdapter();
      await saveCredentials('nvidia_prof', { apiKey: 'nvapi-test-secret-123' }, false);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'DeepSeek V4 Flash answer.' } }],
          }),
          { status: 200 }
        )
      );

      const request: AIRequest = {
        messages: [{ role: 'user', content: 'Explain transformers.' }],
        mode: 'tutor',
        profileConfig: {
          id: 'nvidia_prof',
          name: 'NVIDIA DeepSeek V4',
          type: 'nvidia_nim',
          baseUrl: 'https://integrate.api.nvidia.com',
          modelId: 'deepseek-ai/deepseek-v4-flash',
          temperature: 0.7,
          rememberApiKey: false,
          createdAt: 0,
          updatedAt: 0,
        },
      };

      const response = await adapter.generate(request);
      expect(response.content).toBe('DeepSeek V4 Flash answer.');
      expect(response.providerName).toBe('NVIDIA DeepSeek V4');

      fetchSpy.mockRestore();
    });

    it('handles connection test failure safely without leaking API key in diagnostics', async () => {
      const adapter = new NvidiaNimAdapter();
      await saveCredentials('nvidia_prof', { apiKey: 'nvapi-secret-key-99999' }, false);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized key' }), { status: 401 })
      );

      const result = await adapter.testConnection({
        id: 'nvidia_prof',
        name: 'NVIDIA Test',
        type: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com',
        modelId: 'deepseek-ai/deepseek-v4-flash',
        temperature: 0.7,
        rememberApiKey: false,
        createdAt: 0,
        updatedAt: 0,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('Authentication failed');
      expect(result.message).not.toContain('nvapi-secret-key-99999');

      fetchSpy.mockRestore();
    });
  });
});
