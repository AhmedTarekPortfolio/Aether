# WP-LOCAL-08B — Browser Sequencing Amendment

## 1. Status and Authority

| Field | Value |
|---|---|
| Status | Accepted architecture amendment |
| Repository | `D:\Ahmed's Work\Aether` |
| Branch | `main` |
| Baseline commit | `e877a5b56806906db4f5f388a4ca2ca3b7516ca9` |
| Preparation date | 2026-07-31 |
| Scope | Documentation-only work-package sequencing change |

This amendment is subordinate to and amends
`docs/LOCAL_FIRST_ARCHITECTURE_CONTRACT.md`. Where that contract previously
made image import and OCR a prerequisite for WP-LOCAL-08A, this amendment
controls. All other provisions of the contract remain authoritative.

This amendment changes sequencing only. It does not weaken or replace
renderer/Main ownership, managed-filesystem boundaries, `utilityProcess`
requirements, browser isolation, Backup Version 2 compatibility, Backup
Version 3 safety rules, the local-first direction, or the Supabase freeze.

## 2. Decision

**Image import and OCR are no longer prerequisites for the Electron upgrade
or restricted educational browser.**

OCR is an independent parser workload and may be deferred because no
production OCR code, image-processing code, or OCR/image-processing
dependencies will be introduced before WP-LOCAL-08. WP-LOCAL-08 must evaluate
and verify its dependencies directly against the Electron runtime already
accepted by then.

The approved order is:

1. WP-LOCAL-08B — Browser Sequencing Amendment (documentation only)
2. WP-LOCAL-08A — Supported Electron Upgrade and Regression Verification
3. Independent WP-LOCAL-08A review and any published correction
4. WP-LOCAL-09 — Trusted-Shell Restricted Educational Browser
5. Independent WP-LOCAL-09 security review and any published correction
6. WP-LOCAL-10 — Confirmed Browser Content Capture
7. WP-LOCAL-08 — Image Import and Isolated OCR
8. Independent WP-LOCAL-08 review and any published correction
9. WP-LOCAL-11 — Full-Workspace Backup Version 3

Existing later packages retain their numbering and follow WP-LOCAL-11.

## 3. Rationale

- The restricted browser provides immediate educational value.
- Rendering remote content requires a supported Electron/Chromium line.
- The repository currently declares Electron `^32.0.0`.
- Browser work must not proceed on that unsupported Electron line.
- Upgrading before OCR avoids building new parser work against an obsolete
  platform.
- Future OCR dependencies can be evaluated against the accepted upgraded
  Electron runtime rather than against Electron 32.
- Combining OCR, an Electron upgrade, and browser implementation would make
  one excessively broad and risky change.
- Separate packages provide clearer rollback, review, and verification
  boundaries.

This amendment does not select an Electron target. WP-LOCAL-08A must select the
exact supported stable Electron release line at execution time using then-current
official Electron release and support documentation.

## 4. Revised Dependencies

### WP-LOCAL-08B preconditions

- WP-LOCAL-05 is implemented, independently reviewed, corrected, and published.
- The repository is clean and synchronised.

### WP-LOCAL-08A preconditions

- WP-LOCAL-08B is accepted and published.
- All currently implemented application functionality has an established
  passing baseline.
- OCR and image-processing production code and dependencies remain absent.

### WP-LOCAL-09 preconditions

- WP-LOCAL-08A passes all acceptance gates.
- A separate independent review of WP-LOCAL-08A passes.
- The accepted upgrade and any required correction are published.
- Supported `WebContentsView` behaviour is verified in the packaged Windows
  application.

### WP-LOCAL-10 preconditions

- WP-LOCAL-09 passes a separate independent browser security review.
- Any required browser-security correction is published.

### Deferred WP-LOCAL-08 preconditions

- WP-LOCAL-09 and WP-LOCAL-10 are accepted.
- OCR parser and image-decode dependencies are evaluated on the upgraded
  Electron version.
- Production image decoding and OCR remain isolated in `utilityProcess`.

### WP-LOCAL-11 preconditions

WP-LOCAL-11 waits for WP-LOCAL-08 and its independent review. Backup Version 3
must include every durable source type implemented when WP-LOCAL-11 begins,
including browser captures and image assets/OCR segments. This preserves the
full-workspace promise and does not defer image/OCR backup support to a later
additive extension.

## 5. WP-LOCAL-08A Revised Scope

WP-LOCAL-08A is a compatibility and security upgrade, not a feature package.
It must:

1. Identify a currently supported stable Electron release line at execution
   time.
