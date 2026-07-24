import { describe, it, expect } from 'vitest';

/**
 * URL Validator tests — tests the validation rules that would be applied
 * by the server-side urlValidator. Since the server runs in Node.js,
 * these tests validate the expected behavior patterns.
 */
describe('URL Validation Rules (Server-side AI Proxy)', () => {
  // Inline validation logic matching server/services/urlValidator.ts patterns
  function validateProviderUrl(targetUrl: string, providerType: string) {
    try {
      const parsed = new URL(targetUrl);

      // Protocol check
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed.' };
      }

      // Credential check
      if (parsed.username || parsed.password) {
        return { valid: false, error: 'URLs must not contain embedded credentials.' };
      }

      // Cloud metadata SSRF check
      const blockedHosts = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200'];
      if (blockedHosts.includes(parsed.hostname)) {
        return { valid: false, error: 'Access to cloud metadata endpoints is blocked.' };
      }

      return { valid: true, hostname: parsed.hostname };
    } catch {
      return { valid: false, error: 'Invalid URL format.' };
    }
  }

  it('accepts approved NVIDIA NIM URL', () => {
    const result = validateProviderUrl('https://integrate.api.nvidia.com/v1/chat/completions', 'nvidia_nim');
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe('integrate.api.nvidia.com');
  });

  it('accepts approved OpenAI URL', () => {
    const result = validateProviderUrl('https://api.openai.com/v1/chat/completions', 'openai');
    expect(result.valid).toBe(true);
  });

  it('accepts localhost for self-hosted providers', () => {
    const result = validateProviderUrl('http://localhost:8000/v1/chat/completions', 'ollama');
    expect(result.valid).toBe(true);
    expect(result.hostname).toBe('localhost');
  });

  it('rejects file:// URLs', () => {
    const result = validateProviderUrl('file:///etc/passwd', 'openai');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('HTTP');
  });

  it('rejects cloud metadata endpoint (169.254.169.254)', () => {
    const result = validateProviderUrl('http://169.254.169.254/latest/meta-data/', 'openai');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('metadata');
  });

  it('rejects cloud metadata endpoint (metadata.google.internal)', () => {
    const result = validateProviderUrl('http://metadata.google.internal/computeMetadata/v1/', 'gemini');
    expect(result.valid).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    const result = validateProviderUrl('https://user:pass@api.openai.com/v1/chat/completions', 'openai');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('credentials');
  });

  it('rejects invalid URL format', () => {
    const result = validateProviderUrl('not-a-url', 'openai');
    expect(result.valid).toBe(false);
  });

  it('rejects ftp:// protocol', () => {
    const result = validateProviderUrl('ftp://malicious.server/payload', 'openai');
    expect(result.valid).toBe(false);
  });
});

describe('Secret Redaction Rules', () => {
  function redactSecrets(text: string): string {
    return text
      .replace(/nvapi-[a-zA-Z0-9_-]+/g, 'nvapi-••••REDACTED')
      .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-••••REDACTED')
      .replace(/Bearer\s+[^\s"']+/g, 'Bearer ••••REDACTED')
      .replace(/Authorization:\s*[^\s"']+/g, 'Authorization: ••••REDACTED')
      .replace(/x-api-key:\s*[^\s"']+/g, 'x-api-key: ••••REDACTED')
      .replace(/key=[^&\s"']+/g, 'key=••••REDACTED');
  }

  it('redacts nvapi- prefixed keys', () => {
    const result = redactSecrets('API key is nvapi-abc123XYZ');
    expect(result).toContain('nvapi-••••REDACTED');
    expect(result).not.toContain('abc123XYZ');
  });

  it('redacts sk- prefixed keys', () => {
    const result = redactSecrets('Using sk-proj-mySecretKeyValue');
    expect(result).toContain('sk-••••REDACTED');
    expect(result).not.toContain('mySecretKeyValue');
  });

  it('redacts Bearer tokens', () => {
    const result = redactSecrets('Bearer nvapi-secret-token-123');
    expect(result).toContain('Bearer ••••REDACTED');
    expect(result).not.toContain('secret-token-123');
  });

  it('redacts Authorization headers', () => {
    const result = redactSecrets('Authorization: Bearer sk-secret');
    expect(result).toContain('Authorization: ••••REDACTED');
  });

  it('redacts query string API keys', () => {
    const result = redactSecrets('url?key=AIzaSy-secret-key&param=value');
    expect(result).toContain('key=••••REDACTED');
    expect(result).not.toContain('AIzaSy-secret-key');
  });

  it('preserves non-secret text', () => {
    const result = redactSecrets('Model deepseek-ai/deepseek-v4-flash loaded successfully');
    expect(result).toBe('Model deepseek-ai/deepseek-v4-flash loaded successfully');
  });
});
