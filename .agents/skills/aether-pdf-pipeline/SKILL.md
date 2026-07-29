---
name: aether-pdf-pipeline
description: Evaluate or implement PDF support in the Aether Electron application. Use for PDF parser evaluation, Electron utilityProcess PDF extraction, PDF import, PDF page segmentation, PDF viewer work, page-range selection, scanned-PDF detection, and PDF security or packaging tests.
---

# Aether PDF Pipeline

## Establish authority and scope

Before acting, read the current work-package request and these repository authorities:

- `docs/LOCAL_FIRST_ARCHITECTURE_CONTRACT.md`
- `docs/WP_LOCAL_06_PDF_PARSER_EVALUATION.md`
- `AGENTS.md`
- `src/types/sources.ts`
- `src/db/database.ts`
- `electron/services/sources/`
- `electron/ipc/sources.ipc.ts`
- `electron/types/source-storage.ts`
- `src/services/sources/`

Treat the repository as authoritative; reference these files instead of duplicating their contracts. If an authority is missing or conflicts with the requested work package, stop and report the conflict. Inspect Git status and the current package boundary before changing files. Preserve unrelated user changes.

## Enforce invariants

- Run PDF parsing only in an Electron `utilityProcess`, never in Main or the renderer.
- Keep renderer repositories as the sole Dexie owners.
- Keep managed files and utility-process supervision in Main.
- Never expose absolute paths to the renderer.
- Persist extracted PDF text as durable page-level `source_segments`; keep retrieval chunks derived.
- Keep Backup Version 2 unchanged.
- Exclude OCR until its separate work package.
- Do not begin production PDF implementation until parser evaluation has passed and its result is approved.
- Keep one work package per commit. Never push or tag without explicit authorization.
- Stop rather than crossing a work-package boundary.

For every implementation package, run focused tests, the full test suite, TypeScript checks, the renderer build, the Electron build, packaging, and packaged-runtime verification. Report exact commands, results, and any unverified gate; do not equate a build with packaged-runtime proof.

## Workflow A — Parser evaluation

1. Inspect the current repository architecture and applicable work-package boundary.
2. Evaluate maintained PDF parser candidates using official package documentation and repository evidence where possible.
3. Compare maintenance, security, licence, ESM/CommonJS support, Electron `utilityProcess` support, cancellation, page-level extraction, Arabic extraction, password handling, corrupt-file behavior, memory use, and Windows packaging.
4. Build only the minimum isolated evaluation harness. Do not add production UI or Dexie persistence.
5. Exercise representative normal, Arabic, password-protected, corrupt, large, and scanned PDFs; treat scanned-PDF handling as detection only, with no OCR.
6. Select a parser only after packaged `utilityProcess` execution is proven.
7. Produce a concise evaluation report with evidence, tradeoffs, risks, and a recommendation.
8. Stop before production implementation.

## Workflow B — Production PDF implementation

Run only after Workflow A has an approved result.

1. Import through the existing managed asset service.
2. Create renderer-owned source, version, and job metadata.
3. Run extraction in an Electron `utilityProcess`; supervise progress, cancellation, termination, limits, and failures from Main.
4. Validate every parser output and error payload in Main before forwarding path-free data to the renderer.
5. Persist durable page segments and derived chunks in renderer-owned transactions.
6. Add progress, cancellation, failure recovery, viewer, page navigation, page-range selection, and local search within the approved PDF package.
7. Do not add OCR, AI grounding, browser work, or Backup Version 3.
8. Verify packaged Windows import and restart persistence, in addition to every required implementation gate.
9. Commit only the completed PDF work package, then stop. Do not push or tag.
