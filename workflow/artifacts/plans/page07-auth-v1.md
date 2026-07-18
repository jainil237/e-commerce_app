---
slug: page07-auth
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page07-auth-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Plan — Page 07: Auth (`/account/login` + `/account/register`)

## Objective

Migrate two auth pages to a single shared co-located BEM SCSS file. No CSS modules to delete. Three files change: `auth.scss` (create), `login/page.tsx` (rewrite), `register/page.tsx` (rewrite).

---

## Phase 1 — Write `src/app/account/auth.scss`

`@use` paths: `../../styles/mixins` and `../../styles/variables`.

### Full BEM spec

```scss
@use '../../styles/mixins' as m;
@use '../../styles/variables' as v;

// ─── Page shell (shared: login + register) ────────────────
.ms-auth {
  min-height: 100vh;
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;

  &__wrapper {
    width: 100%;
    max-width: 28rem;
  }

  &__header {
    text-align: center;
    margin-bottom: 2rem;
  }

  &__title {
    font-size: 1.875rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: var(--text-primary);
  }

  &__subtitle {
    color: var(--text-secondary);
    margin-top: 0.5rem;
  }
}

// ─── Auth card ────────────────────────────────────────────
.ms-auth-card {
  background: var(--surface-0);
  padding: 2rem;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-subtle);

  &__form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;

    &--dense {
      gap: 1rem;
    }
  }

  &__remember-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.875rem;
    padding-top: 0.5rem;
  }

  &__remember-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  &__checkbox {
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-base);
    accent-color: var(--brand-primary);
    background: var(--surface-0);
  }

  &__forgot-link {
    color: var(--brand-primary);
    font-weight: 500;
    &:hover { text-decoration: underline; }
  }

  &__submit {
    width: 100%;
    margin-top: 1rem;

    &--top-lg {
      margin-top: 1.5rem;
    }
  }

  &__footer {
    margin-top: 2rem;
    text-align: center;
    font-size: 0.875rem;
  }

  &__footer-text {
    color: var(--text-secondary);
  }

  &__footer-link {
    color: var(--brand-primary);
    font-weight: 600;
    &:hover { text-decoration: underline; }
  }
}
```

**Token notes:**
- `rounded-2xl` (1rem) → `var(--radius-xl)` (1rem) — exact match
- `max-w-md` (28rem) → `max-width: 28rem`
- `p-8` (2rem) → `padding: 2rem`
- `py-12 px-4` (3rem vertical / 1rem horizontal) → `padding: 3rem 1rem`
- `shadow-sm` → `var(--shadow-sm)`
- `space-y-5` (1.25rem child gap) → `gap: 1.25rem` in flex-column form
- `space-y-4` (1rem child gap) → `gap: 1rem` via `--dense` modifier
- `mt-4` → `margin-top: 1rem` (default submit)
- `mt-6` → `margin-top: 1.5rem` (`--top-lg` modifier)
- `mt-8` → `margin-top: 2rem` (footer)
- `mb-8` → `margin-bottom: 2rem` (header)

---

## Phase 2 — Rewrite `src/app/account/login/page.tsx`

**Import add:**
```ts
import '../auth.scss'
```

### Inline Tailwind → BEM mapping (login)

