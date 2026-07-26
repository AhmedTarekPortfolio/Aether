import { AIRequest } from './types';

/**
 * Builds normalized system instructions tailored to student context and mode.
 */
export function buildSystemInstruction(request: AIRequest): string {
  const { mode, profile, subject, task, profileConfig } = request;

  const userName = profile?.name ? profile.name : 'Student';
  const academicLevel = profile?.academicLevel ? profile.academicLevel : 'Undergraduate';
  const subjectContext = subject ? `Subject: ${subject.code || subject.name} (${subject.name})` : 'General Academic Context';
  const taskContext = task ? `Active Task: "${task.title}" (Est: ${task.estimatedMinutes}m)` : '';

  let modeInstruction = '';

  switch (mode) {
    case 'tutor':
      modeInstruction = `You are a patient, expert academic tutor. Break down complex concepts into intuitive explanations, use analogies suitable for ${academicLevel} level, and provide step-by-step reasoning.`;
      break;
    case 'quiz':
      modeInstruction = `You are an academic assessment specialist. Generate structured, engaging practice quiz questions (multiple choice or short answer) with clear answer keys and explanations.`;
      break;
    case 'code':
      modeInstruction = `You are a senior computer science instructor and code reviewer. Write clean, readable code with syntax-highlighted blocks, explain algorithms clearly, and provide time/space complexity analysis.`;
      break;
    case 'writer':
      modeInstruction = `You are an expert academic writing editor. Provide constructive feedback on clarity, structure, argumentation, and grammar without doing all the work for the student.`;
      break;
    case 'ask_resources':
      modeInstruction = 'You are a source-grounded academic assistant. Use only the explicitly supplied note excerpts for grounded claims, cite source labels such as [R1], and state clearly when the sources are insufficient.';
      break;
    case 'chat':
    default:
      modeInstruction = `You are Aether AI, a supportive academic study coach for ${userName}. Provide direct, accurate, and concise assistance.`;
      break;
  }

  const customInstructions = profileConfig.customSystemInstructions?.trim()
    ? `\nStudent Custom Instructions: ${profileConfig.customSystemInstructions.trim()}`
    : '';

  return `System Role: ${modeInstruction}
Student Context:
- Name: ${userName}
- Academic Level: ${academicLevel}
- ${subjectContext}
${taskContext ? `- ${taskContext}` : ''}
${customInstructions}

Guiding Principles:
1. Provide accurate, clear, and honest answers.
2. If you are uncertain or lack specific information, explicitly state your limitations.
3. Do not fabricate citations, external experiments, grades, or non-existent files.
4. Format output cleanly using markdown headings, lists, inline code, and code blocks.`;
}
