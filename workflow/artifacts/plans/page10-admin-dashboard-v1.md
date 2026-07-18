---
slug: page10-admin-dashboard
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, R5, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page10-admin-dashboard-v1.md
source_of_truth: "Notion — E-comm website re-design, 'Page 10 — Admin Dashboard'"
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review-passed
  q1_resolution: "REUSE shared/styles/ — add `eyebrow` mixin there; admin gets local scss/layout + scss/pages partials with an admin.scss entry that @use's shared mixins/variables."
  q2_resolution: "ADOPT Notion redesign — light token-based sidebar replaces dark slate; parity judged vs Notion spec; visual QA owner = user (as page 09)."
---

# Plan — Page 10: Admin Dashboard

## Pause — plan-review (Q1, Q2 below)
First admin migration + redesign + token-foundation work. Two decisions needed before Build.

## Dependency-ordered phases

### Phase 1 — Admin design tokens (R1)
Port into `apps/admin/src/app/globals.css` (`:root` + dark block), matching web's values:
`--radius-sm/md/lg/xl/2xl/full`, `--shadow-sm/md/lg/xl/2xl`, `--blur-glass`, `--surface-3`.
Exit: tokens defined in both themes; admin build still passes.

### Phase 2 — SCSS foundation (R2)
**Proposed:** reuse `shared/styles/` — add `eyebrow` mixin there (harmless; web already has it). Create `apps/admin/src/styles/admin.scss` as the admin entry that `@use`s `shared/styles/mixins` + imports the partials. (Alternative: standalone `apps/admin/src/styles/{_mixins,_variables}`.)
Exit: `@use` resolves from admin; build passes.

### Phase 3 — Sidebar (R3)
`apps/admin/src/styles/scss/layout/_sidebar.scss` per Notion `.ms-sidebar` spec (brand, sub, nav, link/--active, user, avatar). Rewrite `sidebar.tsx`: drop `slate-*`/`blue-*`; light token design; `clsx` for `--active`; retain theme toggle + logout + mobile close. Width 13.75rem (note: layout currently hardcodes `md:w-64` = 16rem — reconcile to 13.75rem).
Exit: build passes; sidebar renders on all admin pages.

### Phase 4 — Admin page styles + shell + dashboard (R4)
`scss/pages/_admin.scss`: `.ms-card` (+`--stat`,`--padded`), `.ms-card__label/value/delta/icon`, `.ms-chart-card`, `.ms-table-container`, `.ms-table` (head/body/actions/action-btn). Rewrite `(dashboard)/layout.tsx` (shell, skip-link, mobile header → tokens/BEM) and `(dashboard)/page.tsx` (header, stat grid, chart cards, two tables, restock modal). Drop global `table`/`table-container`.
Exit: build passes; grep no `slate-*`/`blue-*` in touched files.

### Phase 5 — Charts (R5)
`RevenueWeeklyChart` + `HierarchicalBarChart`: fill `var(--brand-primary)` @15%, stroke brand; tooltip `var(--surface-glass)` + `backdrop-filter: blur(12px)` + `--radius-lg`/`--shadow-xl`.
Exit: build passes.

## Impacted Files
| File | Change |
|---|---|
| `apps/admin/src/app/globals.css` | Add token scale |
| `apps/admin/src/styles/**` (mixins entry + `scss/layout/_sidebar.scss`, `scss/pages/_admin.scss`) | Create |
| `shared/styles/_mixins.scss` | Add `eyebrow` |
| `apps/admin/src/components/layout/sidebar.tsx` | Rewrite → `.ms-sidebar` |
| `apps/admin/src/app/(dashboard)/layout.tsx` | Shell → tokens/BEM |
| `apps/admin/src/app/(dashboard)/page.tsx` | → `.ms-card`/`.ms-chart-card`/`.ms-table` |
| `apps/admin/src/components/dashboard/{RevenueWeeklyChart,HierarchicalBarChart}.tsx` | Tooltip/fill |

## Verification Plan
- `npm run build --workspace=apps/admin` → must pass.
- grep: no `slate-*`/`blue-*`/`bg-blue` in touched admin files; tokens defined.
- Visual parity = redesign → **manual QA (user)**.

## Risks / Notes
- **R-1 (high):** redesign changes admin look app-wide via shared sidebar/shell — intended, but affects pages not yet migrated (11/12 still have their own page bodies; chrome changes immediately).
- **R-2 (med):** token port must match web exactly to avoid drift across pages 11/12.
- **R-3 (med):** width change 16rem→13.75rem may shift layout; reconcile layout wrapper.
- **R-4 (low):** Recharts inline style vs CSS — tooltip styled via component props.

## Q1 — Foundation location (blocking)
Reuse **`shared/styles/`** (add `eyebrow`) for admin's mixins, with admin-local `scss/layout` + `scss/pages` partials? Or create a fully standalone **`apps/admin/src/styles/`** foundation (mirrors web, no shared coupling)? Recommend: reuse shared.

## Q2 — Redesign confirmation (blocking)
Confirm Page 10 should adopt the **Notion redesign** (dark slate sidebar → light token-based), i.e. visual change is intended and parity is judged against the Notion spec, not the current admin look. Manual QA owner = you (as with page 09)?
