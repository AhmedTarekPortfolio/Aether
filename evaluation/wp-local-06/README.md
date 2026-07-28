# WP-LOCAL-06 isolated PDF evaluation harness

This directory is a standalone, non-production Electron application used only to
evaluate PDF parsing for WP-LOCAL-06. It does not add a parser dependency to the
Aether application, expose a production UI, write to Dexie, or persist source
segments.

The generated corpus, results, rendered pages, installed dependencies, build
output, and packaged application are ignored. The corpus generator creates all
fixtures locally; it does not download documents or malware.

Architecture exercised:

```text
sandboxed renderer
  -> narrow contextBridge API
  -> validated ipcMain request
  -> Main-controlled managed path resolution and hash check
  -> Electron utilityProcess with a minimal environment and V8 heap limit
  -> structured extraction/progress result
  -> strict Main validation
  -> renderer-safe result
```

The evaluation-only actions `cancel`, `timeout`, `crash`, and `invalid-output`
are controlled fault injections. They prove supervision and validation without
requiring malware or a parser exploit.

The pinned `pdfjs-dist` version is the newest stable line whose declared Node
engine is compatible with Electron 32's embedded Node runtime at evaluation
time. It is intentionally scoped to this standalone package.
