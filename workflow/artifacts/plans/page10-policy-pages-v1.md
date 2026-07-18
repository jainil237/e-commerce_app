---
slug: page10-policy-pages
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/page10-policy-pages-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Plan — Page 10: Static / Policy Pages

## Phase 1 — `apps/web/src/styles/policy.scss`

```scss
@use 'mixins' as m;
@use 'variables' as v;

.ms-policy {
  max-width: 56rem;            // max-w-4xl
  margin: 0 auto;
  padding: 4rem 1rem;          // py-16 px-4
  @include m.sm { padding: 4rem 1.5rem; }
  @include m.lg { padding: 4rem 2rem; }

  &__title {
    font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em;
    color: var(--text-primary); margin-bottom: 2rem;
  }

  &__card {
    display: flex; flex-direction: column; gap: 1.5rem;   // space-y-6
    background: var(--surface-0);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    padding: 2rem;
    color: var(--text-secondary);
    &--gap-lg { gap: 2rem; }                              // faq space-y-8
  }

  &__h2 {
    font-size: 1.25rem; font-weight: 600; color: var(--text-primary);
    &:not(:first-child) { margin-top: 0.5rem; }           // ≈ mt-8 section break
  }

  &__group-title {
    font-size: 1.125rem; font-weight: 600; color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  &__list {
    list-style: disc; padding-left: 1.25rem;
    display: flex; flex-direction: column; gap: 0.5rem;   // list-disc pl-5 space-y-2
  }
}
```

Paragraphs: classless `<p>` (inherit `color` from `__card`). `<strong>` unchanged.

## Phase 2 — Rewrite seven pages

Each page: add `import '../../styles/policy.scss'`, then map:

| Inline Tailwind | BEM |
|---|---|
| `max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8` | `ms-policy` |
| `text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-8` | `ms-policy__title` |
| `bg-[var(--surface-0)] shadow-sm border border-[var(--border-base)] rounded-xl p-8 space-y-6 text-[var(--text-secondary)]` | `ms-policy__card` |
| faq card (`space-y-8`) | `ms-policy__card ms-policy__card--gap-lg` |
| `text-xl font-semibold text-[var(--text-primary)] mt-8 mb-4` / `mb-4` | `ms-policy__h2` |
| `text-lg font-semibold text-[var(--text-primary)] mb-2` (faq/contact h3) | `ms-policy__group-title` |
| `text-[var(--text-secondary)]` on `<p>` | remove (inherit from card) |
| `list-disc pl-5 text-[var(--text-secondary)] space-y-2` | `ms-policy__list` |
| contact/faq grouping `<div>` | `ms-policy__group` (plain block; gap from card) |

Per-page notes:
- **cancellation / returns / privacy / terms:** identical pattern — `ms-policy` → `__title` → `__card` → `__h2` + `<p>`.
- **shipping:** adds two `ms-policy__list` blocks; `<strong>` kept.
- **contact:** three `ms-policy__group` blocks, each `__group-title` h3 + classless `<p>`.
- **faq:** `__card--gap-lg`; three `__group` blocks, each `__group-title` h3 + classless `<p>`.

## Impacted Files
| File | Change |
|---|---|
| `apps/web/src/styles/policy.scss` | Create |
| `apps/web/src/app/{cancellation,shipping,contact,faq,returns,privacy,terms}/page.tsx` | Rewrite to BEM (7 files) |

## Verification Plan
- `npm run build --workspace=apps/web` → must pass; all 7 routes prerender (○ Static).
- grep: 0 inline Tailwind on structural elements across the 7 files.

## Risks / Notes
- **Low risk.** Static, web-only, no logic, tokens already var-based.
- `space-y` → flex `gap`: equivalent vertical rhythm; `h2:not(:first-child)` top-margin reproduces the `mt-8` section break.
- Minor: contact's original title→value gap (0.25rem) standardized to 0.5rem via `__group-title` — ~4px, visually negligible.
