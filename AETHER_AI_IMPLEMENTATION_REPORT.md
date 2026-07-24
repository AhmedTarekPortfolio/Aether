# Aether AI Subsystem Implementation Report
*(FocusForge AI Architecture Adaptation)*

## 1. Files Inspected
- `src/App.tsx`: Main application entry point routing views.
- `src/types/index.ts`: Application domain interfaces (`AIProviderProfile`, `AIConversation`, `UserProfile`, `Subject`, `Task`).
- `src/services/ai/index.ts`: AI service entry exports.
- `src/services/ai/types.ts`: Provider and request/response types.
- `src/services/ai/credentialStore.ts`: In-memory and separate `localStorage` credential manager.
- `src/services/ai/providerProfiles.ts`: Serializable profile CRUD and active profile tracking.
- `src/services/ai/providerRegistry.ts`: Central factory for provider adapters.
- `src/services/ai/adapters/`: `localProvider.ts`, `openaiCompatibleProvider.ts`, `anthropicProvider.ts`, `geminiProvider.ts`, `nvidiaNimAdapter.ts`.
- `src/views/AIAssistantView.tsx`: Main AI Assistant screen UI component.
- `src/components/ai/ModelSettingsModal.tsx`: Model & API settings modal.
- `src/db/database.ts`: Dexie IndexedDB database definition (`AetherPhase1DB`, Version 3).
- `src/api/aiConversationApi.ts`: Dexie persistence layer for AI conversations.

---

## 2. Files Created
- `src/services/ai/orchestrator.ts`: Central AI service implementing `prepare()` and `send()` request lifecycle separation.
- `src/services/ai/localRetrieval.ts`: Offline lexical search over study notes and subjects returning formatted source excerpts.
- `src/services/ai/errorTaxonomy.ts`: Diagnostic error normalization into user-friendly error codes (`INVALID_API_KEY`, `RATE_LIMITED`, `TIMEOUT`, `PRIVACY_BLOCKED`, `CANCELLED`).
- `src/services/ai/curlImporter.ts`: Safe cURL text command parser separating API keys into credential storage.
- `src/components/ai/ReasoningPanel.tsx`: Collapsible UI panel for rendering model thinking/reasoning separate from main answers.
- `src/components/ai/PrivacyPreviewModal.tsx`: Data outflow preview modal for `Ask Before Sending` privacy mode.
- `src/services/ai/__tests__/orchestrator.test.ts`: Vitest test suite for orchestrator `prepare()` and `send()`.
- `src/services/ai/__tests__/localRetrieval.test.ts`: Vitest test suite for offline local resource retrieval.
- `src/services/ai/__tests__/errorTaxonomy.test.ts`: Vitest test suite for error normalization.
- `src/services/ai/__tests__/curlImporter.test.ts`: Vitest test suite for cURL command parsing and secret isolation.

---

## 3. Files Modified
- `src/types/index.ts`: Extended `AIConversation` mode union to support `'ask_resources'`, `'explain'`, `'summarize'`.
- `src/services/ai/types.ts`: Added domain types (`PrepareAIInput`, `PreparedAIRequest`, `LocalOnlyResult`, `PrivacyMode`, `AIErrorCode`, `NormalizedAIRequest`, `NormalizedAIResponse`).
- `src/services/ai/index.ts`: Exported new subsystem modules (`aiOrchestrator`, `performLocalRetrieval`, `normalizeAIError`, `parseCurlCommand`).
- `src/services/ai/adapters/openaiCompatibleProvider.ts`: Extracted reasoning content from `choices[0].message.reasoning` / `reasoning_content`.
- `src/views/AIAssistantView.tsx`: Integrated orchestrator, privacy mode controls, reasoning panel, and privacy preview modal.
- `src/components/ai/ModelSettingsModal.tsx`: Enhanced preset selector and safe cURL importer integration.

---

## 4. Architecture Implemented
The AI section adopts the **FocusForge AI Subsystem Architecture**:
- **Layer 1: AI Orchestrator (`aiOrchestrator`)**: Central service coordinating validation, provider resolution, local retrieval, privacy checks, history limiting, request building, response parsing, and persistence.
- **Layer 2: Prepare & Send Lifecycle**:
  - `prepare()`: 0 network calls. Resolves local context, checks privacy, limits history to 12 messages, builds outgoing payload preview.
  - `send()`: Securely retrieves credentials, resolves adapter, executes HTTP transport, extracts content and reasoning, and saves conversation record.
- **Layer 3: Provider Registry (`providerRegistry`)**: Adapter pattern routing requests to specialized provider classes.
- **Layer 4: Secure Credentials (`credentialStore`)**: Complete separation of serializable provider profiles from secret API keys.

---

## 5. Provider Adapters Implemented
- `LocalTemplateAdapter` (`'local'`): 100% offline synthesizer, `supportsStreaming = false`.
- `OpenAICompatibleAdapter` (`'openai_compatible'`, `'openai'`, `'openrouter'`, `'ollama'`, `'lmstudio'`): Full SSE streaming, reasoning extraction, custom headers.
- `NvidiaNimAdapter` (`'nvidia_nim'`): NVIDIA NIM platform API supporting catalog models, NVCF invocation URLs, self-hosted NIMs, and partner endpoints.
- `AnthropicAdapter` (`'anthropic'`): Messages API payload mapping.
- `GeminiAdapter` (`'gemini'`): Google Gemini parts API payload mapping.

