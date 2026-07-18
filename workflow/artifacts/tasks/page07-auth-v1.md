---
slug: page07-auth
version: 1
artifact: task
status: complete
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page07-auth-v1.md
  plan: workflow/artifacts/plans/page07-auth-v1.md
orchestration:
  phase: build
  status: complete
  next_phase: review
  blockers: []
---

# Build Task — Page 07: Auth (`/account/login` + `/account/register`)

## Completed Work

### Phase 1 — Created `apps/web/src/app/account/auth.scss` (R1 ✓)

- Shared BEM file at the `account/` level; imported by both child pages
- 2 BEM blocks: `ms-auth` (shell), `ms-auth-card` (card + all form/footer elements)
- ~30 BEM tokens; modifiers: `__form--dense`, `__submit--top-lg`
- No transitions → no `@include m.motion` needed (RI1 ✓)
- No `@apply`, no Tailwind utilities
- `accent-color: var(--brand-primary)` on checkbox (replaces Tailwind `text-*` hack)

### Phase 2 — Rewrote `apps/web/src/app/account/login/page.tsx` (R2 ✓)

- Added `import '../auth.scss'`
- All 16 inline Tailwind strings replaced with BEM class strings
- Suspense fallback div → `ms-auth`
- No `dark:` prefixes (RI2 ✓)
- `Loader2` icon classes retained (RI3 ✓); all `leftIcon` atom classes retained (RI3 ✓)

### Phase 3 — Rewrote `apps/web/src/app/account/register/page.tsx` (R3 ✓)

- Added `import '../auth.scss'`
- All 11 inline Tailwind strings replaced with BEM class strings
- Form uses `ms-auth-card__form--dense` (gap: 1rem vs login's 1.25rem)
- Submit uses `ms-auth-card__submit--top-lg` (margin-top: 1.5rem vs login's 1rem)
- No `dark:` prefixes (RI2 ✓); all `leftIcon` atom classes retained (RI3 ✓)

## Evidence

- TypeScript: `npx tsc --noEmit` → No errors found
- Lint: `npx next lint` (apps/web) → Errors: 0 | Warnings: 0
- Grep check: zero structural Tailwind strings remain; 8 retained icon-intrinsic `leftIcon` classes (RI3 ✓)
- No logic changes: auth flows, form validation, routing untouched
