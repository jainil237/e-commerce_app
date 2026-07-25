---
slug: page09-order-detail
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4]
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User invoked 'proceed with page 09' and selected full scope (route + shared component) via AskUserQuestion."
---

# Think Brief — Page 09: Order Detail (`/orders/[id]`)

## Summary

Unlike pages 01–08 (web-only route files), page 09 is **Complex and cross-app**. The route file is thin; the weight lives in a **shared** component consumed by **both** `apps/web` and `apps/admin`.

Surfaces:
- `apps/web/src/app/orders/[id]/page.tsx` (135 lines) — thin route wrapper. ~6 inline Tailwind strings (loading, not-found, success banner, track button).
- `shared/pages/order/OrderDetailsPage.tsx` (952 lines) — main layout + customer return/replace modal + `AdminRmaSection` (full RMA admin workflow with its own modal).
- `shared/pages/order/components.tsx` (280 lines) — 6 presentational sub-components (header, status tracker, items, summary, address, tracking).

Total ~243 `className` usages, heavy `dark:` utilities, glassmorphic modals (`backdrop-blur`), conditional RMA status branches.

## Investigated Constraints (Think findings)

1. **Admin is the regression surface.** `apps/admin/src/app/(dashboard)/orders/[id]/page.tsx` imports the same `OrderDetailsPage` with `viewer="admin"`. Any change ships to admin too.
2. **Admin has no SCSS foundation.** No `apps/admin/src/styles/`, zero `.scss` files — admin is pure Tailwind. But its `globals.css` defines the **same** CSS-var tokens (`--surface-*`, `--text-*`, `--brand-*`, `--border-*`).
3. **`sass` is hoisted at repo root** → both Next apps can compile a `.scss` import via built-in support. Verified present.
4. **Both apps use Tailwind** → retained icon-intrinsic utilities (`w-6 h-6`) and atom `className` overrides resolve in both apps. Only structural/colour Tailwind needs BEM conversion.
5. **Web mixins live only in `apps/web/src/styles`** → cannot be `@use`d from `shared/`. A shared foundation is required.

## Requirements

### R1 — Create shared SCSS foundation `shared/styles/_variables.scss` + `_mixins.scss`
Mirror `apps/web/src/styles/*`. Enables `shared/` SCSS to `@use` breakpoints, `motion`, `card-surface`, etc. without cross-app relative paths.
**AC:** both files exist; `@use` resolves; no dependency on `apps/web`.

### R2 — Create `shared/pages/order/order-details.scss` (`ms-order` namespace)
Single co-located SCSS covering all blocks across both component files. `@use '../../styles/mixins'`/`variables`.
**AC:** compiles in both `apps/web` and `apps/admin` production builds.

### R3 — Migrate `shared/pages/order/components.tsx` → `ms-order-*` BEM
6 sub-components. Convert structural + `dark:` Tailwind to BEM. `SharedBadge`/`SharedButton` `className` overrides retained (atom-controlled).
**AC:** no `dark:` or structural Tailwind on BEM elements; admin + web render unchanged.

### R4 — Migrate `shared/pages/order/OrderDetailsPage.tsx` → `ms-order-*` BEM + rewrite web route
Main layout, customer modal, `AdminRmaSection` + its modal → BEM. Then migrate `apps/web/src/app/orders/[id]/page.tsx` (loading/not-found/success banner/track button).
**AC:** no `dark:` or structural Tailwind on BEM elements; both apps build; all conditional states (modals, RMA branches, success anim) preserved.

## Implicit Requirements
- **RI1** — every transition/animation under `@include m.motion` (modal fades, status-step scale, hover states). `animate-pulse` success screen → keyframe under motion guard.
- **RI2** — no `dark:` prefixes; colour via CSS custom properties present in both apps' globals.
- **RI3** — retain `SharedButton`/`SharedBadge` `className` overrides, icon-intrinsic lucide classes, `accent-[var(--brand-primary)]` checkbox, `font-mono`.
- **RI4** — `glass`/`backdrop-blur` modal backdrops reproduced via SCSS (`backdrop-filter: blur(...)`), not Tailwind `backdrop-blur-md`.

## Architecture Notes
- **Role:** Architect
- **Namespace:** `ms-order` (single, shared by both component files).
- **Foundation decision:** new `shared/styles/` is the canonical SCSS foundation for cross-app shared components — first of its kind in the repo. Future shared migrations reuse it.
- **Blast radius:** web order detail + admin order detail + admin RMA management. **Highest risk in the series.**
- **Verification:** both `apps/web` and `apps/admin` production builds must pass. Build proves compilation, NOT visual parity across ~20 conditional states — that is residual risk for Test/manual QA.
- **No logic touched:** RMA fetch/submit, status mutation, invoice, tracking modal — all unchanged.
