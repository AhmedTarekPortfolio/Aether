import { AIInteraction, UserProfile, Subject, Task } from '../../types';
import { AI_TEMPLATES } from './templates';

export interface AIProviderResponse {
  content: string;
  explanation?: {
    confidence: number;
    factors: string[];
  };
}

export interface AIProvider {
  name: string;
  generate(
    prompt: string,
    mode: AIInteraction['mode'],
    profile: UserProfile,
    context?: { subject?: Subject; task?: Task }
  ): Promise<AIProviderResponse>;
}

export class LocalTemplateProvider implements AIProvider {
  name = 'Local Offline Synthesizer';

  async generate(
    prompt: string,
    mode: AIInteraction['mode'],
    profile: UserProfile,
    context?: { subject?: Subject; task?: Task }
  ): Promise<AIProviderResponse> {
    // Simulate typing latency for smooth local UX
    await new Promise((resolve) => setTimeout(resolve, 600));

    const subjectName = context?.subject?.name || 'Academic Studies';
    const cleanPrompt = prompt.trim();

    if (mode === 'quiz') {
      const template = AI_TEMPLATES.quiz;
      return {
        content: template.getContent(cleanPrompt, subjectName),
        explanation: {
          confidence: template.confidence,
          factors: template.getFactors(cleanPrompt, subjectName),
        },
      };
    }

    if (mode === 'code') {
      const template = AI_TEMPLATES.code;
      return {
        content: template.getContent(cleanPrompt, subjectName),
        explanation: {
          confidence: template.confidence,
          factors: template.getFactors(cleanPrompt, subjectName),
        },
      };
    }

    if (mode === 'writer') {
      const template = AI_TEMPLATES.writer;
      return {
        content: template.getContent(cleanPrompt, subjectName),
        explanation: {
          confidence: template.confidence,
          factors: template.getFactors(cleanPrompt, subjectName),
        },
      };
    }

    // Default concept tutor
    const template = AI_TEMPLATES.tutor;
    return {
      content: template.getContent(cleanPrompt, subjectName),
      explanation: {
        confidence: template.confidence,
        factors: template.getFactors(cleanPrompt, subjectName, profile.academicLevel),
      },
    };
  }
}

export const activeAIProvider: AIProvider = new LocalTemplateProvider();
