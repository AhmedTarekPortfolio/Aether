# Aether Desktop Application — Architecture Specification

## Overview

Aether has been architectural converted into a native Windows desktop application built with **Electron**, **React 19**, and **TypeScript**.

The application preserves full data compatibility with existing Dexie IndexedDB databases and exported backups, while relocating privileged system operations (AI HTTP transport, secure credential storage, native file dialogs) into the Electron Main process.

---

## Process Boundaries & Data Flow

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             RENDERER PROCESS                                │
│                                                                             │
│  React 19 / Vite UI Components (Focus, Plan, AI Assistant, Insights, etc.)  │
│  Dexie IndexedDB (Local persistence, backward compatible)                  │
│                                                                             │
│  Calls: window.aetherDesktop via src/desktop/desktopBridge.ts               │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
               Preload Bridge (contextBridge, IPCChannel)
               nodeIntegration: false, contextIsolation: true, sandbox: true
                                      │
┌─────────────────────────────────────▼───────────────────────────────────────┐
│                               MAIN PROCESS                                  │
│                                                                             │
│  electron/main.ts                                                           │
│  ├─ electron/ipc/ (Strict schema validation on input)                       │
│  ├─ electron/services/ai/ (Main process HTTP transport for AI providers)   │
│  │   └─ providers/ (NVIDIA NIM, OpenAI, Anthropic, Gemini, Local)         │
│  ├─ electron/services/credentials/ (Windows DPAPI safeStorage encryption)   │
│  ├─ electron/services/filesystem/ (Native dialog.showOpenDialog / Save)   │
│  └─ electron/security/ (navigation-policy, shell.openExternal for links)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Renderer-to-Main Data Flow

- The React UI invokes functions on `window.aetherDesktop` (exposed securely in `electron/preload.ts`).
- `electron/preload.ts` translates typed method calls into IPC invocations via `ipcRenderer.invoke(channel, payload)`.
- IPC payloads are schema-validated in `electron/security/validate-ipc-input.ts` before handler execution.
- No raw IPC channels, `require`, `fs`, `process`, or Electron modules are exposed to renderer JavaScript.

---

## 2. AI Request & Streaming Flow

1. **Request Dispatch**: Renderer calls `window.aetherDesktop.ai.generate(request)` or `window.aetherDesktop.ai.stream(request, onChunk)`.
2. **Credential Retrieval**: Main process `DesktopAIService` retrieves the encrypted API key from `CredentialService` using `profileId`.
3. **Provider Selection**: `DesktopAIService` routes the request to the matching provider adapter (`nvidia.provider.ts`, `openai.provider.ts`, etc.).
4. **Execution**: The provider adapter issues the `fetch()` call from Node.js in the main process (eliminating browser CORS limits).
5. **Streaming**: SSE streaming chunks are parsed in the main process and emitted to the renderer `webContents` via `IPCChannel.AI_STREAM_CHUNK`.
6. **Cancellation**: If the user cancels a request, renderer calls `ai.cancel(requestId)` which aborts the main process `AbortController`.

---

## 3. Credential Flow

- API keys are submitted once via `window.aetherDesktop.credentials.set({ profileId, apiKey })`.
- Main process encrypts keys using Electron `safeStorage` (Windows DPAPI) and persists them in `<userData>/desktop-credentials.json`.
- Renderer receives only status metadata `{ configured: boolean, mask: "••••••••4F2A" }`.
- API keys are **never** returned to the renderer after saving and are **never** exported in Dexie database backups.

---

## 4. Filesystem & Dialog Flow

- Import/Export UI calls `window.aetherDesktop.files.openFile()` or `window.aetherDesktop.files.saveFile()`.
- Main process opens OS-native file picker dialogs (`dialog.showOpenDialog` / `dialog.showSaveDialog`).
- File content is read/written cleanly by the main process and returned to the renderer without exposing Node.js filesystem modules to React.

---

## 5. Startup Flow (Development vs Packaged Production)

- **Development (`npm run dev:desktop`)**:
  - Vite starts dev server on `http://localhost:5173`.
  - Electron compiles `electron/` scripts into `dist-electron/` and loads `http://localhost:5173`.
  - Hot module replacement (HMR) operates normally.

- **Packaged Production (`npm run dist` / `npm run package`)**:
  - Vite builds static production files into `dist/`.
  - `tsc` compiles `electron/` into `dist-electron/`.
  - Electron main process loads local `dist/index.html` via file URL (`loadFile`). No local dev server or external server process is required.
