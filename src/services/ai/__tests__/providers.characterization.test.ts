import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { OpenAIDesktopProvider } from '../../../../electron/services/ai/providers/openai.provider.js';
import { NvidiaDesktopProvider } from '../../../../electron/services/ai/providers/nvidia.provider.js';
import { AnthropicDesktopProvider } from '../../../../electron/services/ai/providers/anthropic.provider.js';
import { GeminiDesktopProvider } from '../../../../electron/services/ai/providers/gemini.provider.js';
import { LocalDesktopProvider } from '../../../../electron/services/ai/providers/local.provider.js';
import { FAKE_CREDENTIALS } from '../../../../tests/fixtures/ai/providerFixtures.js';

describe('Phase 0 Production Provider Logic & Characterization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. OpenAI Production Provider Path
  it('production path: OpenAIDesktopProvider constructs request, injects bearer header, and normalizes choice/usage', async () => {
    const provider = new OpenAIDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'gpt-4o',
          choices: [{ message: { content: 'OpenAI output' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_openai_1',
        profileId: 'prof_openai',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello OpenAI' }],
        systemInstruction: 'Be concise.',
        temperature: 0.5,
        maxTokens: 100,
      },
      FAKE_CREDENTIALS.openai
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = fetchSpy.mock.calls[0];
    expect(callUrl).toBe('https://api.openai.com/v1/chat/completions');

    const headers = callInit?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_CREDENTIALS.openai}`);

    const body = JSON.parse(callInit?.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello OpenAI' });
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);

    expect(res.content).toBe('OpenAI output');
    expect(res.finishReason).toBe('stop');
    expect(res.usage?.totalTokens).toBe(30);
  });

  // 2. Generic OpenAI-Compatible Production Provider Path
  it('production path: OpenAIDesktopProvider handles custom base URLs for OpenAI-compatible proxies', async () => {
    const provider = new OpenAIDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Compat output' } }],
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_compat_1',
        profileId: 'prof_compat',
        providerType: 'openai_compatible',
        baseUrl: 'http://localhost:8000/v1',
        model: 'llama-3-70b-instruct',
        messages: [{ role: 'user', content: 'Hello Local' }],
      },
      'fake-compat-key'
    );

    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8000/v1/chat/completions');
    expect(res.content).toBe('Compat output');
  });

  // 3. OpenRouter Production Provider Path
  it('production path: OpenAIDesktopProvider targets OpenRouter endpoints and preserves slash model IDs', async () => {
    const provider = new OpenAIDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'OpenRouter output' } }] }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_or_1',
        profileId: 'prof_or',
        providerType: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello OpenRouter' }],
      },
      'sk-or-key'
    );

    expect(fetchSpy.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('anthropic/claude-3.5-sonnet');
    expect(res.content).toBe('OpenRouter output');
  });

  // 4. NVIDIA NIM Production Provider Path
  it('production path: NvidiaDesktopProvider targets NVIDIA NIM endpoints and extracts reasoning_content', async () => {
    const provider = new NvidiaDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: 'deepseek-ai/deepseek-r1',
          choices: [
            {
              message: {
                content: 'Final proof answer',
                reasoning_content: 'Step 1: Expand Peano axioms.',
              },
              finish_reason: 'stop',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_nv_1',
        profileId: 'prof_nvidia',
        providerType: 'nvidia_nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'deepseek-ai/deepseek-r1',
        messages: [{ role: 'user', content: 'Prove 1+1=2' }],
      },
      FAKE_CREDENTIALS.nvidia
    );

    expect(fetchSpy.mock.calls[0][0]).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(res.content).toBe('Final proof answer');
    expect(res.reasoning).toBe('Step 1: Expand Peano axioms.');
  });

  // 5. Anthropic Production Provider Path
  it('production path: AnthropicDesktopProvider constructs message payload and headers', async () => {
    const provider = new AnthropicDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'msg_123',
          model: 'claude-3-5-sonnet-20241022',
          content: [{ type: 'text', text: 'Anthropic response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 12, output_tokens: 24 },
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_anth_1',
        profileId: 'prof_anthropic',
        providerType: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Explain biology' }],
        systemInstruction: 'Focus on cells.',
        maxTokens: 500,
      },
      FAKE_CREDENTIALS.anthropic
    );

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(FAKE_CREDENTIALS.anthropic);
    expect(headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.system).toBe('Focus on cells.');
    expect(body.max_tokens).toBe(500);

    expect(res.content).toBe('Anthropic response');
    expect(res.finishReason).toBe('end_turn');
  });

  // 6. Gemini Production Provider Path
  it('production path: GeminiDesktopProvider appends API key to query parameter and maps contents array', async () => {
    const provider = new GeminiDesktopProvider();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: 'Gemini response text' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const res = await provider.generate(
      {
        requestId: 'req_gem_1',
        profileId: 'prof_gemini',
        providerType: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'Hello Gemini' }],
        systemInstruction: 'Be helpful.',
      },
      FAKE_CREDENTIALS.gemini
    );

    const callUrl = fetchSpy.mock.calls[0][0] as string;
    expect(callUrl).toContain(`key=${FAKE_CREDENTIALS.gemini}`);

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[0].parts[0].text).toContain('[System Instructions]\nBe helpful.');
    expect(body.contents[2].parts[0].text).toBe('Hello Gemini');

    expect(res.content).toBe('Gemini response text');
  });

  // 7. Ollama / LM Studio Local Provider Path
  it('production path: LocalDesktopProvider generates local responses or routes to local endpoints', async () => {
    const provider = new LocalDesktopProvider();
    const res = await provider.generate({
      requestId: 'req_loc_1',
      profileId: 'prof_local',
      providerType: 'local',
      baseUrl: 'local://offline-template',
      model: 'local-template-v1',
      messages: [{ role: 'user', content: 'Test offline' }],
    });

    expect(res.content).toBeDefined();
  });

  // 8. Model List Production Behavior
  it('production path: OpenAIDesktopProvider listModels parses OpenAI models endpoint', async () => {
    const provider = new OpenAIDesktopProvider();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4o', owned_by: 'openai' }, { id: 'gpt-4o-mini', owned_by: 'openai' }],
        }),
        { status: 200 }
      )
    );

    const models = await provider.listModels('https://api.openai.com/v1', FAKE_CREDENTIALS.openai);
    expect(models.length).toBe(2);
    expect(models[0].id).toBe('gpt-4o');
  });

  // 9. Connection Test Production Behavior
  it('production path: OpenAIDesktopProvider testConnection returns success result and latency', async () => {
    const provider = new OpenAIDesktopProvider();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 })
    );

    const testRes = await provider.testConnection('https://api.openai.com/v1', FAKE_CREDENTIALS.openai, 'gpt-4o-mini');
    expect(testRes.success).toBe(true);
    expect(testRes.status).toBe('Connected');
    expect(testRes.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
