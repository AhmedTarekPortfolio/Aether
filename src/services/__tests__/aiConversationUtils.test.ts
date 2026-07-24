import { describe, it, expect } from 'vitest';
import { sortMessagesChronologically, formatMessageProviderMetadata, getStarterPromptsForMode } from '../aiConversationUtils';
import { AIConversation } from '../../types';

describe('AI Conversation Utilities (src/services/aiConversationUtils.ts)', () => {
  it('1. Sorts messages chronologically without mutating input array', () => {
    const messages: AIConversation[] = [
      { id: 'm3', role: 'user', mode: 'chat', content: 'Third', timestamp: 300 },
      { id: 'm1', role: 'user', mode: 'chat', content: 'First', timestamp: 100 },
      { id: 'm2', role: 'assistant', mode: 'chat', content: 'Second', timestamp: 200 },
    ];

    const copy = [...messages];
    const sorted = sortMessagesChronologically(messages);

    expect(sorted[0].id).toBe('m1');
    expect(sorted[1].id).toBe('m2');
    expect(sorted[2].id).toBe('m3');
    // Verify original array was unmutated
    expect(messages).toEqual(copy);
  });

  it('2. Formats message provider metadata correctly', () => {
    const msg1: AIConversation = {
      id: '1', role: 'assistant', mode: 'chat', content: 'Hi', timestamp: 1,
      providerName: 'OpenAI Official', modelId: 'gpt-4o',
    };
    expect(formatMessageProviderMetadata(msg1)).toBe('OpenAI Official (gpt-4o)');

    const msg2: AIConversation = {
      id: '2', role: 'assistant', mode: 'chat', content: 'Hi', timestamp: 2,
    };
    expect(formatMessageProviderMetadata(msg2)).toBe('');
  });

  it('3. Generates appropriate starter prompts for modes', () => {
    const quizPrompts = getStarterPromptsForMode('quiz', 'CS101');
    expect(quizPrompts.length).toBe(3);
    expect(quizPrompts[0]).toContain('CS101');

    const codePrompts = getStarterPromptsForMode('code');
    expect(codePrompts.length).toBe(3);
  });
});