| Location | Current inline Tailwind | BEM class |
|---|---|---|
| Suspense fallback div | `min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4` | `ms-auth` |
| LoginContent outer div | `min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4` | `ms-auth` |
| Inner wrapper div | `max-w-md w-full` | `ms-auth__wrapper` |
| Header div | `text-center mb-8` | `ms-auth__header` |
| h1 | `text-3xl font-bold tracking-tight text-[var(--text-primary)]` | `ms-auth__title` |
| Subtitle p | `text-[var(--text-secondary)] mt-2` | `ms-auth__subtitle` |
| Card div | `bg-[var(--surface-0)] p-8 rounded-2xl shadow-sm border border-[var(--border-subtle)]` | `ms-auth-card` |
| Form | `space-y-5` | `ms-auth-card__form` |
| Remember row div | `flex items-center justify-between text-sm pt-2` | `ms-auth-card__remember-row` |
| Remember label | `flex items-center gap-2 text-[var(--text-primary)] cursor-pointer` | `ms-auth-card__remember-label` |
| Checkbox input | `w-4 h-4 rounded border-[var(--border-base)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] bg-[var(--surface-0)]` | `ms-auth-card__checkbox` |
| Forgot password Link | `text-[var(--brand-primary)] font-medium hover:underline` | `ms-auth-card__forgot-link` |
| Submit Button `className` | `w-full mt-4` | `ms-auth-card__submit` |
| Footer div | `mt-8 text-center text-sm` | `ms-auth-card__footer` |
| Footer span | `text-[var(--text-secondary)]` | `ms-auth-card__footer-text` |
| Footer Link | `text-[var(--brand-primary)] font-semibold hover:underline` | `ms-auth-card__footer-link` |

Retained per RI3: `Loader2 className="w-5 h-5 animate-spin"` and `Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]"` in the Suspense fallback. All lucide icon `leftIcon` classes on Input components stay.

---

## Phase 3 — Rewrite `src/app/account/register/page.tsx`

**Import add:**
```ts
import '../auth.scss'
```

### Inline Tailwind → BEM mapping (register)

| Location | Current inline Tailwind | BEM class |
|---|---|---|
| Outer div | `min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4` | `ms-auth` |
| Inner wrapper div | `max-w-md w-full` | `ms-auth__wrapper` |
| Header div | `text-center mb-8` | `ms-auth__header` |
| h1 | `text-3xl font-bold tracking-tight text-[var(--text-primary)]` | `ms-auth__title` |
| Subtitle p | `text-[var(--text-secondary)] mt-2` | `ms-auth__subtitle` |
| Card div | `bg-[var(--surface-0)] p-8 rounded-2xl shadow-sm border border-[var(--border-subtle)]` | `ms-auth-card` |
| Form | `space-y-4` | `ms-auth-card__form ms-auth-card__form--dense` |
| Submit Button `className` | `w-full mt-6` | `ms-auth-card__submit ms-auth-card__submit--top-lg` |
| Footer div | `mt-8 text-center text-sm` | `ms-auth-card__footer` |
| Footer span | `text-[var(--text-secondary)]` | `ms-auth-card__footer-text` |
| Footer Link | `text-[var(--brand-primary)] font-semibold hover:underline` | `ms-auth-card__footer-link` |

Retained per RI3: `Loader2 className="w-5 h-5 animate-spin"`. All lucide icon `leftIcon` classes on Input components stay.

---

## Impacted Files

| File | Change |
|---|---|
| `apps/web/src/app/account/auth.scss` | **Create** |
| `apps/web/src/app/account/login/page.tsx` | Add scss import; replace inline Tailwind with BEM |
| `apps/web/src/app/account/register/page.tsx` | Add scss import; replace inline Tailwind with BEM |

---

## Risks / Notes

- **Single shared SCSS:** Both pages import `../auth.scss`. The BEM namespace `ms-auth` is unambiguous — no collision risk with other pages since other pages use different namespaces.
- **`rounded-2xl` → `var(--radius-xl)`:** Tailwind `rounded-2xl` = 1rem; project token `--radius-xl` = 1rem. Pixel-identical.
- **`accent-color` for checkbox:** Replaces Tailwind's `text-[var(--brand-primary)]` hack on native checkboxes. `accent-color` is the correct CSS property for native input colouring and has broad browser support.
- **`focus:ring-[var(--brand-primary)]`:** The checkbox focus ring is dropped as a Tailwind-only construct. The global `globals.css` already defines a focus ring via `.focus-visible:focus` selector — the native checkbox will inherit this appropriately.
- **No `@include m.motion`:** Neither page has animated transitions (hover underlines are instant state flips, not timed transitions). RI1 is satisfied by absence.
- **Suspense fallback:** The `LoginPage` Suspense fallback is a single `<div className="ms-auth">` wrapping a Loader2 — same outer shell class, no inner wrapper or card needed.
