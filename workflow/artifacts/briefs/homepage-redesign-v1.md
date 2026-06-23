---
slug: homepage-redesign
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-21
updated: 2026-06-22
manifest_ids: [R1, R2, R3, R4, R5, R6, R7, R8, RI1, RI2, RI3, RI4, RI5, A1, A2, A3]
upstream: []
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
---

# Homepage Redesign (Page 01) — Brief

## Source Links

- Notion design spec: https://app.notion.com/p/3863d3f7968b80e5a7f0e351fc4e2433
  - Section: "Page 01 — Homepage (`/`)"
  - Section: "SCSS Architecture — Updated Approach"
  - Section: "Design System Token Reference"
- Current homepage: `apps/web/src/app/page.tsx`
- SCSS root (empty): `apps/web/src/scss/` (subdirs: `components/`, `layout/`, `pages/`)
- Topbar: `apps/web/src/components/organisms/Topbar/Topbar.tsx`
- BottomNav: `apps/web/src/components/organisms/BottomNav/BottomNav.tsx`
- Footer: `apps/web/src/components/layout/footer.tsx`
- ProductCard: `apps/web/src/components/molecules/ProductCard/ProductCard.tsx`
- Token definitions: `apps/web/src/app/globals.css`

## Problem

The current homepage (`apps/web/src/app/page.tsx`) is styled entirely with Tailwind utility classes. The Notion design spec mandates a migration to a BEM-based SCSS design system (`ms-*` class names) with CSS custom properties as tokens. The SCSS directory structure already exists but is empty. No SCSS foundation files (variables, mixins, barrel) exist yet.

## Goals

1. Write SCSS foundation files (`_variables.scss`, `_mixins.scss`, `scss/index.scss`) that all subsequent page implementations depend on.
2. Write all Page 01 SCSS partials: `layout/_promo-banner.scss`, `layout/_topbar.scss`, `layout/_bottom-nav.scss`, `layout/_footer.scss`, `pages/_home.scss`.
3. Rewrite `apps/web/src/app/page.tsx` using only `ms-*` BEM class names — no Tailwind utilities.
4. Rewrite `Topbar`, `BottomNav`, `Footer` components to use `ms-*` BEM class names (they render inside the homepage layout and must match the SCSS).
5. Wire the SCSS into Next.js so every page gets the styles.

## Non-Goals

- Pages 02–12 (PLP, PDP, Cart, Checkout, Account, etc.) — those are separate tasks.
- SCSS for pages not involved in the homepage layout (admin dashboard, auth pages).
- Any backend or API changes.
- Tailwind removal from the project config (globals.css may retain Tailwind base for now per spec: "Tailwind may remain in globals.css as a shim only").

## User Impact

Customers see the redesigned homepage with the new design system — proper motion, glass topbar, BEM-structured components, and dark mode token support. All subsequent page implementations will build on the SCSS foundation laid here.

## Success Metrics

- Homepage renders all 8 sections (promo banner, topbar, hero, categories, featured products, trust badges, footer, bottom nav) using only `ms-*` BEM classes.
- No Tailwind utility classes remain in `page.tsx`, `Topbar.tsx`, `BottomNav.tsx`, or `footer.tsx`.
- SCSS compiles without errors via Next.js built-in sass support.
- Dark mode (`.dark` on `<html>`) correctly flips all CSS vars on the homepage.
- `npm run lint` passes in `apps/web`.

## Requirements

### Explicit (R)

**R1 — SCSS foundation**
Write `apps/web/src/scss/_variables.scss` and `apps/web/src/scss/_mixins.scss` as specified in the Notion SCSS Architecture section. Write `apps/web/src/scss/index.scss` as the `@use` barrel that imports all partials.
Acceptance: `index.scss` can be imported in `layout.tsx` without compile errors; mixins (`m.glass`, `m.hide-scrollbar`, `m.motion`, `m.eyebrow`, `m.card-surface`, `m.price-text`) are available to all partials.

