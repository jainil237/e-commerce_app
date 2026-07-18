---
slug: page07-auth
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User invoked 'proceed with page 07' — pattern established by page01–06; brief-review checkpoint waived."
---

# Think Brief — Page 07: Auth (`/account/login` + `/account/register`)

## Summary

Two closely related auth pages, grouped into a single migration because they share an identical outer shell, card layout, header, and footer pattern. Both pages use 100% inline Tailwind utility strings — no CSS modules exist to delete.

- `apps/web/src/app/account/login/page.tsx` — 117 lines. `LoginContent` is wrapped in `<Suspense>` (required by `useSearchParams`). Contains a login form (2 fields), a remember-me checkbox row with forgot-password link, and an auth footer.
- `apps/web/src/app/account/register/page.tsx` — 147 lines. No Suspense wrapper. Contains a registration form (5 fields) and an auth footer.

Both pages use identical outer structure: `min-h-screen flex items-center justify-center` shell + `max-w-md` inner wrapper + `text-center` header + card with `rounded-2xl shadow-sm`. The only structural difference is the form field count, form gap spacing, and submit button top margin.

The SCSS lives at `apps/web/src/app/account/auth.scss` — a single shared file imported by both pages via `import '../auth.scss'`.

---

## Requirements

### R1 — Write `apps/web/src/app/account/auth.scss`

Co-located SCSS file shared by login and register. `@use '../../styles/mixins' as m` and `@use '../../styles/variables' as v`. All inline Tailwind strings from both pages → BEM `ms-auth` namespace. ~30 BEM tokens total.

**Acceptance criteria:** File compiles without error; all visual output is pixel-equivalent to the current Tailwind output; no `@apply` or Tailwind utilities; checkbox uses `accent-color` instead of Tailwind `text-*` hack.

### R2 — Rewrite `apps/web/src/app/account/login/page.tsx`

Add `import '../auth.scss'`. Replace all inline Tailwind utility strings with BEM class strings. Suspense fallback div also gets `ms-auth` class.

**Acceptance criteria:** Zero remaining inline Tailwind utility strings on structural elements; page renders identically at all viewport sizes; Suspense fallback renders correctly.

### R3 — Rewrite `apps/web/src/app/account/register/page.tsx`

Add `import '../auth.scss'`. Replace all inline Tailwind utility strings with BEM class strings.

**Acceptance criteria:** Zero remaining inline Tailwind utility strings on structural elements; page renders identically.

---

## Implicit Requirements

### RI1 — `@include m.motion` for all transitions

No transitions or animations in the current pages. Hover effects on links (underline) are state-changes, not animated transitions — implemented as plain `:hover` rules without motion guard. If any `transition-*` property is added, it must use `@include m.motion`.

### RI2 — No `dark:` Tailwind prefixes

Neither page uses `dark:` prefixes. No special handling needed, but must not be introduced.

### RI3 — Atom-controlled classes stay

`Loader2 className="w-5 h-5 animate-spin"` (inline spinner in submit buttons) and `Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]"` (Suspense fallback spinner) are icon-intrinsic and stay. All icon `leftIcon` props on Input atoms are icon-intrinsic — the `w-5 h-5 text-[var(--text-tertiary)]` classes on lucide icons stay.

---

## Architecture Notes

- **Role:** Architect
- **Scope:** Style-only migration. No logic, no state, no auth flow is touched.
- **Namespace:** `ms-auth` (storefront prefix, matches page01–06 `ms-*` convention).
- **Shared SCSS:** Single `auth.scss` at `apps/web/src/app/account/` imported by both child pages. Avoids duplication of the identical shell/card tokens.
- **Form gap difference:** Login uses `space-y-5` (1.25rem); register uses `space-y-4` (1rem). Handled with `ms-auth-card__form--dense` modifier on the register form.
- **Submit margin difference:** Login uses `mt-4` (1rem); register uses `mt-6` (1.5rem). Handled with `ms-auth-card__submit--top-lg` modifier on the register submit Button `className`.
- **Checkbox accent-color:** The remember-me checkbox currently uses `text-[var(--brand-primary)]` which is Tailwind's approach to accent colouring native inputs. SCSS uses the correct `accent-color: var(--brand-primary)`.
- **Forgot-password and footer links:** `hover:underline` is a simple hover pseudo-class in SCSS — no transition, no motion guard needed.
- **No file deletions:** Neither page ever had a CSS module.
- **Downstream impact:** Plan owns the full BEM spec and mapping tables for both pages. Build owns the file writes.
