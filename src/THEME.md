# Aether Design System & Theme Architecture

This document documents Aether's CSS custom property design token system and light/dark theme switching mechanics.

---

## Token Source of Truth (`src/index.css`)

All color palettes, surfaces, glassmorphic filters, and elevation shadows are centralized under `:root`, `html.dark`, and `html.light` CSS custom properties in `src/index.css`.

### Tokens
- **Surfaces**: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-card`, `--bg-input`, `--bg-overlay`
- **Text Contrast**: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverted`
- **Brand Accents**: `--accent-blue`, `--accent-emerald`, `--accent-purple`, `--accent-amber`, `--accent-rose`
- **Borders & Glass**: `--border-glass`, `--border-glass-hover`, `--shadow-card`

### Tailwind Integration (`@theme`)
Tailwind v4 maps CSS variables to theme utility classes via `@theme`:
- `bg-[var(--bg-primary)]`, `text-[var(--text-primary)]`, `border-[var(--border-glass)]`
- `bg-[var(--accent-blue)]`, `text-[var(--accent-emerald)]`

---

## Theme Switching Mechanism

1. Theme switching adds or removes the `light` and `dark` class on `document.documentElement` (`<html class="dark">` vs `<html class="light">`).
2. Theme preference is persisted locally in Dexie IndexedDB under `settings.theme` and synchronized via `useTheme()` hook (`src/hooks/useTheme.ts`).

---

## Developer Guardrails
- **No Hardcoded Hex Values**: New components must consume `var(--...)` tokens or Tailwind theme classes, never hardcoded hex codes (`#0B1220`, `#4F7CFF`, etc.).
- **Focus Ring Accessibility**: All interactive elements must maintain WCAG AA compliant focus rings (`focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]`).
