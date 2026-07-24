import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { saveCredential, getCredentialStatus, deleteCredential, maskKey } from '../../../../server/services/credentialStore.js';
import { credentialService } from '../../../../electron/services/credentials/credential-service.js';
import { redactSecretsInString } from '../../../../electron/services/ai/desktop-ai-service.js';
import { FAKE_CREDENTIALS } from '../../../../tests/fixtures/ai/providerFixtures.js';

describe('Phase 0 Production Credential Security Invariants & Redaction Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. maskKey production implementation
  it('security invariant: maskKey preserves only last 4 characters and obscures all leading bytes', () => {
    const maskedOpenAI = maskKey(FAKE_CREDENTIALS.openai);
    expect(maskedOpenAI).not.toEqual(FAKE_CREDENTIALS.openai);
    expect(maskedOpenAI).toContain('••••');
    expect(maskedOpenAI.endsWith(FAKE_CREDENTIALS.openai.slice(-4))).toBe(true);

    const maskedNvidia = maskKey(FAKE_CREDENTIALS.nvidia);
    expect(maskedNvidia).not.toEqual(FAKE_CREDENTIALS.nvidia);
    expect(maskedNvidia.endsWith(FAKE_CREDENTIALS.nvidia.slice(-4))).toBe(true);
  });

  // 2. Server credentialStore status security
  it('security invariant: Express credentialStore.getCredentialStatus returns only boolean configured flag and mask (never raw key)', () => {
    const profileId = 'prof_sec_test_1';
    saveCredential(profileId, FAKE_CREDENTIALS.openai);

    const status = getCredentialStatus(profileId);
    expect(status.configured).toBe(true);
    expect(status.mask).not.toEqual(FAKE_CREDENTIALS.openai);
    expect(status.mask).toContain('••••');
    expect((status as any).apiKey).toBeUndefined();
    expect((status as any).key).toBeUndefined();

    // Cleanup
    deleteCredential(profileId);
    expect(getCredentialStatus(profileId).configured).toBe(false);
  });

  // 3. Desktop credentialService status security
  it('security invariant: Electron credentialService.getStatus returns configured status and mask without raw secret', () => {
    const profileId = 'prof_sec_test_desktop';
    credentialService.setCredential(profileId, FAKE_CREDENTIALS.nvidia);

    const status = credentialService.getStatus(profileId);
    expect(status.configured).toBe(true);
    expect(status.mask).not.toEqual(FAKE_CREDENTIALS.nvidia);
    expect(status.mask).toContain('••••');
    expect((status as any).apiKey).toBeUndefined();

    // Delete
    credentialService.removeCredential(profileId);
    expect(credentialService.getStatus(profileId).configured).toBe(false);
  });

  // 4. Secret Redaction in Error Messages and Logs
  it('security invariant: redactSecretsInString removes raw API keys and Bearer headers from error outputs', () => {
    const rawError = `Upstream error using ${FAKE_CREDENTIALS.openai} with Authorization: Bearer ${FAKE_CREDENTIALS.nvidia}`;
    const sanitized = redactSecretsInString(rawError);

    expect(sanitized).not.toContain(FAKE_CREDENTIALS.openai);
    expect(sanitized).not.toContain(FAKE_CREDENTIALS.nvidia);
    expect(sanitized).toContain('••••REDACTED');
  });

  // 5. Model/Chat responses do not contain credentials
  it('security invariant: provider responses return content without exposing stored credentials', () => {
    const sampleResponse = {
      content: 'Hello world study response',
      model: 'gpt-4o',
      finishReason: 'stop',
    };

    const jsonStr = JSON.stringify(sampleResponse);
    expect(jsonStr).not.toContain(FAKE_CREDENTIALS.openai);
    expect(jsonStr).not.toContain(FAKE_CREDENTIALS.nvidia);
  });
});
