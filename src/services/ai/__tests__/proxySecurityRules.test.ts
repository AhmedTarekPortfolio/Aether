import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/mock/user/data' },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}));

import { validateProviderUrl } from '../../../../server/services/urlValidator.js';
import { redactSecrets } from '../../../../server/services/secretRedaction.js';
import { redactSecretsInString } from '../../../../electron/services/ai/desktop-ai-service.js';

describe('Production URL & Proxy Security Rules (server/services/urlValidator.ts)', () => {
  it('production path: accepts approved NVIDIA NIM HTTPS URL', () => {
    const result = validateProviderUrl('https://integrate.api.nvidia.com/v1/chat/completions', 'nvidia_nim');
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe('integrate.api.nvidia.com');
  });

  it('production path: accepts approved OpenAI HTTPS URL', () => {
    const result = validateProviderUrl('https://api.openai.com/v1/chat/completions', 'openai');
    expect(result.valid).toBe(true);
  });

  it('production path: accepts localhost for self-hosted local providers (ollama, lmstudio)', () => {
    const result = validateProviderUrl('http://localhost:11434/v1/chat/completions', 'ollama');
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe('localhost');
  });

  it('production path: rejects file://, data:, javascript:, and ftp: URLs', () => {
    expect(validateProviderUrl('file:///etc/passwd', 'openai').valid).toBe(false);
    expect(validateProviderUrl('data:text/html,test', 'openai').valid).toBe(false);
    expect(validateProviderUrl('javascript:alert(1)', 'openai').valid).toBe(false);
    expect(validateProviderUrl('ftp://malicious.server/payload', 'openai').valid).toBe(false);
  });

  it('production path: rejects cloud metadata endpoints (169.254.169.254, metadata.google.internal, 100.100.100.200)', () => {
    expect(validateProviderUrl('http://169.254.169.254/latest/meta-data/', 'openai').valid).toBe(false);
    expect(validateProviderUrl('http://metadata.google.internal/computeMetadata/v1/', 'gemini').valid).toBe(false);
    expect(validateProviderUrl('http://100.100.100.200/metadata', 'openai').valid).toBe(false);
  });

  it('production path: rejects private IPv4 ranges for cloud providers (10.0.0.1, 172.16.0.1, 192.168.1.1)', () => {
    expect(validateProviderUrl('https://10.0.0.1/v1/chat/completions', 'openai').valid).toBe(false);
    expect(validateProviderUrl('https://172.16.0.1/v1/chat/completions', 'openai').valid).toBe(false);
    expect(validateProviderUrl('https://192.168.1.1/v1/chat/completions', 'openai').valid).toBe(false);
  });

  it('production path: rejects URLs with embedded user credentials', () => {
    const result = validateProviderUrl('https://user:pass@api.openai.com/v1/chat/completions', 'openai');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('credentials');
  });

  it('production path: rejects unparseable URL format', () => {
    const result = validateProviderUrl('not-a-valid-url-format', 'openai');
    expect(result.valid).toBe(false);
  });
});

describe('Production Secret Redaction Rules', () => {
  it('production path: redactSecrets sanitizes nvapi- keys', () => {
    const result = redactSecrets('API key is nvapi-abc123XYZ');
    expect(result).toContain('nvapi-••••REDACTED');
    expect(result).not.toContain('abc123XYZ');
  });

  it('production path: redactSecrets sanitizes sk- keys', () => {
    const result = redactSecrets('Using sk-proj-mySecretKeyValue');
    expect(result).toContain('sk-••••REDACTED');
    expect(result).not.toContain('mySecretKeyValue');
  });

  it('production path: redactSecretsInString sanitizes Bearer tokens and Authorization headers', () => {
    const result = redactSecretsInString('Authorization: Bearer sk-secret-token-123');
    expect(result).toContain('Authorization: ••••REDACTED');
    expect(result).not.toContain('sk-secret-token-123');
  });

  it('production path: redactSecrets sanitizes URL query string keys', () => {
    const result = redactSecrets('url?key=AIzaSy-secret-key&param=value');
    expect(result).toContain('key=••••REDACTED');
    expect(result).not.toContain('AIzaSy-secret-key');
  });

  it('production path: preserves non-secret text intact', () => {
    const text = 'Model deepseek-ai/deepseek-v4-flash loaded successfully';
    expect(redactSecrets(text)).toBe(text);
  });
});
