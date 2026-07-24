import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NvidiaDesktopProvider } from '../services/ai/providers/nvidia.provider.js';

describe('Electron Main Process — NVIDIA NIM Provider Adapter', () => {
  let provider: NvidiaDesktopProvider;

  beforeEach(() => {
    provider = new NvidiaDesktopProvider();
    vi.restoreAllMocks();
  });

  it('builds correct request payload and parses reasoning content', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'deepseek-ai/deepseek-v4-flash',
          choices: [
            {
              message: {
                content: 'Cellular respiration generates ATP.',
                reasoning_content: 'Mitochondrial electron transport chain step.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 25, total_tokens: 35 },
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_1',
        profileId: 'nvidia_prof',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'deepseek-ai/deepseek-v4-flash',
        messages: [{ role: 'user', content: 'Explain cellular respiration' }],
        systemInstruction: 'You are a biology tutor.',
        temperature: 0.5,
      },
      'nvapi-test-secret-key'
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0][0] as string;
    expect(callUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer nvapi-test-secret-key');

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-ai/deepseek-v4-flash');
    expect(body.messages[0].content).toBe('You are a biology tutor.');

    expect(res.content).toBe('Cellular respiration generates ATP.');
    expect(res.reasoning).toBe('Mitochondrial electron transport chain step.');
    expect(res.usage?.totalTokens).toBe(35);
  });

  it('rejects invalid or unsafe URL schemes', async () => {
    await expect(
      provider.generate(
        {
          requestId: 'req_unsafe',
          profileId: 'p1',
          providerType: 'nvidia_nim',
          baseUrl: 'file:///etc/passwd',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        },
        'key'
      )
    ).rejects.toThrow('NVIDIA Security Error');
  });

  it('normalizes 401 authentication failures cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );

    await expect(
      provider.generate(
        {
          requestId: 'req_401',
          profileId: 'p1',
          providerType: 'nvidia_nim',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test' }],
        },
        'invalid-key'
      )
    ).rejects.toThrow('Authentication failed');
  });

  it('uses the NVIDIA v1 chat endpoint when the configured base URL is the API origin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    );

    await provider.generate({
      requestId: 'req_origin',
      profileId: 'p1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Test' }],
    }, 'nvapi-test');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
  });

  it('rejects a hosted NVIDIA request before the network when no credential is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(provider.generate({
      requestId: 'req_missing_key',
      profileId: 'p1',
      providerType: 'nvidia_nim',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'deepseek-ai/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'Test' }],
    }, '')).rejects.toThrow('INVALID_CONFIGURATION');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
