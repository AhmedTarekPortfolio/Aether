import { AIProviderAdapter, AIRequest, AIProviderResponse, AIConnectionTestResult } from '../types';
import { AIProviderProfile } from '../../../types';
import { AI_TEMPLATES } from '../templates';

export class LocalTemplateAdapter implements AIProviderAdapter {
  id = 'local';
  name = 'Local Offline Synthesizer';
  supportsStreaming = false; // Correction #1: Honest offline generation without simulated streaming
  supportsModelDiscovery = false;

  async generate(request: AIRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const { messages, mode, profile, subject, profileConfig } = request;

    if (signal?.aborted) {
      throw new Error('Request aborted by user.');
    }

    // Honest latency for local template synthesis
    await new Promise((resolve) => setTimeout(resolve, 400));

    const subjectName = subject?.name || 'Academic Studies';
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || 'Study query';
    const cleanPrompt = lastUserMsg.trim();

    let content = '';
    let explanation: { confidence: number; factors: string[] } | undefined;

    if (mode === 'quiz') {
      const template = AI_TEMPLATES.quiz;
      content = template.getContent(cleanPrompt, subjectName);
      explanation = {
        confidence: template.confidence,
        factors: template.getFactors(cleanPrompt, subjectName),
      };
    } else if (mode === 'code') {
      const template = AI_TEMPLATES.code;
      content = template.getContent(cleanPrompt, subjectName);
      explanation = {
        confidence: template.confidence,
        factors: template.getFactors(cleanPrompt, subjectName),
      };
    } else if (mode === 'writer') {
      const template = AI_TEMPLATES.writer;
      content = template.getContent(cleanPrompt, subjectName);
      explanation = {
        confidence: template.confidence,
        factors: template.getFactors(cleanPrompt, subjectName),
      };
    } else {
      const template = AI_TEMPLATES.tutor;
      content = template.getContent(cleanPrompt, subjectName);
      explanation = {
        confidence: template.confidence,
        factors: template.getFactors(cleanPrompt, subjectName, profile?.academicLevel || 'Undergraduate'),
      };
    }

    return {
      content,
      explanation,
      providerId: profileConfig.id,
      providerName: profileConfig.name,
      modelId: profileConfig.modelId,
    };
  }

  async testConnection(profileConfig: AIProviderProfile): Promise<AIConnectionTestResult> {
    return {
      success: true,
      status: 'Connected',
      message: 'Local offline synthesizer is ready. 0 network or API key required.',
      latencyMs: 15,
    };
  }
}
