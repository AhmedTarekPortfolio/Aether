# Aether API & Models Fix Report

## Failures reproduced

- **PASS — reproduced before editing:** the packaged Electron renderer had a working `window.aetherDesktop` preload bridge.
- **FAIL — reproduced before editing:** NVIDIA connection tests called `https://integrate.api.nvidia.com/chat/completions` instead of `/v1/chat/completions`, producing a real 404 for `deepseek-ai/deepseek-v4-flash`.
- **FAIL — reproduced before editing:** a newly entered key could not be tested until profile/credential state happened to align, and the fixed draft ID `temp` could collide with an older saved credential.
- **FAIL — reproduced before editing:** the complete API key remained in the password input after saving, and saved credentials were read back into React state from the renderer memory cache.
- **FAIL — reproduced before editing:** no visible configured/not-configured status or explicit credential-removal operation existed.
- **FAIL — reproduced before editing:** credential-save, credential-remove, and model-list errors were swallowed, allowing false-positive UI states or silent empty model lists.
- **FAIL — reproduced before editing:** “Set as Active Provider” used stale React state after creating a profile and could activate the wrong profile.
- **FAIL — reproduced by call-path/runtime inspection:** desktop streaming returned immediately after registering the listener. The orchestrator therefore persisted an empty response and discarded its cancellation controller before provider completion.
- **FAIL — reproduced in stored UI history:** the Assistant persisted a literal `...` placeholder before provider completion, leaving placeholder conversations when generation failed.
- **FAIL — reproduced by inspection:** non-streaming providers were represented as streaming by emitting a completed response as a token.
- **FAIL — reproduced in the packaged UI:** Settings had no `API & Models` entry; the editor was reachable only from the AI Assistant.

## Root causes

1. `ModelSettingsModal` kept NVIDIA endpoint recipe state only in React and did not persist or forward `endpointPath`. The Electron NVIDIA provider also defaulted to `/chat/completions`.
2. Profile metadata and credential persistence were coupled through a synchronous profile save plus a fire-and-forget secure credential call. Failures were ignored.
3. Credential UI hydration called `getCredentials`, exposing the full in-memory secret back to renderer state instead of querying safe status metadata.
4. Profile activation calculated its target from stale `selectedProfileId`/`profiles` state instead of the profile returned by the save operation.
5. `desktopBridge.stream` returned before `done`/`error`, generated a different request ID, and did not own a completion promise or complete listener cleanup.
6. The AI Assistant threw inside an asynchronous stream callback and wrote an incomplete placeholder conversation before provider completion.
7. Main-process model listing converted all failures to `[]`; the UI consequently could not distinguish no models from authentication, network, or provider errors.
8. The main-process stream fallback emitted a completed response as a fake progressive token.
9. The Settings view never linked to the existing API/model editor.

## Files changed

- `src/views/SettingsView.tsx` — added the direct Settings → API & Models launcher.
- `src/components/ai/ModelSettingsModal.tsx` — added explicit secure save/status/remove, safe key-state clearing, model/test preconditions, endpoint and stream persistence, correct activation, and actionable errors.
- `src/views/AIAssistantView.tsx` — selects real/non-streaming execution from the active profile, handles stream rejection once, restores failed prompts, and stops writing placeholder conversations.
- `src/types/index.ts` — added persisted `endpointPath` and `stream` provider-profile fields.
- `src/services/ai/types.ts` — extended normalized error categories.
- `src/services/ai/errorTaxonomy.ts` — added configuration, network, and provider error handling.
- `src/services/ai/providerProfiles.ts` — persists NVIDIA endpoint/stream metadata and keeps profile deletion separate from credential deletion.
- `src/services/ai/credentialStore.ts` — propagates secure-store failures and rolls back renderer memory on failure.
- `src/services/ai/aetherTransport.ts` — carries stable request IDs, endpoint recipes, and connection-test timeouts.
- `src/services/ai/index.ts` — forwards endpoint and timeout metadata through renderer transport.
- `src/services/ai/orchestrator.ts` — forwards the stable prepared request ID and waits for actual stream completion.
- `src/desktop/desktopBridge.ts` — returns a real stream lifecycle promise and cleans up on completion, error, or cancellation.
- `electron/types/desktop-api.ts` — aligned request/result/model contracts.
- `electron/preload.ts` and `electron/preload.cjs` — remove per-request listeners on terminal events without exposing unrestricted IPC.
- `electron/ipc/ai.ipc.ts` — validates model/test requests and reports unexpected stream failures safely.
- `electron/ipc/credentials.ipc.ts` — aligned credential removal’s return contract.
- `electron/services/credentials/credential-service.ts` — reports disk-write failure and only caches a credential after encrypted persistence succeeds.
- `electron/services/ai/desktop-ai-service.ts` — forwards NVIDIA endpoint/timeout configuration, propagates model errors, and removes simulated streaming.
- `electron/services/ai/providers/nvidia.provider.ts` — fixes `/v1/chat/completions`, handles bases already ending in `/v1`, validates hosted credentials, normalizes provider errors, and annotates models.
- `src/desktop/__tests__/desktopBridge.test.ts` — covers stable IDs, pending stream completion, cleanup, and cancellation.
- `electron/__tests__/nvidia.provider.test.ts` — covers endpoint joining, hosted missing-key rejection, payloads, and authentication errors.
- `src/services/ai/__tests__/providerProfiles.test.ts` — verifies profile/credential separation.
- `src/services/ai/__tests__/orchestrator.test.ts` — removed obsolete renderer-secret setup.
- `src/services/ai/__tests__/providerAdapters.test.ts` and `src/services/ai/adapters/__tests__/nvidiaNimAdapter.test.ts` — await and mock secure credential transport correctly.