2. Use official Electron release and support documentation.
3. Record the exact selected version and rationale.
4. Inspect relevant breaking changes between Electron 32 and the selected
   target.
5. Upgrade only Electron and directly required compatible tooling.
6. Preserve business logic.
7. Preserve renderer/Main ownership.
8. Preserve preload parity.
9. Preserve all existing typed IPC.
10. Preserve PDF `utilityProcess` extraction.
11. Preserve the opaque PDF asset protocol.
12. Preserve source import and lifecycle operations.
13. Preserve source-grounded AI and citations.
14. Preserve AI credential storage.
15. Preserve Backup Version 2.
16. Rebuild and package successfully.
17. Launch the packaged Windows application using an isolated profile.
18. Verify all existing core flows.
19. Add focused Electron-upgrade regression tests.
20. Stop before implementing browser code.

## 6. Independent Upgrade Review

After WP-LOCAL-08A, a separate reviewer must independently inspect:

- selected Electron support status;
- dependency and lockfile changes;
- removed or deprecated Electron APIs;
- security preferences, sandbox behaviour, and context isolation;
- preload parity and IPC behaviour;
- `utilityProcess`, PDF parsing, and PDF viewing;
- managed storage;
- AI transport and credential storage;
- Backup Version 2;
- packaged runtime; and
- startup and restart persistence.

WP-LOCAL-09 must not use the upgrade commit as its base until this review
passes and every required correction is published.

## 7. WP-LOCAL-09 Restricted Browser Contract

WP-LOCAL-09 must use:

- a dedicated trusted-shell `BrowserWindow`;
- an isolated remote `WebContentsView`;
- no `webview` tag;
- no preload or Aether bridge in remote content;
- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- a dedicated partition such as `persist:aether-education-browser`;
- HTTPS-only internal browsing;
- an explicit user-managed allowlist and redirect revalidation;
- blocked popups and denied permissions;
- download interception;
- no direct remote-page import IPC or Dexie access;
- no credential sharing with the Aether renderer;
- no automatic page capture; and
- no browser implementation mixed into WP-LOCAL-08A.

Confirmed page capture remains exclusively in WP-LOCAL-10.

## 8. Browser Security Review Gate

After WP-LOCAL-09 and before WP-LOCAL-10, a separate independent review must
test at least:

- allowlisted HTTPS navigation;
- non-allowlisted HTTPS blocking and system-browser fallback;
- blocking of HTTP, `file:`, `javascript:`, `data:`, and custom schemes;
- redirect escape attempts;
- popup, permission, and download attempts;
- session isolation;
- absence of a remote preload, Aether bridge, and Node.js;
- renderer/Main IPC boundaries;
- window destruction and cleanup;
- crash containment; and
- packaged-runtime behaviour.

## 9. Deferred OCR Conditions

Deferring WP-LOCAL-08 does not remove it. Future OCR must:

- run only in `utilityProcess`;
- have no Dexie access, credentials, or browser cookies;
- use typed, bounded requests and responses;
- enforce image-dimension and decoded-pixel limits;
- defend against decompression bombs;
- support timeouts and cancellation;
- contain crashes;
- evaluate Arabic and mixed-text accuracy; and
- be tested and packaged against the upgraded Electron runtime.

## 10. Allowed and Forbidden Scope

Allowed in WP-LOCAL-08B:

- add this amendment;
- minimally update sequencing references in the authoritative contract;
- correct cross-references affected by the sequence; and
- document required stop conditions.

Forbidden in WP-LOCAL-08B:

- production code, tests, dependencies, lockfiles, or generated files;
- Electron upgrade or browser, OCR, image-import, or Backup Version 3
  implementation;
- schema changes, migrations, Backup Version 2 changes, UI work, Supabase,
  cloud, or sync.

## 11. Acceptance Criteria

WP-LOCAL-08B passes only if:

- sequencing is unambiguous;
- the Electron upgrade and its independent review remain mandatory before
  browser implementation;
- the independent browser security review remains mandatory before capture;
- OCR is deferred explicitly rather than removed;
- no production behaviour or source-domain ownership boundary changes;
- Backup Version 2 remains unchanged;
- no browser implementation starts;
- no unsupported Electron target is preselected; and
- all affected architecture references are internally consistent.

## 12. Stop Conditions

Stop and report if:

- another committed authority defines a conflicting sequence;
- delaying OCR breaks a currently implemented dependency;
- Backup Version 3 sequencing requires an unresolved owner decision;
- browser isolation would be weakened;
- browser implementation could begin before a supported Electron upgrade and
  independent review;
- production changes appear necessary; or
- unrelated repository changes are present.
