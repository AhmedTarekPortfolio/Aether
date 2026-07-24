import { AIConversation } from '../types';

/**
 * Sorts AI conversation messages chronologically by timestamp without mutating the input array.
 */
export function sortMessagesChronologically(messages: AIConversation[]): AIConversation[] {
  if (!Array.isArray(messages)) return [];
  return [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/**
 * Formats provider and model metadata into a clean display label for assistant messages.
 */
export function formatMessageProviderMetadata(msg: AIConversation): string {
  if (!msg.providerName && !msg.modelId) return '';
  if (msg.providerName && msg.modelId) {
    return `${msg.providerName} (${msg.modelId})`;
  }
  return msg.providerName || msg.modelId || '';
}

/**
 * Generates mode starter prompts for personalized empty state.
 */
export function getStarterPromptsForMode(mode: AIConversation['mode'], subjectName?: string): string[] {
  const context = subjectName ? ` for ${subjectName}` : '';
  switch (mode) {
    case 'quiz':
      return [
        `Create 3 practice quiz questions${context}.`,
        `Generate a short-answer test on core definitions${context}.`,
        `Quiz me on key formulas and problem-solving steps.`,
      ];
    case 'code':
      return [
        `Explain how to implement key data structures${context}.`,
        `Review algorithm time and space complexity.`,
        `Debug code implementation and suggest refactorings.`,
      ];
    case 'writer':
      return [
        `Review essay thesis clarity and argument flow${context}.`,
        `Check grammar, transitions, and academic tone.`,
        `Provide feedback on bibliography and citation structure.`,
      ];
    case 'tutor':
    case 'chat':
    default:
      return [
        `Explain key concepts${context} step-by-step.`,
        `Break down difficult terminology with analogies.`,
        `What are the most important principles to review today?`,
      ];
  }
}
