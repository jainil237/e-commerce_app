---
slug: page10-admin-dashboard
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, R5, RI1, RI2, RI3]
source_of_truth: "Notion — E-comm website re-design (id 3863d3f7-968b-80e5-a7f0-e351fc4e2433), section 'Page 10 — Admin Dashboard'"
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User: 'start with /workflow for Page 10 — Admin Dashboard from notion'. Spec fetched from Notion."
---

# Think Brief — Page 10: Admin Dashboard (`/` in apps/admin)

## Summary
First **admin-app** migration and a genuine **redesign to the new design system** (not a faithful style-preserve like storefront pages). Per the Notion spec, the admin chrome moves from a hardcoded **dark slate** sidebar (`slate-900`, `blue-600`) to a **light, token-based** `.ms-sidebar` (`var(--surface-0)`, `--brand-primary` active, gradient avatar, 13.75rem wide).

Surfaces:
- `apps/admin/src/components/layout/sidebar.tsx` (119 lines) — shared admin chrome (all dashboard pages).
- `apps/admin/src/app/(dashboard)/layout.tsx` (70 lines) — shell, mobile drawer, skip-link.
- `apps/admin/src/app/(dashboard)/page.tsx` (655 lines) — header, 4 stat cards, 2 chart cards, recent-orders table, low-stock table, restock modal.
- `apps/admin/src/components/dashboard/RevenueWeeklyChart.tsx`, `HierarchicalBarChart.tsx` — Recharts tooltip/fill styling.

Notion target classes: `.ms-sidebar`, `.ms-card.ms-card--stat`, `.ms-chart-card`, `.ms-table` / `.ms-table-container`. Notion files: `scss/layout/_sidebar.scss`, `scss/pages/_admin.scss`.

## Think findings (blockers to resolve in Plan)
1. **Admin token gap.** `globals.css` is missing tokens the spec needs: `--radius-lg`, `--radius-xl`, `--shadow-xl`, `--blur-glass`, `--surface-3` (latter already *referenced* in `layout.tsx` but undefined). Must port the radius/shadow/blur scale from web's globals before SCSS.
2. **No admin SCSS foundation.** No `_mixins`/`_variables`. Spec uses `@include m.lg`, `m.eyebrow`, `m.price-text`. Reuse `shared/styles/` (created for page 09) — but it lacks `eyebrow`; add it.
3. **Redesign, not preserve.** Sidebar visual identity changes (dark→light). Confirm intent at plan-review.
4. **Shared chrome blast radius.** `.ms-sidebar` + dashboard layout affect *all* admin pages (11, 12 next). `.ms-card`/`.ms-table` are reused by 11/12 — design them generically here.

## Requirements
- **R1** — Port missing design tokens into `apps/admin/src/app/globals.css` (radius scale, shadow scale, blur-glass, surface-3).
- **R2** — Admin SCSS foundation: reuse `shared/styles/` (+ add `eyebrow` mixin) or create `apps/admin/src/styles/`. Decide in Plan.
- **R3** — `_sidebar.scss` + rewrite `sidebar.tsx` → `.ms-sidebar` (light, token-based, per spec).
- **R4** — `_admin.scss` (`.ms-card--stat`, `.ms-chart-card`, `.ms-table*`) + rewrite `(dashboard)/layout.tsx` shell + `(dashboard)/page.tsx`.
- **R5** — Chart components: tooltip glass + brand fill per spec.

## Implicit Requirements
- **RI1** — transitions motion-guarded (`@include m.motion`); spec's raw `transition: all .15s` wrapped.
- **RI2** — no hardcoded `slate-*`/`blue-*`; use tokens. Retain `table`→`ms-table` (drop old global `table`/`table-container`).
- **RI3** — preserve all logic (data fetch, restock modal, theme toggle, mobile drawer, auth redirect).

## Architecture Notes
- **Role:** Architect. **Namespaces:** `ms-sidebar`, `ms-card`, `ms-chart-card`, `ms-table`.
- Establishes the admin SCSS pattern for pages 11 & 12.
- **Verification:** `npm run build --workspace=apps/admin` (compile gate). Visual parity is a redesign → manual QA.
- Plan owns full BEM specs (from Notion), token list, and the foundation decision; **pauses at plan-review**.
