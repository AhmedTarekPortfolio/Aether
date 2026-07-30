import { describe, expect, it } from 'vitest';
import { LocalTemplateAdapter } from '../localProvider';

describe('WP-02 local Ask Resources integration', () => {
  it('preserves legacy note-only prepared sources and visible citations', async () => {
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

  it('uses the exact mixed note/source evidence pack and emits both citation namespaces', async () => {
    const adapter = new LocalTemplateAdapter();
    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'What creates ATP?' }],
      mode: 'ask_resources',
      profileConfig: {
        id: 'local', name: 'Local', type: 'local', modelId: 'template', temperature: 0,
        rememberApiKey: false, createdAt: 1, updatedAt: 1,
      },
      normalizedRequest: {
        model: 'template',
        messages: [{ role: 'user', content: 'What creates ATP?' }],
        systemInstruction: [
          'BEGIN UNTRUSTED EVIDENCE JSON',
          JSON.stringify([
            {
              label: 'R1',
              type: 'Aether note',
              title: 'Cells',
              locator: 'Note',
              excerpt: 'ATP is cellular energy.',
            },
            {
              label: 'S1',
              type: 'Imported source',
              title: 'Biology PDF',
              locator: 'Physical page 2 (printed label ii)',
              excerpt: 'Mitochondria create ATP.',
            },
          ]),
          'END UNTRUSTED EVIDENCE JSON',
        ].join('\n'),
      },
    });
    expect(response.content).toContain('[R1]');
    expect(response.content).toContain('[S1]');
    expect(response.content).toContain('Physical page 2');
  });
});
