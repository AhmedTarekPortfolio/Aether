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
      const systemInstruction = request.normalizedRequest?.systemInstruction ?? '';
      const evidenceBlock = systemInstruction.match(
        /BEGIN UNTRUSTED EVIDENCE\n([\s\S]*?)\nEND UNTRUSTED EVIDENCE/,
      )?.[1] ?? '';
      const evidence = [...evidenceBlock.matchAll(
        /EVIDENCE \[((?:R|S)\d+)\]\nType: ([^\n]+)\nTitle: ([^\n]+)\nLocator: ([^\n]+)\nExcerpt:\n([\s\S]*?)\nEND EVIDENCE \[\1\]/g,
      )].map((match) => ({
        label: match[1],
        type: match[2],
        title: match[3],
        locator: match[4],
        excerpt: match[5].trim(),
      }));
      const legacySourceBlock = systemInstruction.match(
        /BEGIN UNTRUSTED NOTE SOURCES\n([\s\S]*?)\nEND UNTRUSTED NOTE SOURCES/,
      )?.[1] ?? '';
      const legacyEvidence = [...legacySourceBlock.matchAll(
        /SOURCE \[(R\d+)\]\nTitle: ([^\n]+)\nNote ID: [^\n]+\n([\s\S]*?)\nEND SOURCE \[\1\]/g,
      )].map((match) => ({
        label: match[1],
        type: 'Aether note',
        title: match[2],
        locator: 'Note',
        excerpt: match[3].trim(),
      }));
      const sources = evidence.length > 0 ? evidence : legacyEvidence;
      content = sources.length
        ? `### Grounded answer\n\nThe selected evidence provides the following relevant information:\n\n${
          sources.map((source) =>
            `- **[${source.label}] ${source.title} (${source.locator}):** ${source.excerpt}`)
            .join('\n\n')
        }\n\nAll claims above are limited to the exact selected evidence excerpts.`
        : 'The selected resources do not contain enough information to answer this question.';
      explanation = {
        confidence: sources.length ? 0.8 : 0,
        factors: ['Synthesized locally from explicitly selected evidence excerpts only.'],
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
