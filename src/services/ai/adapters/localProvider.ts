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

    if (mode === 'ask_resources') {
      const sourceBlock = request.normalizedRequest?.systemInstruction?.match(
        /BEGIN UNTRUSTED NOTE SOURCES\n([\s\S]*?)\nEND UNTRUSTED NOTE SOURCES/,
      )?.[1] ?? '';
      const sources = [...sourceBlock.matchAll(
        /SOURCE \[(R\d+)\]\nTitle: ([^\n]+)\nNote ID: [^\n]+\n([\s\S]*?)\nEND SOURCE \[\1\]/g,
      )].map((match) => ({ label: match[1], title: match[2], excerpt: match[3].trim() }));
      content = sources.length
        ? `### Grounded answer\n\nThe selected notes provide the following relevant evidence:\n\n${
          sources.map((source) => `- **[${source.label}] ${source.title}:** ${source.excerpt}`).join('\n\n')
        }\n\nAll claims above are limited to the selected note excerpts.`
        : 'The selected resources do not contain enough information to answer this question.';
      explanation = {
        confidence: sources.length ? 0.8 : 0,
        factors: ['Synthesized locally from explicitly selected note excerpts only.'],
      };
    } else if (mode === 'quiz') {
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
