import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { aiRouter } from '../routes/ai';
import * as credentialStore from '../services/credentialStore';
import { validateProviderUrl } from '../services/urlValidator';

describe('Phase 0 Real Express Server AI Routes & Security Characterization', () => {
  let server: Server;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/ai', aiRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}/api/ai`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to mock upstream fetch while letting test HTTP client calls pass to 127.0.0.1
  function mockUpstreamFetch(upstreamResponse: Response) {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const urlStr = url.toString();
      if (urlStr.startsWith('http://127.0.0.1')) {
        return originalFetch(url, init);
      }
      return Promise.resolve(upstreamResponse);
    });
  }

  // 1. Missing required fields in POST /chat
  it('POST /api/ai/chat returns 400 invalid-request when required fields are missing', async () => {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'prof1' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid-request');
  });

  // 2. Missing API key for cloud provider in POST /chat
  it('POST /api/ai/chat returns 401 missing-api-key when no credential exists for cloud provider', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue(null);

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof_no_key',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('missing-api-key');
  });

  // 3. Unsafe URL validation failure in POST /chat
  it('POST /api/ai/chat returns 400 invalid-provider-url when URL scheme is file://', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue('sk-fake-test-key');

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'file:///etc/passwd',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid-provider-url');
  });

  // 4. Successful non-streaming OpenAI chat completion
  it('POST /api/ai/chat maps upstream response to normalized structure for openai', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue('sk-test-valid-key');

    mockUpstreamFetch(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [
            {
              message: { content: 'Express route response' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        { status: 200 }
      )
    );

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe('Express route response');
    expect(data.model).toBe('gpt-4o');
    expect(data.finishReason).toBe('stop');
    expect(data.usage.totalTokens).toBe(15);
  });

  // 5. Upstream HTTP Error Taxonomies (401 -> authentication-failed, 404 -> model-not-found, 429 -> rate-limited)
  it('POST /api/ai/chat normalizes upstream HTTP 401 error to authentication-failed', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue('sk-invalid-key');
    mockUpstreamFetch(new Response(JSON.stringify({ error: 'Unauthorized key' }), { status: 401 }));

    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Ping' }],
      }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('authentication-failed');
  });

  // 6. Test connection endpoint POST /api/ai/test
  it('POST /api/ai/test returns connection success when upstream succeeds', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue('sk-test-valid-key');
    mockUpstreamFetch(new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 }));

    const res = await fetch(`${baseUrl}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe('connected');
  });

  // 7. Models endpoint POST /api/ai/models
  it('POST /api/ai/models returns normalized list of available models', async () => {
    vi.spyOn(credentialStore, 'getApiKey').mockReturnValue('sk-test-valid-key');
    mockUpstreamFetch(
      new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4o', name: 'GPT-4o' }],
        }),
        { status: 200 }
      )
    );

    const res = await fetch(`${baseUrl}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: 'prof1',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models[0].id).toBe('gpt-4o');
  });

  // 8. Credential CRUD endpoints
  it('POST, GET, and DELETE /api/ai/credentials operate on credential store correctly', async () => {
    const saveSpy = vi.spyOn(credentialStore, 'saveCredential').mockImplementation(() => {});
    const statusSpy = vi.spyOn(credentialStore, 'getCredentialStatus').mockReturnValue({ configured: true, mask: '••••3210' });
    const deleteSpy = vi.spyOn(credentialStore, 'deleteCredential').mockImplementation(() => {});

    // Save credential
    const saveRes = await fetch(`${baseUrl}/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'prof_test_crud', apiKey: 'sk-12345678903210' }),
    });
    expect(saveRes.status).toBe(200);
    expect(saveSpy).toHaveBeenCalledWith('prof_test_crud', 'sk-12345678903210', undefined);

    // Get credential status
    const statusRes = await fetch(`${baseUrl}/credentials/prof_test_crud/status`);
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData).toEqual({ configured: true, mask: '••••3210' });

    // Delete credential
    const deleteRes = await fetch(`${baseUrl}/credentials/prof_test_crud`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith('prof_test_crud');
  });

  // 9. Production URL Validator Security Assertions
  it('production validateProviderUrl security checks', () => {
    expect(validateProviderUrl('https://api.openai.com/v1', 'openai').valid).toBe(true);
    expect(validateProviderUrl('http://user:pass@api.openai.com', 'openai').valid).toBe(false);
    expect(validateProviderUrl('file:///etc/passwd', 'openai').valid).toBe(false);
    expect(validateProviderUrl('http://169.254.169.254/latest/meta-data', 'openai').valid).toBe(false);
    expect(validateProviderUrl('http://10.0.0.1/chat', 'openai').valid).toBe(false);
  });
});
