---
slug: page08-account-cluster
version: 1
artifact: task
status: complete
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page08-account-cluster-v1.md
  plan: workflow/artifacts/plans/page08-account-cluster-v1.md
orchestration:
  phase: build
  status: complete
  next_phase: review
  blockers: []
---

# Build Task — Page 08: Account Cluster

## Completed Work

### R1 — `account/account.scss` + `account/page.tsx` → `ms-account`
- Both gradients reproduced via `color-mix` (hero band `/20` alpha) and solid `linear-gradient` (avatar).
- All hover effects (tile shadow/border, icon scale, sheen opacity, chevron/title colour, logout icon) wrapped in `@include m.motion`.
- `gray-*`/`dark:` → tokens. `skeleton` loading class retained.

### R2 — `orders/orders.scss` + `orders/page.tsx` → `ms-orders`
- Self-contained `ms-orders-card` + `ms-orders-empty` (dropped mixed `card`/`card-hover`).
- Status pill: `clsx('ms-orders-card__status', statusColors[...] || 'badge-neutral')` — BEM shape + retained `badge-*` colour class.
- Gate `btn btn-primary btn-sm` link retained (component-layer).

### R3 — `addresses/addresses.scss` + `addresses/page.tsx` → `ms-addresses`
- Custom SVG checkbox: Tailwind `peer`/`peer-checked` → SCSS sibling selectors (`&__input:checked ~ &__box`, `~ &__tick`).
- `animate-in fade-in slide-in-from-top-4` → `@keyframes ms-addresses-slide-in` under `@include m.motion`.
- `gray-*`/`dark:` → tokens. Atom `className` overrides (`flex-1 font-medium`, `w-full sm:w-auto`) retained; `hidden sm:inline-flex` → `ms-addresses__add-btn`.

## Evidence
- `npm run build --workspace=apps/web` → ✓ Compiled successfully; all 3 routes prerendered (○ Static). SCSS compiled into bundles.
- Bundle size reduced: `/account` 2.93→2.27 kB, `/account/addresses` 4.37→3.8 kB (Tailwind utilities removed).
- grep: zero `dark:`, `gray-*`, `animate-in`, `bg-gradient`, `peer-checked` residuals.
- No logic changes: fetch/CRUD/router/state untouched.