---

## 6. Credential-Storage Method
- Credentials (`apiKey`, `organizationId`) reside in-memory session maps or in `localStorage` under `aether_ai_credentials_v1` ONLY when `rememberApiKey === true`.
- Raw keys are NEVER stored in Dexie IndexedDB, conversation records, raw logs, exported provider JSON, or backups.
- Masked keys (`••••••••4F2A`) are returned for UI display.

---

## 7. Transport Method
- Direct browser HTTP transport with URL validation (`validateNvidiaUrl`), scheme limits (`http:`, `https:`), cloud metadata IP blocking (`169.254.169.254`), and header injection defense (`sanitizeNvidiaHeaders`).
- Clear CORS diagnostic notices displayed in connection testing UI.

---

## 8. NVIDIA NIM Handling
- Supports catalog models (`deepseek-ai/deepseek-v4-flash`), NVCF invocation endpoints, and self-hosted NIMs (`http://localhost:8000`).
- Supports extra request fields (e.g. `chat_template_kwargs: { thinking: true, reasoning_effort: "high" }`).
- Extracts reasoning text from `choices[0].message.reasoning` or `choices[0].message.reasoning_content`.

---

## 9. Request and Response Normalization
- Outgoing requests are converted to `NormalizedAIRequest` (`model`, `messages`, `systemInstruction`, `temperature`, `maximumOutputTokens`, `stream`).
- Incoming responses are converted to `NormalizedAIResponse` (`content`, `reasoning`, `model`, `finishReason`, `usage`).

---

## 10. Reasoning Handling
- Extracted reasoning text is stored separately in `response.reasoning`.
- Rendered in `ReasoningPanel.tsx` as a collapsible section with a clear label (*"Model Thinking & Reasoning Process"*).
- Reasoning is never merged into main answer prose and is hidden when absent.

---

## 11. Streaming and Cancellation
- Streaming parsed incrementally via `SSEStreamParser`.
- Cancellation handled via `aiOrchestrator.cancel(requestId)` invoking `AbortController.abort()`.
- Partial content preserved with `generationStatus = 'stopped'`.

---

## 12. Persistence Changes
- Conversation records saved via `addAIConversation` in Dexie table `ai_conversations`.
- Persists prompt, response, timestamp, mode, subjectId, and reasoning explanation.

---

## 13. Database Migrations
- Zero schema changes or database migrations introduced. Dexie version(3) remains 100% untouched.

---

## 14. Local Retrieval Implementation
- Implemented in `src/services/ai/localRetrieval.ts`.
- Executes offline BM25/TF-IDF token search across study notes and subjects.
- Formats stable source identifiers (`[R1]`, `[R2]`).
- Displays no-evidence warning when sources-only search yields zero matches.

---

## 15. Privacy Implementation
- 5 Privacy Modes: `standard`, `ask_before_sending`, `local_model_only`, `local_tools_only`, `sensitive_study_mode`.
- `ask_before_sending`: Opens `PrivacyPreviewModal.tsx` displaying provider, model, history count, attached resources, and payload size before execution.
- `local_tools_only`: Blocks external network calls; returns local search results.
- `sensitive_study_mode`: Strips history and user metadata from outgoing request.

---

## 16. Tests Added
- `src/services/ai/__tests__/orchestrator.test.ts` (5 tests)
- `src/services/ai/__tests__/localRetrieval.test.ts` (1 test)
- `src/services/ai/__tests__/errorTaxonomy.test.ts` (3 tests)
- `src/services/ai/__tests__/curlImporter.test.ts` (1 test)
- `src/services/ai/adapters/__tests__/nvidiaNimAdapter.test.ts` (12 tests)

---

## 17. Test Results
```bash
npm test
```
```text
 Test Files  18 passed (18)
      Tests  88 passed (88)
   Duration  65.94s
```

---

## 18. Build Results
```bash
npm run build
```
```text
vite v6.4.3 building for production...
✓ 2696 modules transformed.
dist/index.html                     1.28 kB │ gzip:   0.69 kB
dist/assets/index-K5c5MAFc.css     50.26 kB │ gzip:   8.52 kB
dist/assets/index-2a1sPHaK.js   1,162.15 kB │ gzip: 334.48 kB
✓ built in 31.44s
```

---

## 19. Manual Testing Results
1. **NVIDIA NIM Preset**: Loaded DeepSeek V4 Flash preset; verified request building and key masking.
2. **Privacy Preview**: Enabled `Ask Before Sending`; verified modal display before execution.
3. **Local Retrieval**: Enabled `Local Tools Only`; verified offline excerpt matching.
4. **Reasoning Display**: Verified collapsible reasoning panel toggles cleanly.

---

## 20. Known Limitations
- Direct browser requests to strict CORS-restricted external endpoints may require a CORS backend proxy in production.
- Binary WebAudio streaming for speech synthesis (Riva TTS) is unsupported in text chat.

---

## 21. Recommended Next Steps
1. Add backend CORS proxy route for production web deployments.
2. Implement code-splitting (`React.lazy`) for secondary provider adapters to reduce JavaScript bundle size below 500 kB.
