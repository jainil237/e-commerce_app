---
slug: page08-account-cluster
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
  waiver: "User invoked 'proceed with page 08' — pattern established by page01–07; brief-review checkpoint waived."
---

# Think Brief — Page 08: Account Cluster

Three related authenticated routes migrated together:
- `apps/web/src/app/account/page.tsx` (118 lines) — profile dashboard. **Heaviest**: raw `gray-*` colours, two gradients (`from-brand-primary/20 via-brand-accent`), avatar, menu-card grid, logout.
- `apps/web/src/app/account/orders/page.tsx` (138 lines) — order list. Mixes global helper classes (`card`, `card-hover`, `badge-*`, `btn`) with inline Tailwind.
- `apps/web/src/app/account/addresses/page.tsx` (311 lines) — address CRUD. Raw `gray-*`, a custom SVG checkbox, and a `animate-in fade-in slide-in-from-top-4` entrance.

No CSS modules exist. Each page gets its own co-located SCSS file.

## Requirements

### R1 — `account/account.scss` + rewrite `account/page.tsx` → `ms-account`
All raw `gray-*` / `dark:` colours → CSS custom-property tokens. Both gradients preserved with `--brand-primary` / `--brand-accent`. Hover scale/translate/opacity effects wrapped in `@include m.motion`. `skeleton` loading class retained (RI3).
**AC:** compiles; no `gray-*` or `dark:` utilities; gradients render identically; all transitions motion-guarded.

### R2 — `orders/orders.scss` + rewrite `orders/page.tsx` → `ms-orders`
Self-contained BEM card (drop mixed `card card-hover`), full BEM empty state (drop mixed `card ... border-dashed`). Status pill keeps `badge-*` colour classes + a BEM shape class. `btn btn-primary btn-sm` login link retained as component-layer classes (RI3).
**AC:** compiles; no inline Tailwind utilities on BEM elements; status colours unchanged.

### R3 — `addresses/addresses.scss` + rewrite `addresses/page.tsx` → `ms-addresses`
Raw `gray-*` → tokens. Custom SVG checkbox preserved (peer-checked logic via SCSS `:checked` sibling selectors). `animate-in` entrance → keyframe under `@include m.motion`. Input/Button atoms keep their structural `className` overrides (RI3).
**AC:** compiles; no `gray-*`/`dark:`/`animate-in`; checkbox toggles visually; form entrance animates.

## Implicit Requirements
- **RI1** — every `transition-*`/`animation` wrapped in `@include m.motion`.
- **RI2** — no `dark:` prefixes; theme via CSS custom properties.
- **RI3** — retain shared component-layer classes (`badge-*`, `btn*`, `skeleton`), atom `className` overrides, and icon-intrinsic lucide classes.

## Architecture Notes
- **Namespaces:** `ms-account`, `ms-orders`, `ms-addresses` (one SCSS per route, not shared — structures differ too much).
- **Global helpers retained:** `badge-*`, `btn*`, `skeleton` are component-layer design-system classes (globals.css `@layer components`), not Tailwind utilities — out of scope to remove; mixing them with BEM is allowed (component + component).
- **gray-\* → token map:** `gray-50/950`→`--surface-1`, `white/gray-900`→`--surface-0`, `gray-100/800` border→`--border-subtle`, `gray-200`→`--border-base`, `gray-900/white` text→`--text-primary`, `gray-500/400`→`--text-secondary`, `gray-300`→`--text-tertiary`.
- Plan owns full BEM specs + mapping tables. Build owns file writes.
