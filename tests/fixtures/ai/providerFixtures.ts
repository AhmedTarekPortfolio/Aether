/**
 * Phase 0 Deterministic Provider Request and Response Contract Fixtures
 * All keys and endpoints are fake local test vectors. No real network calls are made.
 */

export const FAKE_CREDENTIALS = {
  openai: 'sk-test-phase0-DO-NOT-USE-openai-1234567890',
  nvidia: 'nvapi-test-phase0-DO-NOT-USE-nvidia-1234567890',
  anthropic: 'phase0-anthropic-secret-test-key-1234567890',
  gemini: 'phase0-gemini-secret-test-key-1234567890',
};

export interface ProviderContractFixture {
  providerId: string;
  providerType: string;
  baseUrl: string;
  endpoint?: string;
  model: string;
  sampleRequest: {
    prompt: string;
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
    messages: Array<{ role: string; content: string }>;
  };
  expectedHttpRequest: {
    method: string;
    url: string;
    headers: Record<string, string>;
    bodyMatcher: (body: any) => boolean;
  };
  rawResponseMock: any;
  expectedNormalizedResponse: {
    content: string;
    reasoning?: string;
    model: string;
    finishReason?: string;
  };
  rawStreamChunksMock?: string[];
}

export const PROVIDER_FIXTURES: Record<string, ProviderContractFixture> = {
  openai: {
    providerId: 'prof_openai_default',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    sampleRequest: {
      prompt: 'Explain quantum entanglement',
      systemInstruction: 'You are a physics tutor.',
      temperature: 0.7,
      maxTokens: 500,
      messages: [{ role: 'user', content: 'Explain quantum entanglement' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FAKE_CREDENTIALS.openai}`,
      },
      bodyMatcher: (body) => body.model === 'gpt-4o' && body.messages.length === 2 && body.messages[0].role === 'system',
    },
    rawResponseMock: {
      id: 'chatcmpl-test-openai-123',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Quantum entanglement is a physical phenomenon where pairs of particles interact in ways such that the quantum state of each particle cannot be described independently.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 30,
        total_tokens: 55,
      },
    },
    expectedNormalizedResponse: {
      content: 'Quantum entanglement is a physical phenomenon where pairs of particles interact in ways such that the quantum state of each particle cannot be described independently.',
      model: 'gpt-4o',
      finishReason: 'stop',
    },
    rawStreamChunksMock: [
      'data: {"choices":[{"delta":{"content":"Quantum "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"entanglement."}}]}\n\n',
      'data: [DONE]\n\n',
    ],
  },

  openai_compatible: {
    providerId: 'prof_openai_compat',
    providerType: 'openai_compatible',
    baseUrl: 'http://localhost:8000/v1',
    model: 'llama-3-70b-instruct',
    sampleRequest: {
      prompt: 'Summarize linear algebra',
      temperature: 0.5,
      messages: [{ role: 'user', content: 'Summarize linear algebra' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'http://localhost:8000/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
      },
      bodyMatcher: (body) => body.model === 'llama-3-70b-instruct' && body.messages[0].content === 'Summarize linear algebra',
    },
    rawResponseMock: {
      id: 'chatcmpl-compat-456',
      model: 'llama-3-70b-instruct',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Linear algebra is the branch of mathematics concerning linear equations and vector spaces.',
          },
          finish_reason: 'stop',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'Linear algebra is the branch of mathematics concerning linear equations and vector spaces.',
      model: 'llama-3-70b-instruct',
      finishReason: 'stop',
    },
  },

  openrouter: {
    providerId: 'prof_openrouter_default',
    providerType: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    sampleRequest: {
      prompt: 'Write a Python sorting algorithm',
      messages: [{ role: 'user', content: 'Write a Python sorting algorithm' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
      },
      bodyMatcher: (body) => body.model === 'anthropic/claude-3.5-sonnet',
    },
    rawResponseMock: {
      id: 'gen-or-789',
      model: 'anthropic/claude-3.5-sonnet',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'def quicksort(arr):\n    if len(arr) <= 1: return arr\n    pivot = arr[len(arr) // 2]\n    return quicksort([x for x in arr if x < pivot]) + [x for x in arr if x == pivot] + quicksort([x for x in arr if x > pivot])',
          },
          finish_reason: 'stop',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'def quicksort(arr):\n    if len(arr) <= 1: return arr\n    pivot = arr[len(arr) // 2]\n    return quicksort([x for x in arr if x < pivot]) + [x for x in arr if x == pivot] + quicksort([x for x in arr if x > pivot])',
      model: 'anthropic/claude-3.5-sonnet',
      finishReason: 'stop',
    },
  },

  nvidia_nim: {
    providerId: 'prof_nvidia_nim_r1',
    providerType: 'nvidia_nim',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    endpoint: '/chat/completions',
    model: 'deepseek-ai/deepseek-r1',
    sampleRequest: {
      prompt: 'Prove 1+1=2',
      systemInstruction: 'Be rigorous.',
      messages: [{ role: 'user', content: 'Prove 1+1=2' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FAKE_CREDENTIALS.nvidia}`,
      },
      bodyMatcher: (body) => body.model === 'deepseek-ai/deepseek-r1',
    },
    rawResponseMock: {
      id: 'nv-choice-111',
      model: 'deepseek-ai/deepseek-r1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            reasoning_content: 'Let S be the successor function in Peano arithmetic. By definition, 1 = S(0) and 2 = S(1) = S(S(0)). 1 + 1 = 1 + S(0) = S(1 + 0) = S(1) = 2.',
            content: 'In Peano arithmetic, 1 + 1 = 2 follows directly from the definition of addition on natural numbers.',
          },
          finish_reason: 'stop',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'In Peano arithmetic, 1 + 1 = 2 follows directly from the definition of addition on natural numbers.',
      reasoning: 'Let S be the successor function in Peano arithmetic. By definition, 1 = S(0) and 2 = S(1) = S(S(0)). 1 + 1 = 1 + S(0) = S(1) = 2.',
      model: 'deepseek-ai/deepseek-r1',
      finishReason: 'stop',
    },
    rawStreamChunksMock: [
      'data: {"choices":[{"delta":{"reasoning_content":"Step 1..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Proof completed."}}]}\n\n',
      'data: [DONE]\n\n',
    ],
  },

  anthropic: {
    providerId: 'prof_anthropic_default',
    providerType: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    sampleRequest: {
      prompt: 'Explain biological cell division',
      systemInstruction: 'Focus on mitosis vs meiosis.',
      messages: [{ role: 'user', content: 'Explain biological cell division' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': FAKE_CREDENTIALS.anthropic,
        'anthropic-version': '2023-06-01',
      },
      bodyMatcher: (body) => body.model === 'claude-3-5-sonnet-20241022' && body.system === 'Focus on mitosis vs meiosis.',
    },
    rawResponseMock: {
      id: 'msg_anthropic_222',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-5-sonnet-20241022',
      content: [
        {
          type: 'text',
          text: 'Cell division occurs via mitosis (producing identical somatic cells) or meiosis (producing haploid gametes).',
        },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 15, output_tokens: 20 },
    },
    expectedNormalizedResponse: {
      content: 'Cell division occurs via mitosis (producing identical somatic cells) or meiosis (producing haploid gametes).',
      model: 'claude-3-5-sonnet-20241022',
      finishReason: 'end_turn',
    },
  },

  gemini: {
    providerId: 'prof_gemini_default',
    providerType: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-flash',
    sampleRequest: {
      prompt: 'What is photosynthesis?',
      messages: [{ role: 'user', content: 'What is photosynthesis?' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${FAKE_CREDENTIALS.gemini}`,
      headers: {
        'Content-Type': 'application/json',
      },
      bodyMatcher: (body) => Array.isArray(body.contents) && body.contents[0].parts[0].text === 'What is photosynthesis?',
    },
    rawResponseMock: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar.',
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar.',
      model: 'gemini-1.5-flash',
      finishReason: 'STOP',
    },
  },

  ollama: {
    providerId: 'prof_ollama_local',
    providerType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3',
    sampleRequest: {
      prompt: 'Hello local model',
      messages: [{ role: 'user', content: 'Hello local model' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'http://127.0.0.1:11434/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
      },
      bodyMatcher: (body) => body.model === 'llama3',
    },
    rawResponseMock: {
      id: 'ollama-333',
      model: 'llama3',
      choices: [
        {
          message: { role: 'assistant', content: 'Hello! How can I assist your study session today?' },
          finish_reason: 'stop',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'Hello! How can I assist your study session today?',
      model: 'llama3',
      finishReason: 'stop',
    },
  },

  lmstudio: {
    providerId: 'prof_lmstudio_local',
    providerType: 'lmstudio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'mistral-7b-instruct',
    sampleRequest: {
      prompt: 'Explain recursion',
      messages: [{ role: 'user', content: 'Explain recursion' }],
    },
    expectedHttpRequest: {
      method: 'POST',
      url: 'http://127.0.0.1:1234/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
      },
      bodyMatcher: (body) => body.model === 'mistral-7b-instruct',
    },
    rawResponseMock: {
      id: 'lmstudio-444',
      model: 'mistral-7b-instruct',
      choices: [
        {
          message: { role: 'assistant', content: 'Recursion is a programming technique where a function calls itself.' },
          finish_reason: 'stop',
        },
      ],
    },
    expectedNormalizedResponse: {
      content: 'Recursion is a programming technique where a function calls itself.',
      model: 'mistral-7b-instruct',
      finishReason: 'stop',
    },
  },

  local: {
    providerId: 'prof_local_offline',
    providerType: 'local',
    baseUrl: 'local://offline-template',
    model: 'local-template-v1',
    sampleRequest: {
      prompt: 'Local offline summary',
      messages: [{ role: 'user', content: 'Local offline summary' }],
    },
    expectedHttpRequest: {
      method: 'NONE',
      url: 'local://offline-template',
      headers: {},
      bodyMatcher: () => true,
    },
    rawResponseMock: {
      content: 'Offline study template response generated locally without network access.',
    },
    expectedNormalizedResponse: {
      content: 'Offline study template response generated locally without network access.',
      model: 'local-template-v1',
      finishReason: 'stop',
    },
  },
};
