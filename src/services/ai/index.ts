import { AIInteraction, UserProfile, Subject, Task } from '../../types';
import { activeAIProvider, AIProviderResponse } from './provider';

export async function generateAIResponse(
  prompt: string,
  mode: AIInteraction['mode'],
  profile: UserProfile,
  context?: { subject?: Subject; task?: Task }
): Promise<AIProviderResponse> {
  return activeAIProvider.generate(prompt, mode, profile, context);
}

export * from './provider';
export * from './templates';
