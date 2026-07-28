# Aether - WP-LOCAL-06 Isolated PDF Parser Evaluation

Prepared: 2026-07-29  
Scope: evaluation and proof of isolation only  
Production PDF import implemented: no  
WP-LOCAL-07 started: no

## 1. Final verdict

```text
PASS — WP-LOCAL-06 PDF PARSER SELECTED AND APPROVED
```

Selected parser:

```text
pdfjs-dist 4.10.38
Electron utilityProcess only
Explicit local pdf.worker.mjs URL
isEvalSupported: false
No native parser dependency
```

Selected future viewer:

```text
pdfjs-dist browser viewer/display layer in the trusted local renderer
Main-owned aether-asset: custom protocol
Opaque, bounded, PDF-only asset authorization
No absolute path and no generic filesystem capability
```

The approval is specific to the tested version and architecture. It is not an
approval to parse PDFs in Main or the renderer. PDF.js 5.4.296 and 6.2.108 are
not approved for the Electron 32 utility runtime.

## 2. Initial Git state

The mandatory preflight passed before any modification:

```text
Branch:             main
HEAD:               92fdb0d89d984788e3a35716f22e3acb12cf08e5
origin/main:        92fdb0d89d984788e3a35716f22e3acb12cf08e5
Divergence:         0 0
Working tree:       clean
```

Recent history:

```text
92fdb0d fix(sources): correct WP-LOCAL-03 review findings
1d76bc3 feat(sources): add text and markdown import
48c85dc feat(electron): add managed source asset service
b360d24 feat(db): add local-first source domain contracts
0ffbdc7 docs: WP-LOCAL-00 architecture contract
f4847b5 docs: release Aether version 1
```

## 3. Repository architecture reviewed

Authority reviewed:

- `docs/LOCAL_FIRST_ARCHITECTURE_CONTRACT.md`, especially Sections 8 and 10.
- Existing Main startup and sandboxed `BrowserWindow`.
- Typed preload, IPC channel, and desktop API conventions.
- Main-owned source staging, hashing, managed relative paths, and path
  containment.
- Renderer-owned Dexie repositories and Schema V4 source contracts.
- Root build, test, and packaging configuration.

The retained harness follows the required boundary:

```text
sandboxed renderer
  -> narrow contextBridge call
  -> ipcMain request validation
  -> Main resolves and hashes a managed relative path
  -> Electron utilityProcess
  -> structured progress/result
  -> Main validates every result field
  -> renderer-safe result
```

No evaluation result is persisted into Dexie.

## 4. Candidate parsers evaluated

| Candidate | Version assessed | Evaluation depth | Decision |
|---|---:|---|---|
| Mozilla `pdfjs-dist` | latest 6.2.108; 5.4.296; 4.10.38 | registry, source, advisory, Electron 32 utility, full corpus, ASAR package | select 4.10.38 |
| `pdf-parse` | 2.4.5 | registry/source plus Electron 32 embedded-Node extraction | reject |
| `unpdf` | 1.8.0 | registry/source plus Electron 32 embedded-Node extraction | reject |
| `@hyzyla/pdfium` | 2.1.13 | registry/source plus Electron 32 WASM extraction | reject |
| MuPDF npm package | 1.28.0 | registry, upstream source, license | reject |
| legacy `pdfium` | 0.0.1 | registry and repository age | reject |

No candidate other than the selected PDF.js pin was installed in Aether's
production dependency tree. Alternative runtime checks used a temporary
dependency tree outside the repository.

## 5. Dependency-maintenance comparison

Registry state observed on 2026-07-29:

| Candidate | Latest publication | Maintainer/release signal | Abandonment risk |
|---|---|---|---|
| PDF.js | 6.2.108 on 2026-07-28 | Mozilla project, multiple maintainers, frequent releases | low project risk; medium pinned-4.x risk |
| `pdf-parse` | 2.4.5 on 2025-10-20 | active rewrite, one listed npm maintainer | medium |
| `unpdf` | 1.8.0 on 2026-07-24 | active UnJS project, one listed npm maintainer | low-medium |
| `@hyzyla/pdfium` | 2.1.13 on 2026-05-12 | active, one listed npm maintainer | medium |
| MuPDF | 1.28.0 on 2026-06-29 | active Artifex project | low |
| legacy `pdfium` | 0.0.1 on 2015-03-27 | no release since 2015 | unacceptable |

