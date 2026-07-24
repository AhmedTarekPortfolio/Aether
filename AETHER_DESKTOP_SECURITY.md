# Aether Desktop Application — Security Specification

## Security Model Overview

Aether enforces strict defense-in-depth isolation between the renderer UI process and system privileges.

---

## 1. Process Isolation & WebPreferences

The `BrowserWindow` is instantiated with hard security settings:

```ts
webPreferences: {
  preload: preloadPath,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
}
```

- **`nodeIntegration: false`**: Renderer code cannot access `require`, `process`, `Buffer`, or `fs`.
- **`contextIsolation: true`**: Preload script scripts execute in a separate context from renderer DOM JavaScript, preventing prototype pollution attacks against `window.aetherDesktop`.
- **`sandbox: true`**: Renderer process runs inside Chromium's OS sandbox.

---

## 2. Preload API Surface Control

The preload script (`electron/preload.ts`) exposes **only explicit, typed functions** using `contextBridge.exposeInMainWorld('aetherDesktop', ...)`:

### Allowed API Surface:
- `window.aetherDesktop.ai.generate`
- `window.aetherDesktop.ai.stream`
- `window.aetherDesktop.ai.cancel`
- `window.aetherDesktop.ai.testConnection`
- `window.aetherDesktop.ai.listModels`
- `window.aetherDesktop.credentials.set`
- `window.aetherDesktop.credentials.has`
- `window.aetherDesktop.credentials.remove`
- `window.aetherDesktop.credentials.getStatus`
- `window.aetherDesktop.files.openFile`
- `window.aetherDesktop.files.saveFile`
- `window.aetherDesktop.app.getInfo`
- `window.aetherDesktop.app.getVersion`
- `window.aetherDesktop.app.getPlatform`
- `window.aetherDesktop.window.minimize`
- `window.aetherDesktop.window.maximize`
- `window.aetherDesktop.window.close`

### Explicitly Prohibited Exposure:
- No generic `ipcRenderer` or `send`/`invoke` methods.
- No access to `require` or module resolution.
- No direct exposure of `fs`, `shell`, `process`, or `child_process`.

---

## 3. Strict IPC Input Validation

Every incoming IPC request is validated in `electron/security/validate-ipc-input.ts` prior to handler execution:
- Checks type, structure, and required non-empty string properties (`profileId`, `providerType`, `baseUrl`, `model`).
- Validates messages array structure.
- Malformed payloads are rejected immediately before reaching network or file handlers.

---

## 4. Credential Security & DPAPI Encryption

- API keys are encrypted at rest using Electron's `safeStorage` API, which leverages Windows Data Protection API (DPAPI).
- If `safeStorage` is unavailable, credentials fall back to machine-derived AES-256-GCM encryption.
- Stored credentials are **never returned to the renderer** after saving.
- Exported Dexie backups omit all credentials.

---

## 5. Navigation Security & External Link Policy

Implemented in `electron/security/navigation-policy.ts`:
- Main window navigation (`will-navigate`) is restricted exclusively to local static bundle assets (`file://`) or the local Vite dev server.
- External `http:` and `https:` links (e.g. documentation, reference links) are intercepted and opened safely in the user's default OS browser via `shell.openExternal()`.
- Arbitrary window creation (`setWindowOpenHandler`) is strictly denied (`action: 'deny'`).

---

## 6. Secret Log Redaction

All main process logging routes through `redactSecretsInString`, replacing sensitive key patterns (`nvapi-*`, `sk-*`, `Bearer`, `Authorization`, `x-api-key`) with `••••REDACTED` before console or file emission.
