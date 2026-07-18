---
slug: page09-order-detail
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4]
upstream:
  brief: workflow/artifacts/briefs/page09-order-detail-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review-passed
  q1_resolution: "User approved foundation (shared/styles/ duplicated), execution order, and elected to perform manual QA of admin RMA/modal visual parity themselves (residual-risk owner: user)."
---

# Plan — Page 09: Order Detail (`/orders/[id]`)

## Objective
Migrate the order-detail surface (thin web route + shared `OrderDetailsPage` + `components.tsx`) to a shared SCSS BEM foundation, without regressing the admin order/RMA flow. **Complex, cross-app.**

## Pause — plan-review checkpoint (Q1)
This is the first cross-app Complex change and carries the highest regression risk in the series (admin order detail + RMA management). Requesting approval on the **foundation decision** and **execution order** before any code is written. See Q1 at the bottom.

## Dependency-ordered phases

### Phase 1 — Shared foundation (R1)
Create `shared/styles/_variables.scss` + `_mixins.scss` mirroring `apps/web/src/styles/*`. No app coupling. Exit: files exist, `@use` resolves.

### Phase 2 — `order-details.scss` (R2)
Create `shared/pages/order/order-details.scss`, `@use '../../styles/mixins' as m` + `variables as v`. `ms-order` namespace. Blocks (preview, full spec authored in Build):
- Layout: `ms-order`, `__container`, `__back`, `__grid` (lg 3-col), `__main`, `__sidebar`, `__panel` (surface-0 card), `__panel-title`
- From components.tsx: `ms-order-header`, `ms-order-tracker` (+ `__step`, `__line`, `__dot`, `__dot--done/--current`, `__label`), `ms-order-items` (+ `__item`, `__media`, `__info`, `__meta`, `__actions`), `ms-order-summary` (+ rows/total/divider), `ms-order-address`, `ms-order-tracking`
- Modals: `ms-order-modal` (+ `__backdrop` via `backdrop-filter`, `__card`, `__header`, `__body`, `__footer`, `__success`), reused by customer + admin
- Admin: `ms-order-rma` (+ `__req`, `__head`, `__items`, `__meta`, `__note`, `__actions`, status pill)
- Banners: `ms-order-banner--success`, `ms-order-banner--track`, `ms-order-note` (internal/blue), cancelled banner `ms-order-tracker--cancelled`
Exit: compiles in both apps.

### Phase 3 — `components.tsx` (R3)
Convert all 6 sub-components to `ms-order-*`. `dark:` red cancelled-banner → `color-mix(var(--error) ...)`. Retain `SharedBadge`/`SharedButton` className overrides + icon classes. Exit: grep 0 `dark:`/structural Tailwind; build passes.

### Phase 4 — `OrderDetailsPage.tsx` (R4a)
Main layout, customer return/replace modal, `AdminRmaSection` + admin modal → BEM. `dark:` blues/greens/reds → `color-mix`. `backdrop-blur-md` → `backdrop-filter: blur(12px)` in `__backdrop`. `animate-pulse` → `@keyframes ms-order-pulse` under `@include m.motion`. Retain `accent-[var(--brand-primary)]`, `font-mono`, atom overrides. Exit: build passes.

### Phase 5 — Web route (R4b)
`apps/web/src/app/orders/[id]/page.tsx`: loading, not-found, success banner, track button → BEM (`ms-order-banner--success/--track`, shared `__loading`/`__notfound`). Exit: build passes.

## Impacted Files
| File | Change |
|---|---|
| `shared/styles/_variables.scss` | Create |
| `shared/styles/_mixins.scss` | Create |
| `shared/pages/order/order-details.scss` | Create |
| `shared/pages/order/components.tsx` | Rewrite to BEM |
| `shared/pages/order/OrderDetailsPage.tsx` | Rewrite to BEM |
| `apps/web/src/app/orders/[id]/page.tsx` | Rewrite to BEM |

## Verification Plan
- `npm run build --workspace=apps/web` → must pass (compiles scss + web route).
- `npm run build --workspace=apps/admin` → **must pass** (admin consumes shared component; primary regression gate).
- grep: 0 `dark:`, 0 structural Tailwind on BEM elements in shared files.
- Every R/RI maps to a build + grep evidence row in Test.

## Risks / Notes
- **R-1 (high): admin visual regression across ~20 conditional states** (RMA status branches, two modals, success animation). Build compiles ≠ visual parity. Mitigation: faithful 1:1 token mapping; flag manual QA of admin order+RMA as residual risk into Ship.
- **R-2 (med): shared foundation duplication.** `shared/styles/*` duplicates `apps/web/src/styles/*`. Accepted: avoids cross-app relative `@use`. Future: could promote to a single source if a build alias is added.
- **R-3 (med): admin gains an SCSS compile step.** First `.scss` in admin's graph. `sass` hoisted at root; Next 14 supports it natively. Verified availability; confirmed by Phase-wise admin build.
- **R-4 (low): `glass`/blur parity.** `backdrop-filter: blur(12px)` ≈ Tailwind `backdrop-blur-md`. Visual-equivalent.
- **No logic touched.**

## Q1 — plan-review approval (blocking)
Approve to proceed to Build:
1. **Foundation:** create `shared/styles/` (duplicated from web) as the cross-app SCSS foundation — OK?
2. **Execution order:** foundation → scss → components.tsx → OrderDetailsPage.tsx → web route, verifying **both** web + admin builds — OK?
3. **Residual risk acceptance:** automated gate = both builds compile + grep clean; visual parity of admin RMA/modal states deferred to manual QA (recorded as residual risk) — acceptable, or do you want me to also drive a manual admin walkthrough in Test?