The selected pin is not the newest PDF.js major. PDF.js 6.2.108 declares Node
`>=22.13.0 || >=24`; Electron 32 embeds Node 20.18.1. PDF.js 5.4.296 declares a
Node 20 range but failed in the real utility process because `DOMMatrix` was
absent. PDF.js 4.10.38 is the newest tested line that passed without adding a
native canvas dependency. WP-LOCAL-07 must pin it exactly and retain dependency
monitoring; a supported Electron upgrade must re-evaluate the current PDF.js
major.

Primary project references:

- [Mozilla PDF.js releases](https://github.com/mozilla/pdf.js/releases)
- [`pdf-parse` repository](https://github.com/mehmet-kozan/pdf-parse)
- [`unpdf` repository](https://github.com/unjs/unpdf)
- [`@hyzyla/pdfium` repository](https://github.com/hyzyla/pdfium)
- [MuPDF upstream repository](https://github.com/ArtifexSoftware/mupdf)

## 6. Security comparison

| Candidate | Memory-safety / parser profile | Supply-chain profile | Security decision |
|---|---|---|---|
| PDF.js 4.10.38 | JavaScript parser; memory corruption risk is lower than native code, but logic/RCE/DoS history remains | one production package, zero transitive production dependencies in the evaluated lock | selected only behind utility isolation and limits |
| `pdf-parse` 2.4.5 | wraps PDF.js 5.4.296 | adds `@napi-rs/canvas` native binaries | extra attack and packaging surface without needed control |
| `unpdf` 1.8.0 | bundled PDF.js serverless build | small package but embedded upstream code and unsupported Node engine | runtime warnings and unsupported engine |
| PDFium WASM | C++ PDFium compiled to WASM; WASM contains native memory faults but not CPU/memory DoS | zero npm dependencies, bundled 11 MiB WASM | useful fallback, but API/provenance gaps |
| MuPDF | mature native C parser compiled to WASM | bundled parser plus AGPL/commercial license | license reject before runtime approval |
| legacy native PDFium | native addon | abandoned binary/addon chain | unacceptable |

PDF.js had a high-severity arbitrary-JavaScript advisory,
[CVE-2024-4367 / GHSA-wgrm-67xf-hhpq](https://github.com/advisories/GHSA-wgrm-67xf-hhpq),
affecting versions through 4.1.392 and fixed in 4.2.67. The selected 4.10.38
is after that fix. The job configuration also sets `isEvalSupported: false` as
defense in depth.

`npm audit --omit=dev` for the isolated selected-parser package reported:

```text
0 vulnerabilities
2 production dependency nodes (package root plus pdfjs-dist)
```

The evaluation dev tree reports an Electron advisory because Electron 32 is
EOL. That is an application-runtime risk and must not be misrepresented as a
clean security baseline. It does not change the fact that the selected parser
package itself had zero audit findings. Electron's own guidance says to keep
Electron current and to treat process isolation as only one control.

References:

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process)

## 7. Licence comparison

| Candidate | Licence | Redistribution assessment |
|---|---|---|
| PDF.js | Apache-2.0 | commercially redistributable; retain licence and notices |
| `pdf-parse` | Apache-2.0 | commercially redistributable; includes PDF.js and native canvas notices |
| `unpdf` | MIT | commercially redistributable; retain copyright/licence |
| `@hyzyla/pdfium` wrapper | MIT | wrapper is permissive; bundled PDFium/third-party attribution provenance needs a separate binary-notice audit |
| MuPDF | AGPL-3.0-or-later or commercial licence | incompatible with an unapproved proprietary redistribution path |
| legacy `pdfium` | unclear package-era binary obligations | unacceptable |

MuPDF was rejected before installation because its upstream explicitly offers
AGPL or commercial licensing. The selected Apache-2.0 dependency has no
copyleft implication.

## 8. Electron and packaging compatibility

The selected configuration that passed:

```text
Electron:             32.3.3
Embedded Node:        20.18.1
Platform:             win32 x64
Module system:        ESM
Parser build:         pdfjs-dist/legacy/build/pdf.mjs
Worker:               local pdf.worker.mjs resolved to a file URL
Utility V8 heap flag: --max-old-space-size=384
ASAR:                 enabled in the standalone packaged evaluator
Native modules:       none
```

The utility entry point and PDF.js worker loaded from `app.asar`; the managed
PDF bytes remained outside the archive. The ASAR behavior is consistent with
Electron's documented virtual-filesystem support, while native executable
dependencies would require unpacking:
[Electron ASAR documentation](https://www.electronjs.org/docs/latest/tutorial/asar-archives).

Compatibility failures recorded:

- PDF.js 5.4.296: `ReferenceError: DOMMatrix is not defined` in the real
  Electron 32 utility process.
- PDF.js 4.10.38 without explicit worker URL: PDF.js rejected the missing
  `GlobalWorkerOptions.workerSrc`.
- PDF.js 4.10.38 with explicit local worker URL: passed unpackaged and ASAR.

## 9. Functional extraction comparison

| Capability | PDF.js 4.10.38 | `pdf-parse` 2.4.5 | `unpdf` 1.8.0 | PDFium WASM 2.1.13 |
|---|---|---|---|---|
| Per-page text | yes | yes | yes | yes |
| Page count | yes | yes | yes | yes |
| Item coordinates | yes | wrapper does not improve raw PDF.js need | yes through separate item API | not exposed by wrapper |
| Printed page labels | yes (`getPageLabels`) | page info wrapper | requires raw PDF.js access | not exposed |
| Metadata | yes | yes | raw PDF.js access | limited wrapper surface |
| Password detection | typed PDF.js exception | wrapper exception | PDF.js exception | load error/password argument |
| Incremental pages | yes | partial-page options | high-level methods fan out unless raw proxy used | yes |
| Progress | per-page host loop | host adaptation needed | host adaptation needed | per-page host loop |
| Cancellation | cooperative between pages plus process kill | process kill | process kill | process kill; WASM load is not cooperative |
| Viewer reuse | first-party viewer/display layer | still requires PDF.js | still PDF.js-based | separate viewer required |

The controlled corpus covered 22 generated PDFs and 34 scenarios:

1. Small digital text.
2. 30-page textbook.
3. Arabic.
4. Mixed Arabic/English.
5. Table.
6. Multiple columns.
7. Headings.
8. Printed page labels.
9. Scanned image-only.
10. Password-protected.
11. Corrupt.
12. Truncated.
13. 1,000-page document.
14. Unusual fonts.
15. Poor logical reading order.
16. Embedded images.
17. Blank pages.
18. Hostile/instruction-like text.
19. Safely mutated malformed stream.
20. Controlled process-fault target.
21. 50,000-item memory stress.
22. 32.20 MiB image-heavy byte stress.

No downloaded malware or copyrighted test document was used.

## 10. Arabic and mixed-language results

Final Noto Sans fixture measurements:

| Fixture | Exact Unicode similarity | Canonical readability | Result |
|---|---:|---|---|
| Arabic | 97.37% | readable logical-order Arabic | pass |
| Mixed Arabic/English | 99.35% | both language sections retained | pass |

PDF.js raw RTL items arrived in visual glyph order. The evaluated adapter groups
items by line, reverses RTL item runs without reversing each item's internal
text, and applies Unicode NFKC normalization. This is deterministic and
coordinate-aware.

The remaining exact-code-point differences were font ToUnicode variants such as
Arabic versus Persian forms. The adapter does not globally rewrite Persian
letters into Arabic letters, because that would corrupt legitimate Persian
documents.

`pdf-parse` and `unpdf` returned raw visual-order Arabic in their high-level text
APIs. PDFium WASM returned exact logical-order Arabic, but failed other required
selection criteria.

## 11. Performance results

Final packaged ASAR results:

| Scenario | Utility startup | Total | Pages / output | Peak working set |
|---|---:|---:|---:|---:|
| Small text | measured in result JSON | < 1 s | 1 / 127 chars | about 90 MiB |
| 30-page textbook | measured in result JSON | < 1 s | 30 / 5,382 chars | about 96 MiB |
| Arabic | measured in result JSON | < 1 s | 1 / 114 chars | about 92 MiB |
| 1,000 blank pages | measured in result JSON | about 2.2 s | 1,000 pages | about 102 MiB |
| 50,000 text items | measured in result JSON | about 9.5 s | 100 / 449,900 chars | 146.62 MiB |
| 32.20 MiB image PDF | measured in result JSON | about 1.5 s | 1 scanned page | 176.69 MiB |

The full machine-readable measurements are generated under
`evaluation/wp-local-06/results/` and intentionally ignored. The verifier reads
those results and asserts the safety gates.

Alternative hot embedded-Node checks:

| Candidate | Small first call | Arabic subsequent call | Observed RSS |
|---|---:|---:|---:|
| `pdf-parse` 2.4.5 | 1,247.94 ms | 52.56 ms | 76-81 MiB |
| `unpdf` 1.8.0 | 478.28 ms | 57.76 ms | 49-54 MiB |
| PDFium WASM 2.1.13 | 121.64 ms | 75.88 ms | 52-55 MiB |

These alternative timings exclude Renderer/Main/utility spawning and therefore
are not directly comparable to the full selected-parser path.

## 12. Memory results

```text
Acceptance ceiling:                     500 MiB
Selected V8 old-space ceiling:          384 MiB
Worst final packaged working set:       176.69 MiB
50,000-item packaged stress:            146.62 MiB
1,000-page packaged stress:             approximately 102 MiB
```

Every scenario stayed below 500 MiB. Main sampled the utility PID through
`app.getAppMetrics()` every 25 ms. The recommended production host must also
terminate a job if sampled working set exceeds 450 MiB, because the V8 heap flag
does not bound non-V8 buffers or all PDF.js allocations.

## 13. Cancellation and timeout results

Final behavior:

- Cancellation sends a typed cancellation token, permits a 500 ms cooperative
  grace period, then kills the utility if it has not exited.
- The controlled cancellation returned `PDF_EXTRACTION_CANCELLED` in less than
  two seconds and did not terminate Main.
- The 500 ms injected timeout returned `PDF_EXTRACTION_TIMEOUT` in less than
  1.5 seconds and killed the stuck utility.
- No temporary evaluation state remained.

Production recommendation: 120 second default job timeout, one second total
cancellation deadline, and a hard kill after the cooperative grace period.

## 14. Crash-containment results

The fault-injection scenario intentionally exited the utility with code 86:

```text
Renderer: alive
Main: alive
Utility: terminated
Returned error: PDF_PARSER_CRASHED
Next five repeated jobs: all completed
```

The renderer PID, Main PID, and utility PID were distinct. Utility environment
evidence showed:

```text
process.type:    utility
document:        absent
window:          absent
IndexedDB:       absent
localStorage:    absent
environment:     LANG, SYSTEMROOT, TEMP, TMP only
```

The worker imports no Dexie, credential-service, session, cookie, preload, or
renderer module.

## 15. Scanned-PDF detection result

The image-only fixture returned:

```text
status:            completed
errorCode:         PDF_SCANNED_CONTENT_DETECTED
scannedPageCount:  1
text characters:   0
raster images:     at least 1
```

Future production signals:

- No extracted non-whitespace text plus at least one page raster operation.
- Fewer than 20 non-whitespace characters plus a dominant raster image signal.
- Mixed documents count scanned pages individually.
- A valid render with failed/empty text extraction strengthens the signal.
- Blank pages without raster images are blank, not scanned.

OCR is not performed. The status is advisory and page-specific; OCR remains
WP-LOCAL-08 or a later package.

## 16. Viewer architecture decision

Use PDF.js in the trusted local renderer for rendering only. Do not give the
viewer an absolute path, `file:` URL, Node integration, or generic byte-read IPC.

Recommended flow:

```text
renderer asks Main for an opaque view grant for sourceVersionId
  -> Main verifies the renderer sender and renderer-owned metadata request
  -> Main resolves the managed PDF asset internally
  -> Main returns a short-lived aether-asset://pdf/<opaque-token> URL
  -> protocol handler serves only that exact validated PDF
  -> Range requests are bounded and read-only
  -> grant expires on view close, timeout, or source/version change
```

Register the custom scheme as secure and standard, set a restrictive CSP, deny
navigation, and validate IPC senders. Electron explicitly recommends a custom
protocol over `file:` URLs in its
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

Parser and viewer dependencies are separate decisions even if both use PDF.js:

- Parser: exact tested Node/utility build and limits.
- Viewer: browser display layer, renderer bundling, CSP, worker asset, and
  protocol behavior independently verified in WP-LOCAL-07.

## 17. Selected parser

```text
pdfjs-dist@4.10.38
```

Reasons:

- Passed real Electron 32 utility execution.
- Passed ASAR-packaged Windows execution.
- Page text, text-item coordinates, page count, page labels, metadata, and
  typed password/corrupt errors.
- Pure JavaScript and no selected-parser transitive dependencies.
- Apache-2.0.
- First-party path to the future viewer.
- Bounded by page, character, box, message, time, memory, and process limits.
- 97.37% exact Arabic and 99.35% exact mixed-language similarity.

## 18. Selected viewer technology

```text
PDF.js browser display/viewer layer
trusted local renderer
aether-asset: custom protocol
opaque per-view authorization
no filesystem paths
```

WP-LOCAL-07 must choose and pin the renderer build only after a browser-runtime,
CSP, Vite worker, ASAR, and packaged-Windows check. It must not silently assume
that the parser pin is automatically the best viewer pin.

## 19. Rejected alternatives and reasons

- **PDF.js 6.2.108**: current upstream release, but Node engine is incompatible
  with Electron 32's Node 20.18.1.
- **PDF.js 5.4.296**: real utility failure (`DOMMatrix` absent); adding native
  canvas solely to fill the gap is not the smallest safe design.
- **`pdf-parse` 2.4.5**: wraps PDF.js 5.4.296, adds `@napi-rs/canvas`, hides
  lower-level control needed for coordinates/limits, and returned raw
  visual-order Arabic.
- **`unpdf` 1.8.0**: declares Node >=22; Electron 32 run emitted missing
  `Math.sumPrecise` warnings and returned raw visual-order Arabic.
- **`@hyzyla/pdfium` 2.1.13**: fast and excellent Arabic, but the wrapper does
  not expose printed page labels or character boxes required by this package;
  bundled PDFium snapshot/third-party notice provenance needs a deeper binary
  audit; future viewer reuse is absent.
- **MuPDF 1.28.0**: AGPL-3.0-or-later or commercial licence, so commercial
  redistribution is not approved.
- **legacy `pdfium` 0.0.1**: last release in 2015 and obsolete Node engine
  metadata.

## 20. Final typed job contract

```typescript
type PdfErrorCode =
  | 'PDF_PASSWORD_PROTECTED'
  | 'PDF_INVALID_FORMAT'
  | 'PDF_CORRUPT'
  | 'PDF_TOO_LARGE'
  | 'PDF_PAGE_LIMIT_EXCEEDED'
  | 'PDF_CHARACTER_LIMIT_EXCEEDED'
  | 'PDF_EXTRACTION_TIMEOUT'
  | 'PDF_EXTRACTION_CANCELLED'
  | 'PDF_PARSER_CRASHED'
  | 'PDF_OUTPUT_INVALID'
  | 'PDF_SCANNED_CONTENT_DETECTED'
  | 'PDF_PARTIAL_EXTRACTION'
  | 'PDF_ASSET_MISSING'
  | 'PDF_HASH_MISMATCH';

interface PdfExtractionJobRequest {
  jobId: string;
  assetRelativePath: string;
  contentHash: string;
  byteSize: number;
  options: {
    maxPages: number;
    maxCharacters: number;
    maxBoundingBoxes: number;
    maxOutputBytes: number;
    includeCoordinates: boolean;
  };
  cancellationToken: string;
}

interface PdfBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PdfPageExtraction {
  ordinal: number;
  physicalPage: number;
  printedPageLabel: string | null;
  text: string;
  textHash: string;
  boundingBoxes: PdfBoundingBox[];
  rasterImageCount: number;
  likelyScanned: boolean;
}

interface PdfExtractionJobResult {
  jobId: string;
  status: 'completed' | 'partially_completed' | 'failed' | 'cancelled';
  pageCount: number;
  pages: PdfPageExtraction[];
  scannedPageCount: number;
  truncated: boolean;
  errorCode: PdfErrorCode | null;
  errorMessage: string | null;
}

interface PdfJobProgress {
  jobId: string;
  stage: 'loading' | 'parsing' | 'finalizing';
  pagesProcessed: number;
  totalPages: number | null;
  percent: number;
}
```

Production-only clarification:

- Renderer sends only a validated managed relative path plus identity facts.
- Main resolves the absolute path, verifies file type/size/hash, and sends that
  internal path to the utility.
- The absolute path never appears in the renderer request/result, logs, Dexie,
  or error message.
- The utility result is untrusted until Main validation succeeds.

Main validation must enforce:

- Exact job ID.
- Known status/error enums.
- Page-count bounds.
- Unique, ordered, contiguous ordinals.
- Physical pages within document bounds.
- String type, no NUL, aggregate UTF-8 byte/character bounds.
- Recomputed SHA-256 text hashes.
- Finite box coordinates and non-negative dimensions.
- Aggregate array/box limits.
- Serialized message-byte limit.
- No free-form metadata object.
- No native path in structural fields or errors.

## 21. Proposed safety limits

| Limit | Production default | Absolute policy | Evidence/rationale |
|---|---:|---:|---|
| Managed PDF storage | existing 200 MiB | unchanged | storage is not extraction approval |
| Extractable PDF bytes | 50 MiB | reject above 50 MiB in WP-LOCAL-07 | 32.20 MiB measured; no evidence supports 200 MiB |
| Page count | 1,000 | 5,000 only after a separately approved override | 1,000 pages measured |
| Extracted characters | 5,000,000 | 10,000,000 | contract ceiling; stop before overflow |
| Output IPC message | 16 MiB | 32 MiB | 16 MiB exercised; avoid contract's older 50 MiB default |
| Bounding boxes | 100,000 | 250,000 | explicit limit scenario passed |
| Job timeout | 120 s | 180 s hard | injected 500 ms timeout contained |
| V8 old space | 384 MiB | do not raise in WP-LOCAL-07 without re-test | worst working set 176.69 MiB |
| Working-set watchdog | 450 MiB | kill before 500 MiB acceptance ceiling | covers non-V8 allocations |
| Concurrent PDF jobs | 1 | 1 in WP-LOCAL-07 | avoids additive memory pressure |
| Progress updates | every page, throttled to 4/s | max 10/s | prevents IPC flooding |
| Cancellation grace | 500 ms | kill by 1,000 ms total | packaged cancellation passed |
| Temporary retention | delete immediately | startup sweep after 24 h for crash remnants | harness left none |

If a PDF exceeds 50 MiB, Aether may keep the already managed asset but must mark
extraction failed with `PDF_TOO_LARGE`; it must not silently attempt a 200 MiB
parse.

## 22. Error model

Stable renderer-safe codes are the `PdfErrorCode` union in Section 20.

Mapping rules:

- PDF.js `PasswordException` -> `PDF_PASSWORD_PROTECTED`.
- Structurally invalid header/xref/catalog -> `PDF_INVALID_FORMAT`.
- Malformed parse after valid header -> `PDF_CORRUPT`.
- Main byte policy -> `PDF_TOO_LARGE`.
- Pre-load page count -> `PDF_PAGE_LIMIT_EXCEEDED`.
- During-page text ceiling -> partial or failed
  `PDF_CHARACTER_LIMIT_EXCEEDED`.
- Main timeout -> `PDF_EXTRACTION_TIMEOUT`.
- User cancellation -> `PDF_EXTRACTION_CANCELLED`.
- Non-zero utility exit before result -> `PDF_PARSER_CRASHED`.
- Main schema/hash/box/message validation failure -> `PDF_OUTPUT_INVALID`.
- All/individual image-only pages -> completed result with
  `PDF_SCANNED_CONTENT_DETECTED`.
- Bounded partial page set -> `PDF_PARTIAL_EXTRACTION`.
- Managed file missing or identity mismatch -> `PDF_ASSET_MISSING` or
  `PDF_HASH_MISMATCH`.

Raw parser stacks, native paths, PDF.js internal messages, and utility exit
diagnostics remain Main-only.

## 23. Automated tests and totals

Evaluation:

```text
Generated fixtures:                  22
Scenarios per run:                   34
Unpackaged verifier assertions:      565 passed
Packaged ASAR verifier assertions:   565 passed
Evaluation assertion failures:       0
```

Coverage includes success, Arabic, mixed language, columns, labels, password,
corrupt, truncated, scanned, page/character/box/message limits, cancellation,
timeout, crash, invalid output, memory, repeated jobs, large byte size, hostile
text, blank pages, and packaged execution.

Aether regression:

```text
Test files: 57 passed
Tests:      671 passed
Failures:   0
```

## 24. Renderer build result

```text
npm run build
PASS
2731 modules transformed
```

Vite retained existing warnings about chunk size and mixed static/dynamic
imports. No PDF evaluation code is included in the production renderer.

## 25. Electron build result

```text
npm run build:electron
PASS
```

Also passed:

```text
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
```

## 26. Packaging result

```text
npm run package
PASS
dist-installer/Aether-win32-x64/Aether.exe created
```

The packaged Aether application started with an isolated user-data directory.
Four package processes were observed during the smoke, and all were explicitly
closed; zero remained.

## 27. Packaged evaluation result

The standalone evaluator was packaged as a real Windows x64 Electron 32.3.3
application with ASAR enabled.

```text
packaged flag:                  true
Electron:                       32.3.3
Node:                           20.18.1
Scenarios:                      34
Verifier assertions:            565 passed
Main survived timeout/crash:     yes
Worst working set:               176.69 MiB
Result:                          PASS
```

This is genuine packaged-runtime evidence, not an HTTP-server or TypeScript-only
claim.

## 28. Exact files changed

```text
.gitignore
docs/WP_LOCAL_06_PDF_PARSER_EVALUATION.md
evaluation/wp-local-06/README.md
evaluation/wp-local-06/package-lock.json
evaluation/wp-local-06/package.json
evaluation/wp-local-06/tsconfig.json
evaluation/wp-local-06/scripts/candidate-benchmark.mjs
evaluation/wp-local-06/scripts/generate_corpus.py
evaluation/wp-local-06/scripts/verify-results.mjs
evaluation/wp-local-06/src/contracts.ts
evaluation/wp-local-06/src/extractor.ts
evaluation/wp-local-06/src/index.html
evaluation/wp-local-06/src/main.ts
evaluation/wp-local-06/src/preload.cjs
evaluation/wp-local-06/src/renderer.js
evaluation/wp-local-06/src/utility-worker.ts
evaluation/wp-local-06/src/validator.ts
```

Generated corpus, results, rendered PNGs, installed evaluation dependencies,
build output, and packaged evaluator are ignored and are not committed.

No production application file changed. Backup Version 2 files did not change.

## 29. Commit hash, if committed

The retained evaluation harness and this report are committed together with:

```text
test(pdf): add isolated parser evaluation harness
```

A commit cannot embed its own final hash without changing that hash. The exact
containing commit hash is recorded in the delivery response and final Git-state
verification.

## 30. Final Git state

Required final policy:

```text
Branch:       main
Push:         none
Tag:          none
Remote edit:  none
```

The exact post-commit HEAD, origin/main, divergence, and cleanliness are recorded
after the commit in the delivery response. Generated ignored evaluation and
build artifacts do not affect `git status`.

## 31. Confirmation WP-LOCAL-07 was not started

Confirmed:

- No production PDF dependency was added to Aether's root `package.json`.
- No production PDF IPC channel, preload API, Main host, or utility entry point
  was added.
- No PDF import/viewer/page-range UI was added.
- No PDF source, segment, chunk, job, or grounding record was written to Dexie.
- No OCR was implemented.
- Backup Version 2 was not modified.
- WP-LOCAL-07 was not started.

## 32. Exact WP-LOCAL-07 implementation plan

1. **Dependency changes**
   - Add exact `pdfjs-dist@4.10.38` production pin for the utility parser only.
   - Audit production dependencies and retain Apache-2.0 notices.
   - Independently select/pin the browser viewer build after its Vite/CSP test.
   - Do not add `pdf-parse`, native canvas, MuPDF, or PDFium.

2. **Utility-process entry point**
   - Add `electron/services/sources/pdf/pdf-parser-utility.ts`.
   - Import only parser contract, crypto, bounded file read, and PDF.js.
   - Resolve packaged local `pdf.worker.mjs`.
   - Set `isEvalSupported: false`.
   - Expose typed job/cancel messages only.

3. **Main parser host**
   - Add `electron/services/sources/pdf/pdf-parser-host.ts`.
   - One active job maximum.
   - Minimal environment, 384 MiB V8 old-space, working-set watchdog.
   - Timeout, cancellation grace/kill, crash mapping, and cleanup.
   - Resolve paths only through existing managed-source path helpers.

4. **Typed IPC**
   - Add shared PDF contracts following `electron/types/source-storage.ts`.
   - Add narrow start/cancel/progress/result channels.
   - Validate sender and all request fields.
   - Update both TypeScript preload and checked CJS preload parity.

5. **Managed asset reading**
   - Renderer sends relative asset path, expected hash, and byte size.
   - Main verifies realpath containment, regular non-link file, `.pdf` identity,
     exact size, SHA-256, and 50 MiB extraction ceiling.
   - Utility receives the Main-resolved internal path.

6. **Page-level durable segments**
   - Renderer remains the only Dexie writer.
   - On validated completion, one transaction updates `source_versions` and
     inserts one durable `pdf_page` `source_segment` per physical page.
   - Persist page text/hash/label and a bounded page-level box representation.
   - Do not alter Backup V2.

7. **Processing jobs**
   - Create renderer-owned `source_jobs` records for extraction lifecycle.
   - Recover stale `running` jobs on startup as interrupted.
   - Make retries idempotent by source version plus processor fingerprint.

8. **Progress and cancellation**
   - Emit loading/parsing/finalizing progress, per page but at most four IPC
     updates per second.
   - User cancellation updates the operational job only after Main confirms
     cancellation/termination.
   - Enforce the one-second cancellation deadline.

9. **Viewer**
   - Add Main `aether-asset:` protocol registration and a PDF-only grant store.
   - Add `src/components/sources/PDFViewer.tsx`.
   - Use sandboxed trusted renderer, no Node integration, restrictive CSP.
   - Support bounded Range reads; never return an absolute path.

10. **Page navigation**
    - Add physical page navigation, printed-label display, current/total page,
      keyboard controls, and accessible announcements.
    - Distinguish physical page from printed label everywhere.

11. **Page-range selection**
    - Add validated inclusive physical ranges.
    - Bound range count and total selected pages.
    - Store selection intent in renderer state only until a later grounding
      request explicitly uses it.

12. **Scanned-PDF status**
    - Persist the validated per-page `likelyScanned` signal in the processing
      outcome/source version status allowed by existing contracts.
    - Show mixed/scanned status and explain that OCR is unavailable.
    - Do not implement OCR.

13. **Recovery**
    - Handle missing/hash-mismatched assets, parser crash, timeout, partial
      results, app restart, and stale view grants.
    - Never expose raw parser stacks or paths.
    - Permit safe retry with a new job ID and same immutable asset identity.

14. **Search integration**
    - After durable page segments commit, enqueue renderer-owned rebuildable
      chunks.
    - Index page text with physical page/printed label metadata.
    - Keep chunks derived and citations segment-based.

15. **Packaged Windows verification**
    - Run the complete generated corpus in packaged Aether, not only the
      standalone evaluator.
    - Verify ASAR worker resolution, custom protocol, Range reads, cancellation,
      timeout, crash containment, restart recovery, and viewer rendering.
    - Smoke with a separate user-data directory and clean process teardown.

16. **Tests**
    - Unit: request/result validation, paths, hashes, limits, errors, RTL
      reconstruction, scanned signals.
    - Integration: renderer IPC -> Main -> utility -> renderer result.
    - Failure: password, corrupt, truncated, timeout, crash, invalid result,
      cancellation, memory/output limits.
    - Repository: renderer-owned transactional page-segment persistence and
      rollback.
    - Viewer: protocol grant scope, Range behavior, CSP, page navigation,
      printed labels, selection accessibility.
    - Full 671-test regression plus both TypeScript/build/package gates.

17. **Commit boundary**
    - One WP-LOCAL-07 production commit after all gates pass.
    - Suggested message:

      ```text
      feat(pdf): add isolated PDF import and viewer
      ```

    - No Backup V3, OCR, image import, AI grounding redesign, browser, cloud,
      auth, sync, push, or tag work in that commit.
