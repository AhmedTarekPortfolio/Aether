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
          'BEGIN UNTRUSTED EVIDENCE',
          'EVIDENCE [R1]',
          'Type: Aether note',
          'Title: Cells',
          'Locator: Note',
          'Excerpt:',
          'ATP is cellular energy.',
          'END EVIDENCE [R1]',
          '',
          'EVIDENCE [S1]',
          'Type: Imported source',
          'Title: Biology PDF',
          'Locator: Physical page 2 (printed label ii)',
          'Excerpt:',
          'Mitochondria create ATP.',
          'END EVIDENCE [S1]',
          'END UNTRUSTED EVIDENCE',
        ].join('\n'),
      },
    });
    expect(response.content).toContain('[R1]');
    expect(response.content).toContain('[S1]');
    expect(response.content).toContain('Physical page 2');
  });
});
