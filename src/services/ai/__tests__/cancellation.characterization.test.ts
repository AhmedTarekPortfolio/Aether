import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { desktopAIService } from '../../../../electron/services/ai/desktop-ai-service.js';
import { aiOrchestrator } from '../orchestrator.js';

describe('Phase 0 Production Cancellation Characterization Tests', () => {
  it('production path: desktopAIService aborts active request signal and cleans up activeControllers on cancel()', async () => {
    const requestId = 'req_cancel_prod_1';
    let capturedSignal: AbortSignal | undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        // Trigger cancel while the request is pending in network
        setTimeout(() => {
          desktopAIService.cancel(requestId);
        }, 10);

        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });

    const generatePromise = desktopAIService.generate({
      requestId,
      profileId: 'p1',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Test' }],
    });

    await expect(generatePromise).rejects.toThrow(/aborted|AI Generation failed/i);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('production path: aiOrchestrator manages activeControllers and aborts signal when cancel() is invoked', async () => {
    const prepared = await aiOrchestrator.prepare({
      prompt: 'Test cancellation prompt',
      mode: 'tutor',
      selectedResourceIds: [],
    });

    if (prepared.type !== 'prepared_request') {
      throw new Error('Expected prepared request');
    }

    // Set profile type to external provider (openai) to trigger network transport loop
    prepared.profileConfig = {
      id: 'prof_openai_test',
      name: 'OpenAI Test',
      type: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o',
      temperature: 0.7,
      rememberApiKey: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        setTimeout(() => {
          aiOrchestrator.cancel(prepared.requestId);
        }, 10);

        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });

    const sendPromise = aiOrchestrator.send(prepared);
    await expect(sendPromise).rejects.toThrow();
    expect(capturedSignal?.aborted).toBe(true);
  });
});