**R2 — Token gaps in globals.css**
`globals.css` is missing several tokens referenced by the Notion SCSS spec. Add to `:root` and `.dark`: `--shadow-sm/md/lg/xl/2xl`, `--container-max`, `--font-sans`, `--font-mono`, `--ring-brand`, `--blur-glass`, `--radius-full`.
Acceptance: every CSS var referenced in the SCSS files resolves without being undefined.

**R3 — Page 01 SCSS partials**
Write the five SCSS partials exactly as specified in Notion:
- `scss/layout/_promo-banner.scss` → `.ms-promo-banner`
- `scss/layout/_topbar.scss` → `.ms-topbar`, `.ms-search-dropdown`
- `scss/layout/_bottom-nav.scss` → `.ms-bottom-nav`
- `scss/layout/_footer.scss` → `.ms-footer`
- `scss/pages/_home.scss` → `.ms-hero`, `.ms-category-grid`, `.ms-category-card`, `.ms-section`, `.ms-section-header`, `.ms-trust-grid`, `.ms-trust-tile`
Acceptance: every BEM class used in R4–R6 has a corresponding rule in these files.

**R4 — Homepage page.tsx rewrite**
Rewrite `apps/web/src/app/page.tsx` using `ms-*` BEM class names only. Sections: promo banner → hero → categories (max 4) → featured products (max 8) → trust badges. Data fetching logic (server component pattern, SWR revalidate: 60) must be preserved.
Acceptance: no Tailwind classes remain; all 5 sections render; `npm run build` succeeds.

**R5 — Topbar rewrite**
Rewrite `apps/web/src/components/organisms/Topbar/Topbar.tsx` using `.ms-topbar` BEM classes. Preserve: sticky behavior, search with dropdown, cart badge, mobile hamburger menu, category chip rail, dark mode toggle. All logic (useCart, useTheme, useStoreConfig, search fetch) must be preserved.
Acceptance: no Tailwind classes remain; mobile hamburger, search dropdown, and cart badge all function.

**R6 — BottomNav rewrite**
Rewrite `apps/web/src/components/organisms/BottomNav/BottomNav.tsx` using `.ms-bottom-nav` BEM classes. Preserve: active-state indicator bar, cart badge, pathname-based active detection.
Acceptance: no Tailwind classes; mobile only (hidden on md+); active tab shows indicator.

**R7 — Footer rewrite**
Rewrite `apps/web/src/components/layout/footer.tsx` using `.ms-footer` BEM classes. Preserve: 4-column grid, trust row, copyright, useStoreConfig integration. Desktop only (`display: none; md+: block`).
Acceptance: no Tailwind classes; renders correctly on desktop; hidden on mobile.

**R8 — ProductCard Tailwind removal + BEM migration**
Remove all Tailwind utility classes from `apps/web/src/components/molecules/ProductCard/ProductCard.tsx` and rewrite using `.ms-pc` BEM class names as specified in the Notion BEM spec. Write `scss/components/_product-card.scss` with all `.ms-pc` rules.
Acceptance: no Tailwind classes in ProductCard; featured products on homepage render with correct `.ms-pc` structure; wishlist toggle, discount badge, and Add to Cart button all function.

### Implicit (RI)

**RI1 — SCSS import wired into Next.js**
`apps/web/src/scss/index.scss` must be imported exactly once — in `apps/web/src/app/layout.tsx` — so all pages get the styles without each page importing separately.
Acceptance: SCSS styles apply on all routes without per-page import.

**RI2 — No inline styles in component files**
Per Notion spec: "No Tailwind utilities, no inline styles anywhere in component or page files." Exception: `style={{ color: 'var(--error)' }}` on logout button if no `ms-btn--ghost-danger` modifier is written (covered by future Account page task).
Acceptance: zero `style={{ ... }}` in the four files touched by this task, except any documented exception.

