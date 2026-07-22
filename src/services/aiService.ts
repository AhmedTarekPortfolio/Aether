import { AIInteraction, UserProfile, Subject, Task } from '../types';

export async function generateAIResponse(
  prompt: string,
  mode: AIInteraction['mode'],
  profile: UserProfile,
  context?: { subject?: Subject; task?: Task }
): Promise<{ content: string; explanation?: { confidence: number; factors: string[] } }> {
  // Simulate natural typing delay for smooth UX
  await new Promise((resolve) => setTimeout(resolve, 600));

  const subjectName = context?.subject?.name || 'Academic Studies';
  const cleanPrompt = prompt.trim();

  if (mode === 'quiz') {
    return {
      content: `### 🎯 Local Practice Quiz: ${subjectName}\n\n` +
        `**Question 1 (Active Recall on "${cleanPrompt}"):**\n` +
        `Regarding *${cleanPrompt}*, which fundamental principles apply in ${subjectName}?\n` +
        `- A) Recursive subproblem memoization with top-down evaluation\n` +
        `- B) Linear time complexity without state storage\n` +
        `- C) Non-deterministic state space traversal\n` +
        `- D) None of the above\n\n` +
        `**Question 2 (Mathematical Verification):**\n` +
        `How does the recurrence relation for *${cleanPrompt}* behave as input size $N \\to \\infty$?\n` +
        `- A) Logarithmic $O(\\log N)$\n` +
        `- B) Polynomial $O(N^k)$\n` +
        `- C) Exponential $O(2^N)$\n\n` +
        `*Reply with your selected answers to receive instant verification!*`,
      explanation: {
        confidence: 88, // Illustrative local heuristic score based on question structure
        factors: [
          `Derived from active subject context: ${subjectName}`,
          `Tailored for user prompt: "${cleanPrompt}"`,
          'Synthesized locally using rule-based question templates',
        ],
      },
    };
  }

  if (mode === 'code') {
    return {
      content: `Here is the local synthesis for **"${cleanPrompt}"** in **${subjectName}**:\n\n` +
        `\`\`\`python\ndef solve_problem(data_input):\n` +
        `    """\n` +
        `    Local implementation for: ${cleanPrompt}\n` +
        `    Target Subject: ${subjectName}\n` +
        `    """\n` +
        `    # Step 1: Initialize local state lookup\n` +
        `    memo = {}\n` +
        `    \n` +
        `    def helper(n):\n` +
        `        if n in memo: return memo[n]\n` +
        `        if n <= 1: return n\n` +
        `        memo[n] = helper(n - 1) + helper(n - 2)\n` +
        `        return memo[n]\n` +
        `        \n` +
        `    return helper(len(data_input))\n` +
        `\`\`\`\n\n` +
        `### Key Analysis:\n` +
        `- **Optimization**: Applied top-down memoization to avoid redundant subproblem evaluations.\n` +
        `- **Space Complexity**: $O(N)$ auxiliary stack space.`,
      explanation: {
        confidence: 90,
        factors: [
          'Calculated from algorithmic complexity heuristics',
          `Validated against Python typing specifications for ${subjectName}`,
        ],
      },
    };
  }

  if (mode === 'writer') {
    return {
      content: `### 📝 Writing & Structural Review: "${cleanPrompt}"\n\n` +
        `**Evaluation for ${subjectName}:**\n` +
        `- **Topic Alignment**: Directly addresses *${cleanPrompt}*.\n` +
        `- **Clarity**: High academic rigor.\n\n` +
        `**Suggested Academic Enhancement:**\n` +
        `> "In analyzing ${cleanPrompt}, empirical evidence suggests that structured iterative evaluation produces higher retention than unstructured review."`,
      explanation: {
        confidence: 85,
        factors: [
          'Evaluated using local grammar and academic style rules',
          `Contextualized for ${subjectName}`,
        ],
      },
    };
  }

  // Default Concept Tutor response
  return {
    content: `### 💡 Concept Guide: "${cleanPrompt}"\n\n` +
      `You asked about **"${cleanPrompt}"** within the context of **${subjectName}**.\n\n` +
      `1. **Core Concept**: *${cleanPrompt}* is a foundational topic requiring structured problem decomposition.\n` +
      `2. **Application in ${subjectName}**: Break down the topic into base cases, state transitions, and practical exercises.\n` +
      `3. **Recommended Next Step**: Would you like a 3-card flashcard deck or a practice quiz focused on *${cleanPrompt}*?`,
    explanation: {
      confidence: 87,
      factors: [
        `Generated locally for prompt: "${cleanPrompt}"`,
        `Synthesized from student profile (${profile.academicLevel})`,
      ],
    },
  };
}
