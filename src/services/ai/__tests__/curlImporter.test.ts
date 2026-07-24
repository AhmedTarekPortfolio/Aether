import { describe, it, expect, beforeEach } from 'vitest';
import { parseCurlCommand } from '../curlImporter';
import { getCredentials } from '../credentialStore';

describe('cURL Command Importer (FocusForge Architecture - src/services/ai/curlImporter.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses cURL text into provider profile and isolates API key into secure credential storage', () => {
    const curl = `curl -X POST "https://integrate.api.nvidia.com/v1/chat/completions" \\
  -H "Authorization: Bearer nvapi-secret-key-12345" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek-ai/deepseek-v4-flash"}'`;

    const result = parseCurlCommand(curl);

    expect(result.profile.baseUrl).toBe('https://integrate.api.nvidia.com');
    expect(result.profile.modelId).toBe('deepseek-ai/deepseek-v4-flash');
    expect(result.profile.type).toBe('nvidia_nim');

    // Secrets must NOT exist in the provider profile object
    expect((result.profile as any).apiKey).toBeUndefined();

    // Secret is stored securely in credentialStore
    const creds = getCredentials(result.profile.id);
    expect(creds.apiKey).toBe('nvapi-secret-key-12345');
  });
});
