# Aether Desktop Application — Build & Packaging Guide

## Development Environment Requirements

- **Node.js**: 18.x or 20.x+
- **npm**: 9.x+
- **Operating System**: Windows 10 or 11 (64-bit)

---

## Available npm Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:desktop` | Launches Vite dev server + Electron main process concurrently |
| `npm run dev:web` | Launches web dev server |
| `npm run build:desktop` | Compiles Vite React renderer bundle (`dist/`) + Electron main process scripts (`dist-electron/`) |
| `npm run build:web` | Compiles web renderer bundle |
| `npm run package` | Builds desktop app and packages unpacked Windows executable into `dist-installer/Aether-win32-x64/` |
| `npm run dist` | Packages desktop app into standalone unpacked binary bundle |
| `npm test` | Runs all 125 Vitest unit tests |

---

## Development Setup

To run Aether in desktop development mode with live hot-reloading:

```bash
npm run dev:desktop
```

This starts:
1. Vite dev server on `http://localhost:5173`.
2. TypeScript compiler watch mode on `electron/` (`dist-electron/`).
3. Electron desktop window loading `http://localhost:5173` with native desktop IPC handlers attached.

---

## Packaging Production Desktop App

To compile production bundles and generate the packaged desktop executable:

```bash
npm run package
```

### Generated Output Location:
```text
dist-installer/Aether-win32-x64/
├── Aether.exe (186 MB standalone Windows desktop executable)
├── resources/
├── locales/
└── *.dll / support files
```

---

## Code Signing Note

Code signing with fake credentials has intentionally been omitted. To sign the produced executable for production distribution, configure `win.certificateFile` and `win.certificatePassword` in `package.json` under `"build"` or pass environment variables:

```bash
export CSC_LINK="path/to/certificate.pfx"
export CSC_KEY_PASSWORD="your-password"
npm run dist
```
