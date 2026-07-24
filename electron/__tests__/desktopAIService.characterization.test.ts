import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { desktopAIService, redactSecretsInString } from '../services/ai/desktop-ai-service';

describe('Phase 0 Electron DesktopAIService Characterization Tests', () => {
  it('characterization: redactSecretsInString replaces raw API key patterns', () => {
    const rawMsg = 'Error using nvapi-1234567890abc and sk-9876543210zyx';
    const redacted = redactSecretsInString(rawMsg);
    expect(redacted).not.toContain('nvapi-1234567890abc');
    expect(redacted).not.toContain('sk-9876543210zyx');
    expect(redacted).toContain('••••REDACTED');
  });

  it('characterization: desktopAIService listModels throws normalized error for unsupported providers', async () => {
    await expect(
      desktopAIService.listModels({
        profileId: 'test_prof',
        providerType: 'unsupported_provider_type',
        baseUrl: 'https://example.com',
      })
    ).rejects.toThrow(/No models were returned/i);
  });

  it('characterization: desktopAIService testConnection handles unconfigured keys gracefully', async () => {
    const res = await desktopAIService.testConnection({
      profileId: 'non_existent_profile_id',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });

    expect(res.success).toBe(false);
    expect(res.status).toBeDefined();
  });
});
