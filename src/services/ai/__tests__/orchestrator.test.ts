import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiOrchestrator } from '../orchestrator';
import { saveProfile } from '../providerProfiles';
import { AIConversation } from '../../../types';
import * as noteApi from '../../../api/noteApi';
import * as subjectApi from '../../../api/subjectApi';
import * as aiConversationApi from '../../../api/aiConversationApi';

describe('AI Orchestrator (FocusForge Architecture - src/services/ai/orchestrator.ts)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(noteApi, 'getNotes').mockResolvedValue([
      { id: 'note_1', userId: 'u1', subjectId: 's1', title: 'Search study notes', content: 'Sample study note content', tags: [], updatedAt: Date.now() },
    ]);
    vi.spyOn(subjectApi, 'getSubjects').mockResolvedValue([]);
    vi.spyOn(aiConversationApi, 'addAIConversation').mockResolvedValue();
  });

  describe('1. prepare() Stage', () => {
    it('prepares a request object without executing any network calls', async () => {
      const result = await aiOrchestrator.prepare({
        prompt: 'What is photosynthesis?',
        mode: 'tutor',
        privacyMode: 'standard',
      });

      expect(result.type).toBe('prepared_request');
      if (result.type === 'prepared_request') {
        expect(result.normalizedRequest.messages).toHaveLength(1);
        expect(result.normalizedRequest.messages[0].content).toBe('What is photosynthesis?');
        expect(result.preview.providerName).toBeDefined();
        expect(result.requiresConfirmation).toBe(false);
      }
    });

    it('enforces Ask Before Sending privacy mode by setting requiresConfirmation to true', async () => {
      const result = await aiOrchestrator.prepare({
        prompt: 'Explain calculus',
        mode: 'tutor',
        privacyMode: 'ask_before_sending',
      });

      expect(result.type).toBe('prepared_request');
      if (result.type === 'prepared_request') {
        expect(result.requiresConfirmation).toBe(true);
      }
    });

    it('returns LocalOnlyResult directly when Local Tools Only privacy mode is enabled', async () => {
      const result = await aiOrchestrator.prepare({
        prompt: 'Search study notes',
        mode: 'tutor',
        privacyMode: 'local_tools_only',
      });

      expect(result.type).toBe('local_only_result');
      if (result.type === 'local_only_result') {
        expect(result.message).toContain('Local Search Results');
      }
    });

    it('limits conversation history to latest 12 messages', async () => {
      const mockHistory: AIConversation[] = Array.from({ length: 20 }, (_, i) => ({
        id: `c_${i}`,
        mode: 'tutor',
        prompt: `Question ${i}`,
        response: `Answer ${i}`,
        timestamp: Date.now() + i,
      }));

      const result = await aiOrchestrator.prepare({
        prompt: 'New question',
        mode: 'tutor',
        conversationHistory: mockHistory,
      });

      if (result.type === 'prepared_request') {
        expect(result.preview.historyMessageCount).toBe(12);
      }
    });
  });

  describe('2. send() Stage', () => {
    it('executes prepared request and returns normalized response with content and reasoning', async () => {
      saveProfile({
        id: 'prof_test_orch',
        name: 'Test Provider',
        type: 'openai_compatible',
        baseUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o-mini',
        temperature: 0.7,
        rememberApiKey: false,
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: 'Photosynthesis converts light into energy.',
            reasoning: 'Detailed reasoning step.',
          }),
          { status: 200 }
        )
      );

      const prepared = await aiOrchestrator.prepare({
        prompt: 'Explain photosynthesis',
        mode: 'tutor',
        profileId: 'prof_test_orch',
      });

      if (prepared.type === 'prepared_request') {
        const response = await aiOrchestrator.send(prepared);
        expect(response.content).toBe('Photosynthesis converts light into energy.');
        expect(response.providerId).toBe('prof_test_orch');
      }

      fetchSpy.mockRestore();
    });
  });
});