## Call-path verification

### Credential save/status/remove

`Settings or Assistant UI`
→ `ModelSettingsModal`
→ `credentialStore`
→ `aetherTransport`
→ `desktopBridge`
→ `window.aetherDesktop.credentials`
→ `electron/preload.cjs`
→ `aether:credentials:*`
→ `credentials.ipc.ts`
→ `CredentialService`
→ Electron `safeStorage` / Windows DPAPI encrypted file.

Only `{ configured, mask }` returns to the renderer after save/restart.

### Models and connection test

`ModelSettingsModal`
→ `listProviderModels` / `testProviderConnection`
→ `aetherTransport`
→ `desktopBridge`
→ preload
→ `aether:ai:list-models` / `aether:ai:test-connection`
→ `ai.ipc.ts`
→ `DesktopAIService`
→ `NvidiaDesktopProvider`
→ real NVIDIA endpoint.

### Assistant generation/stream/cancel

`AIAssistantView`
→ active persisted profile
→ `AIOrchestrator`
→ `aetherTransport`
→ `desktopBridge`
→ preload
→ AI IPC
→ `DesktopAIService`
→ selected main-process provider.

The prepared request ID is retained across every streaming and cancellation layer.

## Credential results

- Save: **PASS** — packaged UI saved a dummy credential through Electron.
- Status: **PASS** — packaged UI/bridge returned configured plus a last-four mask only.
- Restart persistence: **PASS** — profile credential status remained configured after closing and reopening the packaged app with the same user-data directory.
- Use: **PASS (invalid-key path)** — main process decrypted and used the stored key; NVIDIA returned a real authentication failure.
- Remove: **PASS** — packaged UI removal changed status to not configured without deleting the profile.
- Redaction: **PASS** — the plaintext dummy key was absent from `desktop-credentials.json`; `isSafeStorage` was true.
- Full secret returned to renderer: **PASS** — saved/restarted key inputs were empty.

## Provider and model results

- Provider selection: **PASS**
- NVIDIA endpoint recipe persistence: **PASS**
- Model loading: **PASS** — packaged app received 118 NVIDIA models from the real model endpoint.
- `deepseek-ai/deepseek-v4-flash` present and selected: **PASS**
- Invalid-key connection test: **PASS** — displayed `AUTHENTICATION_ERROR`.
- Valid-key connection test: **NOT TESTED** — no NVIDIA credential was available in `NVIDIA_API_KEY`, `NVIDIA_NIM_API_KEY`, or `NGC_API_KEY`.
- Profile save: **PASS**
- Profile/model/active-profile reload after restart: **PASS**

## AI Assistant results

- Selected profile use: **PASS (invalid-key path)** — Assistant used the active NVIDIA profile and displayed the real authentication error.
- Non-streaming real response: **NOT TESTED** — no valid remote credential was available.
- Streaming real response: **NOT TESTED** — no valid remote credential was available.
- Reasoning output: **NOT TESTED** — no valid remote credential was available.
- Cancellation of a real upstream stream: **NOT TESTED** — no valid remote credential was available.
- Stream completion/cancellation/listener lifecycle: **PASS (automated tests)**.
- Placeholder prevention/error recovery: **PASS** — failed packaged request restored the prompt and did not create a new placeholder record.

## Commands executed

- `npx tsc --noEmit` — exit 0.
- `npx tsc -p tsconfig.electron.json --noEmit` — exit 0.
- Focused API/AI regression run — exit 0, 42 tests passed.
- Initial full `npm test` after error-propagation changes — exit 1: 138 assertions passed but three unawaited test credential promises were reported.
- Final `npm test` — exit 0: 25 files, 138 tests passed.
- `npm run build:desktop` — exit 0.
- An earlier `npm run package` attempt exceeded its execution window after producing an artifact — exit 124; it was not used as the final artifact.
- Final `npm run package` — exit 0; final executable written to `dist-installer/Aether-win32-x64/Aether.exe`.

## Manual runtime results

- Packaged executable launch without Vite: **PASS**
- Preload bridge present: **PASS**
- Settings → API & Models: **PASS**
- NVIDIA selection/default endpoint/default model: **PASS**
- Credential save/status/masking: **PASS**
- Credential restart persistence: **PASS**
- Credential removal: **PASS**
- NVIDIA model discovery: **PASS**
- DeepSeek V4 Flash selection persistence: **PASS**
- Invalid NVIDIA key classification: **PASS**
- Valid NVIDIA request: **NOT TESTED**
- Real non-streaming completion: **NOT TESTED**
- Real progressive streaming: **NOT TESTED**
- Packaged upstream cancellation: **NOT TESTED**
- Other providers: **NOT TESTED**

## Final status

API AND MODELS NOT WORKING

