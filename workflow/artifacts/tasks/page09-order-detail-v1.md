---
slug: page09-order-detail
version: 1
artifact: task
status: complete
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4]
upstream:
  brief: workflow/artifacts/briefs/page09-order-detail-v1.md
  plan: workflow/artifacts/plans/page09-order-detail-v1.md
orchestration:
  phase: build
  status: complete
  next_phase: review
  blockers: []
---

# Build Task — Page 09: Order Detail (cross-app)

## Completed Work

### R1 — Shared SCSS foundation
- `shared/styles/_variables.scss` + `shared/styles/_mixins.scss` (mirror web's; `sm/md/lg/xl`, `motion`, `card-surface`, `price-text`). No app coupling.

### R2 — `shared/pages/order/order-details.scss`
- `ms-order` namespace, `@use '../../styles/...'`. Blocks: page scaffold, panels, header, tracker, items, summary, address, tracking, shared modal, admin RMA, route banners.
- `backdrop-blur-md` → `backdrop-filter: blur(12px)` (RI4). `animate-pulse` → `@keyframes ms-order-pulse` under `@include m.motion` (RI1). All transitions motion-guarded.

### R3 — `components.tsx` → BEM
- 6 sub-components migrated. Cancelled banner `dark:` reds → `color-mix(var(--error) ...)`. Status tracker uses `clsx` for step/line/dot/label modifiers.

### R4 — `OrderDetailsPage.tsx` + web route
- Main layout, customer modal, `AdminRmaSection` + admin modal → BEM. `dark:` blues/greens/reds → `color-mix` / tokens. Restock checkbox `accent-color` in SCSS.
- Two inline icon colours kept as `style={{ color }}` (return red / replace blue) — dynamic per-branch, acceptable.
- Web route `apps/web/src/app/orders/[id]/page.tsx`: loading/not-found/success-banner/track-button → BEM.

## Evidence
- `npm run build --workspace=apps/web` → ✓ Compiled successfully.
- `npm run build --workspace=apps/admin` → ✓ Compiled successfully; `/orders/[id]` built (8.9 kB). **Admin compiles the shared SCSS** — confirms `sass` pipeline works in admin's pure-Tailwind app.
- grep: 0 `dark:` in shared order files.
- Remaining utility strings (15) are all `SharedButton`/`SharedBadge` `className` overrides — atom-controlled, retained per RI3.
- No logic touched: RMA fetch/submit, status mutation, invoice, tracking modal unchanged.

## Residual Risk (carried to Ship)
- Visual parity across ~20 conditional states (RMA status branches, both modals, success animation) — **owner: user** (elected manual QA at plan-review Q1). Build proves compilation, not pixel parity.
