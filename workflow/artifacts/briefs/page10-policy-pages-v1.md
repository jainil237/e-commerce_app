---
slug: page10-policy-pages
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, RI1, RI2]
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User invoked 'proceed with page 10' — pattern established by page01–09; brief-review checkpoint waived."
---

# Think Brief — Page 10: Static / Policy Pages

## Summary

Seven tiny, server-rendered static pages, all sharing an **identical layout shell**:
`max-w-4xl` page wrapper → `h1` title → `surface-0` card containing `h2`/`h3` headings, paragraphs, and (sometimes) bulleted lists. No state, no logic, no client directives, no cross-app concern.

| Route | Lines | Notable content |
|---|---|---|
| `cancellation` | 16 | h2 sections + paragraphs |
| `shipping` | 25 | h2 sections + bulleted lists (`list-disc`) |
| `contact` | 26 | h3/p info groups |
| `faq` | 27 | h3/p Q&A groups (`space-y-8`) |
| `returns` | 14 | h2 sections + paragraphs |
| `privacy` | 16 | h2 sections + paragraphs |
| `terms` | 13 | h2 sections + paragraphs |

All styling is inline Tailwind referencing CSS-var tokens already (`text-[var(--text-primary)]`, `bg-[var(--surface-0)]`, `border-[var(--border-base)]`). No `dark:`, no `gray-*`, no CSS modules.

## Requirements

### R1 — Create shared `apps/web/src/styles/policy.scss` (`ms-policy`)
One stylesheet imported by all seven pages (they live in sibling route dirs; a styles-dir file is the clean shared location — analogous to page07's shared `auth.scss`). `@use 'mixins'`/`variables`. ~12 BEM tokens.
**AC:** compiles; visually pixel-equivalent; no `@apply`/Tailwind utilities.

### R2 — Rewrite all seven `page.tsx` to BEM
Replace every inline Tailwind string with `ms-policy*` classes. Import `../../styles/policy.scss`.
**AC:** zero inline Tailwind on structural elements; each page renders identically.

## Implicit Requirements
- **RI1** — `space-y-*` child spacing → flex-column `gap` on the card (faq's `space-y-8` → `--gap-lg` modifier). `<strong>` tags stay (semantic).
- **RI2** — no new transitions (static pages have none); no `dark:` introduced.

## Architecture Notes
- **Role:** Architect
- **Namespace:** `ms-policy`, shared across all seven.
- **Shared location:** `apps/web/src/styles/policy.scss` (foundation dir) imported via `../../styles/policy.scss`. Avoids 7 duplicate co-located files.
- **Spacing fidelity:** card uses `display:flex; flex-direction:column; gap:1.5rem`; section `h2` gets a small `:not(:first-child)` top margin to reproduce the original `mt-8` section break. faq card → `--gap-lg` (2rem).
- **Paragraphs:** become classless `<p>` inheriting `color` from `__card` (removes inline `text-[var(--text-secondary)]`), idiomatic and parity-equivalent.
- Plan owns the BEM spec + per-page mapping. Build owns the writes.
