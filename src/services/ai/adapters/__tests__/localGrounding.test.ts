import { describe, expect, it } from 'vitest';
import { LocalTemplateAdapter } from '../localProvider';

describe('WP-02 local Ask Resources integration', () => {
  it('uses delimited prepared sources and emits visible citations', async () => {
    const adapter = new LocalTemplateAdapter();
    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'What creates ATP?' }],
      mode: 'ask_resources',
      profileConfig: {
        id: 'local', name: 'Local', type: 'local', modelId: 'template', temperature: 0,
        rememberApiKey: false, createdAt: 1, updatedAt: 1,
      },
      normalizedRequest: {
        model: 'template', messages: [{ role: 'user', content: 'What creates ATP?' }],
        systemInstruction: 'BEGIN UNTRUSTED NOTE SOURCES\nSOURCE [R1]\nTitle: Cells\nNote ID: n1\nMitochondria create ATP.\nEND SOURCE [R1]\nEND UNTRUSTED NOTE SOURCES',
      },
    });
    expect(response.content).toContain('[R1]');
    expect(response.content).toContain('Mitochondria create ATP.');
  });
});