**RI3 — Motion mixin gates all animations**
All `animation:` and `transition:` declarations in the new SCSS files must be inside `@include m.motion { ... }` blocks so `prefers-reduced-motion: reduce` users see instant transitions.
Acceptance: `@media (prefers-reduced-motion: reduce)` users see no animations on homepage.

**RI4 — Dark mode coverage**
Every CSS var used in the new SCSS files must have a dark override defined in `globals.css` (`.dark { ... }`). The missing tokens added in R2 must also include dark overrides.
Acceptance: toggling `.dark` on `<html>` flips all homepage colors correctly.

**RI5 — ProductCard BEM alignment**
The homepage featured section uses `<ProductCard>`. Verify whether the existing `ProductCard` component already uses `ms-pc` BEM classes or still uses Tailwind. If Tailwind, a scoped fix is needed for the homepage featured section to render correctly with the new SCSS.
Acceptance: featured products render with correct visual hierarchy; no class conflicts.

### Assumptions (A)

**A1** — Next.js 14 will compile SCSS via the already-installed `sass` devDependency when `@import`/`@use` is used in `.scss` files imported into the component tree. No additional webpack config is needed.

**A2** — The SCSS file location is `apps/web/src/scss/` (matching the existing empty directory). The `@/scss/index.scss` path alias (`@/*` → `./src/*`) resolves correctly from layout.tsx.

**A3** — The Notion spec's `scss/` path references (e.g. `scss/layout/_topbar.scss`) are relative to the app's `src/` directory, i.e. the actual path is `apps/web/src/scss/layout/_topbar.scss`.

### Open Questions (Q)

**Q1 — ProductCard BEM status** — RESOLVED
`Owner: user` · `Blocking: no`
Resolution (2026-06-22): ProductCard still uses Tailwind. Rewrite it in this task (R8). Build order: remove Tailwind → write SCSS → implement BEM JSX.

**Q2 — Styles linking strategy** — RESOLVED
`Owner: user` · `Blocking: no`
Resolution (2026-06-22): Use Next.js native SCSS compilation. Import `@/scss/index.scss` in `apps/web/src/app/layout.tsx`. No manual compile step.

## Architecture Notes

- **role**: Lead Architect
- **decision**: Scope to Page 01 + its layout organisms (Topbar, BottomNav, Footer) only. Pages 02+ are independent tasks that will each add their page-specific SCSS partials to the barrel.
- **constraint**: `shared/components/UIPrimitives.tsx` exports `SharedBadge`, `SharedButton`, `SharedTableActionCell` — used by admin app, not by the homepage. Homepage uses local `Button`, `Input`, `ProductCard` atoms/molecules. Those local atoms are NOT rewritten in this task (they are covered by a separate component-library task).
- **constraint**: `globals.css` defines the CSS custom property tokens and must be preserved; we only ADD missing tokens, never remove existing ones.
- **tradeoff**: Rewriting Topbar/BottomNav/Footer as part of this task vs. deferring them. They are chosen for inclusion because they are rendered on every page via `layout.tsx` and their visual appearance directly impacts the homepage. Deferring would leave a Tailwind/BEM visual mismatch.
- **tradeoff**: Next.js native SCSS import vs. Notion's manual compile approach. Native import is cleaner for the dev workflow and avoids a manual build step. However it means the `css/` output directory the Notion spec describes will not exist — this affects the linking approach for Pages 02+. Resolution needed (Q2).
- **downstream**: The `_variables.scss` and `_mixins.scss` files written here are foundational — every subsequent page task will `@use` them. Any mixin signature changes in later tasks should not break existing partials; additive-only changes are safe.
- **downstream**: `layout.tsx` will gain one import line. No other layout changes are required for this task.

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs (Q1, Q2) appear in orchestration.blockers.
- [x] User approved or waiver recorded. (2026-06-22 — Q1 and Q2 resolved by user; brief approved to proceed to Plan)
