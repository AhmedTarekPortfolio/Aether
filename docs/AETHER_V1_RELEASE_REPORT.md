# Aether Version 1 Release Report

## Release scope and repository

- Starting commit: `f8f17cda7e87ab8ff961e3dc80c28b0a11207a88`
- Final release commit: the commit containing this report, resolved by annotated tag `aether-v1.0.0`
- Phase 1 checkpoint: `a34507d4e309d251316353714cab16fab9bc9d01` (`phase-1-complete`)
- Phase 2 WP-01: `a48bb2d57073b4336b6dec343d1aac568775fd36`
- Phase 2 WP-02: `f8f17cda7e87ab8ff961e3dc80c28b0a11207a88`

Version 1 includes the offline-first Windows/browser study workspace, subject/topic/task/note/flashcard/goal CRUD, focus and planning, persisted real statistics, canonical achievements, Version 2 backup/restore and legacy import, recovery interlocks, secure provider transport, and explicit note-grounded Ask Resources assistance.

## AI grounding

Ask Resources requires explicit subject and note selection. Retrieval is deterministic, user/subject scoped, locally weighted across note titles, tags, and content, and limited by fixed source and character budgets. The prepared request and privacy preview use the same exact excerpts. Unselected notes are excluded, source text is delimited as untrusted data, grounded answers cite stable labels such as `[R1]`, and unsupported questions return an explicit insufficient-evidence result without provider dispatch. Normal chat does not attach notes. Cancellation and zero-output paths create no empty record; AI persistence remains orchestrator-owned.

## Data compatibility and security

- IndexedDB/Dexie remains Version 3 with the existing 14 tables.
- Backup remains Version 2; legacy import remains supported.
- No schema, migration, package, lockfile, or dependency change was made for release.
- Automated backup/export/restore, legacy import, integrity, recovery-marker, credential, IPC, renderer-isolation, provider-error sanitization, unselected-note isolation, and AI persistence regressions pass.
- Credentials remain outside IndexedDB and backup output.
- Restore markers contain no filesystem path, recovery is deliberate rather than automatic, renderer isolation remains enabled, and IPC inputs remain validated.
- Disposable browser and Electron profile data is not committed.

## Verification results

- Vitest discovery: 44 source test files; generated release/build copies excluded.
- Automated tests: 545 passed, 0 failed.
- Renderer build: PASS (`npm run build`).
- Electron build: PASS (`npm run build:electron`).
- Dependency tree: PASS (`npm ls --depth=0`).
- Whitespace/diff validation: PASS (`git diff --check`).
- `package.json` / `package-lock.json` diff: empty.

Browser smoke opened all primary routes (`/`, `/plan`, `/workspace`, `/focus`, `/assistant`, `/insights`, `/settings`) with non-blank content. Existing persisted workspace data loaded after restart. The complete automated matrix covers essential CRUD, dependent-record validation, persistence, focus/planning metrics, achievements, Ask Resources selection/preview/citations/no-evidence, backup/restore, legacy import, and recovery behavior.

The packaged Electron executable launched from `app.asar` with an isolated disposable `--user-data-dir`. Its renderer reported the Aether title and packaged `file://` URL. A full process restart with the same isolated profile succeeded and retained Chromium IndexedDB/local-storage files. Native dialog, preload bridge, navigation, restore safety, and transport boundaries remain covered by the existing Electron and Phase 1 packaged regressions; WP-03 introduced no Electron boundary change.

## Windows artifacts

Packaging command:

```powershell
npm run dist
```

| Artifact | Size | SHA-256 |
|---|---:|---|
| `dist-desktop/Aether Setup.exe` | 261,657,347 bytes | `63A2FDB77DE1153D93CDCAA3661A0731D8E76B7A6C3AAD61052DCB12C30F432B` |
| `dist-installer/Aether-win32-x64/Aether.exe` | 186,328,576 bytes | `FA3FAFC32DFDF2604BC750CC46B37A96E1DA60D7EA3B1E71D7199B5BF19964D4` |

The normal repository workflow completed successfully. The installer uses the default Electron icon because no application icon is configured; this is a known presentation limitation, not a functional release failure.

## Known limitations and deferred work

Version 1 does not include PDF, DOCX, PPTX, or OCR ingestion; embeddings or vector databases; cloud sync; mobile applications; or binary academic-resource storage. These are intentionally deferred beyond Version 1. Remote-provider operation still requires the user to configure valid credentials and network access.

## Reproduction commands

```powershell
git fetch --tags origin
npx vitest list --filesOnly
npm test
npm run build
npm run build:electron
npm ls --depth=0
git diff --check
git diff -- package.json package-lock.json
npm run dist
Get-FileHash -Algorithm SHA256 "dist-desktop\Aether Setup.exe"
Get-FileHash -Algorithm SHA256 "dist-installer\Aether-win32-x64\Aether.exe"
```

## Final verdict

**PASS — AETHER VERSION 1 COMPLETE AND RELEASED**
