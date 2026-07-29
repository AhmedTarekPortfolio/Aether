# Aether Repository Instructions

## Project

- Aether is a local-first Windows application built with Electron, React, TypeScript, Vite, Dexie, and Vitest.
- Treat `docs/LOCAL_FIRST_ARCHITECTURE_CONTRACT.md` as the primary architecture authority.
- Treat current repository code and committed documents as authoritative over summaries, plans, and historical reports.
- Read the current work-package authority and relevant code before making changes. Stop and report any conflict.

## Ownership

- Renderer repositories exclusively own Dexie access, database IDs, transactions, source metadata, segments, chunks, associations, jobs, and grounding records.
- Electron Main owns dialogs, managed filesystem access, hashing, validation, staging, promotion, reconciliation, utility-process supervision, credentials, and restricted-browser supervision.
- Main must never open Dexie or generate source-domain database IDs.
- Run complex untrusted parsing, including PDF parsing, image decoding, and OCR, only in an Electron `utilityProcess`; never run it in Main or the renderer.

## Managed Files

- Use only validated managed relative paths beneath `<userData>/sources`; keep `<userData>` private to Main.
- Never expose absolute paths or generic filesystem APIs to the renderer.
- Never accept renderer-provided arbitrary paths.
- Before filesystem access, validate containment, hashes, extension, MIME, signature, size, symlinks, junctions, traversal, UNC paths, drive paths, URIs, NUL bytes, and malformed paths.

## Source Data

- Store durable extracted text in `source_segments`; citations target segments.
- Keep `source_chunks` derived and rebuildable.
- Treat ready source versions as immutable.
- Preserve Backup Version 2 exactly.
- Implement Backup Version 3, OCR, AI grounding, and browser work only in their separately authorised work packages.

## Work-Package Workflow

For every work package:

1. Verify Git state.
2. Inspect authorities and repository conventions.
3. Define allowed and forbidden scope.
4. Implement only that package.
5. Add focused tests.
6. Run full tests, TypeScript checks, builds, packaging, and packaged-runtime verification where relevant.
7. Inspect the complete diff.
8. Commit only after every acceptance gate passes.
9. Stop before the next package.

## Git Safety

- Do not use destructive Git commands or discard another agent's work.
- Use separate commits for implementation and independently authorised fixes.
- Do not push, tag, amend, squash, force-push, or rewrite history without explicit authorisation.

## Required Verification

Run:

```bash
npm test -- --maxWorkers=2
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
npm run build
npm run build:electron
```

For Electron, filesystem, parser, browser, backup, or runtime changes, also run:

```bash
npm run package
```

Then verify the packaged Windows app with an isolated profile. Report exact commands and results; do not treat successful builds as packaged-runtime proof.

## Current PDF Status

- `docs/WP_LOCAL_06_PDF_PARSER_EVALUATION.md` records the approved WP-LOCAL-06 result selecting the exact `pdfjs-dist@4.10.38` pin.
- PDF parsing must run only in an Electron `utilityProcess`.
- Future PDF viewing must use a Main-owned opaque custom protocol without absolute-path or generic-filesystem capability.
- WP-LOCAL-07 is the next PDF work package.
- OCR remains excluded.
- Do not start WP-LOCAL-07 during repository-governance setup.
