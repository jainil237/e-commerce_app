---
slug: homepage-redesign
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-22
updated: 2026-06-22
manifest_ids: [R1, R2, R3, R4, R5, R6, R7, R8, RI1, RI2, RI3, RI4, RI5, A1, A2, A3]
upstream:
  brief: .workflow/artifacts/briefs/homepage-redesign-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Homepage Redesign (Page 01) — Plan

## Summary

6 sequential build phases that convert the homepage and its layout organisms from Tailwind/CSS-Modules to a BEM SCSS design system (`ms-*` classes). Each phase follows the user-mandated order: **remove Tailwind → write SCSS → implement BEM JSX**. Phases are ordered so each depends only on what came before: Foundation first, then layout organisms, then the homepage page itself, then ProductCard (used by the homepage), then BottomNav and Footer.

Branch: `feat/homepage-redesign` (off `ai-changes`).

## Inputs

- Approved brief: `.workflow/artifacts/briefs/homepage-redesign-v1.md`
- Notion source: https://app.notion.com/p/3863d3f7968b80e5a7f0e351fc4e2433 — Page 01 and SCSS Architecture sections
- Current branch: `ai-changes`
- SCSS dirs exist and are empty: `apps/web/src/scss/{components,layout,pages}/`
- `sass` already installed as devDependency in `apps/web`

## Requirement Coverage

| Manifest ID | Covered by phases | Notes |
|---|---|---|
| R1 | Phase 1 | `_variables.scss`, `_mixins.scss`, `index.scss` |
| R2 | Phase 1 | Missing tokens added to `globals.css` |
| R3 | Phases 2–6 | Each phase writes the relevant partial |
| R4 | Phase 3 | `page.tsx` rewrite |
| R5 | Phase 2 | `Topbar.tsx` rewrite |
| R6 | Phase 5 | `BottomNav.tsx` rewrite |
| R7 | Phase 6 | `footer.tsx` rewrite |
| R8 | Phase 4 | `ProductCard.tsx` + `_product-card.scss` |
| RI1 | Phase 1 | SCSS import wired in `layout.tsx` |
| RI2 | Phases 2–6 | No inline styles; enforced per-phase |
| RI3 | Phase 1 | `m.motion` mixin wraps all transitions |
| RI4 | Phase 1 | Dark overrides for new tokens in `globals.css` |
| RI5 | Phase 4 | ProductCard BEM alignment with homepage featured section |
| A1 | Phase 1 | Verified: Next.js 14 + sass devDep handles SCSS natively |
| A2 | Phase 1 | Verified: `src/scss/` dir exists; `@/scss/index.scss` resolves |
| A3 | All phases | SCSS paths are relative to `apps/web/src/` |

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `apps/web/src/app/globals.css` | Modify — add tokens | R2, RI4 | Append `--shadow-*`, `--container-max`, `--font-sans`, `--font-mono`, `--radius-full`, `--ring-brand`, `--blur-glass` to `:root` and `.dark` |
| `apps/web/src/app/layout.tsx` | Modify — add 1 import, remove Tailwind body classes | RI1 | Add `import '@/scss/index.scss'`; replace body Tailwind classes with BEM equivalent or plain CSS via SCSS |
| `apps/web/src/scss/_variables.scss` | Create | R1 | Compile-time vars: breakpoints, z-index, transitions |
| `apps/web/src/scss/_mixins.scss` | Create | R1, RI3 | `glass`, `hide-scrollbar`, `motion`, `eyebrow`, `card-surface`, `price-text`, `md`/`lg` breakpoint mixins |
| `apps/web/src/scss/index.scss` | Create | R1, RI1 | `@use` barrel importing all partials |
| `apps/web/src/scss/layout/_topbar.scss` | Create | R3, R5 | `.ms-topbar`, `.ms-search-dropdown` |
| `apps/web/src/scss/layout/_promo-banner.scss` | Create | R3, R4 | `.ms-promo-banner` |
| `apps/web/src/scss/layout/_bottom-nav.scss` | Create | R3, R6 | `.ms-bottom-nav` |
| `apps/web/src/scss/layout/_footer.scss` | Create | R3, R7 | `.ms-footer` |
| `apps/web/src/scss/pages/_home.scss` | Create | R3, R4 | `.ms-hero`, `.ms-section`, `.ms-section-header`, `.ms-category-grid`, `.ms-category-card`, `.ms-trust-grid`, `.ms-trust-tile` |
| `apps/web/src/scss/components/_product-card.scss` | Create | R8, RI5 | `.ms-pc` and all sub-elements |
| `apps/web/src/app/page.tsx` | Rewrite | R4 | Remove Tailwind; use `ms-*` BEM class names |
| `apps/web/src/components/organisms/Topbar/Topbar.tsx` | Rewrite | R5 | Remove Tailwind; use `ms-topbar` BEM |
| `apps/web/src/components/organisms/BottomNav/BottomNav.tsx` | Rewrite | R6 | Remove Tailwind; use `ms-bottom-nav` BEM |
| `apps/web/src/components/layout/footer.tsx` | Rewrite | R7 | Remove Tailwind; use `ms-footer` BEM |
| `apps/web/src/components/molecules/ProductCard/ProductCard.tsx` | Rewrite | R8 | Remove Tailwind + CSS module; use `ms-pc` BEM |
| `apps/web/src/components/molecules/ProductCard/ProductCard.module.css` | Delete | R8 | Module replaced by `_product-card.scss` |

**Protected paths not touched:** `server/prisma/schema.prisma`, `shared/types/`, `server/src/routes/webhook.routes.ts`.

## Source-of-Truth Strategy

Source: Notion page (read-only, already read).
Update policy per `source-of-truth.yaml`: `update: false`. No write-back required.
Status: `not required`.

## Approach

Each phase follows the user-mandated build order:
1. **Strip** — remove all Tailwind utility classes and/or CSS module imports from the target file(s).
2. **Write SCSS** — create the BEM SCSS partial with all rules needed to style the stripped file.
3. **Apply BEM** — rewrite the JSX/TSX to use `ms-*` class names; preserve all logic, hooks, and event handlers exactly.

SCSS uses `@use 'sass:math'` for math where needed; all token values reference CSS custom properties (`var(--token)`), never hardcoded hex. The `m.motion` mixin (`@media (prefers-reduced-motion: no-preference)`) gates all `animation:` and `transition:` declarations.

## Phases

### Phase 1 — SCSS Foundation

**Manifest IDs:** R1, R2, RI1, RI3, RI4

**Touches:**
- `apps/web/src/app/globals.css` (modify)
- `apps/web/src/app/layout.tsx` (modify)
- `apps/web/src/scss/_variables.scss` (create)
- `apps/web/src/scss/_mixins.scss` (create)
- `apps/web/src/scss/index.scss` (create)

**Work:**
1. Append missing tokens to `globals.css` `:root` and `.dark`: `--shadow-sm/md/lg/xl/2xl`, `--container-max: 80rem`, `--font-sans`, `--font-mono`, `--radius-full: 9999px`, `--ring-brand`, `--blur-glass: blur(12px)`.
2. Write `_variables.scss`: compile-time SCSS vars for breakpoints (`$bp-md: 768px`, `$bp-lg: 1024px`), z-index scale, transition durations.
3. Write `_mixins.scss`: `glass` (backdrop-blur + surface-glass bg + border-subtle), `hide-scrollbar`, `motion` (prefers-reduced-motion guard), `eyebrow` (uppercase tracking label), `card-surface($radius)`, `price-text` (tabular-nums), `md` / `lg` breakpoint wrappers.
4. Write `index.scss`: `@use` imports for all partials (layout + components + pages). Initially forwards only the partials that exist.
5. In `layout.tsx`: add `import '@/scss/index.scss'` before globals.css import; remove Tailwind classes from `<body>` (body styling moves to `_variables.scss` base block or stays via globals.css body rule).

**Exit gate:** `npm run dev --workspace=apps/web` starts without SCSS compile errors; homepage renders with existing visual (no regression yet since no component SCSS exists — components fall back to whatever class names produce no style, which is expected at this stage).

---

### Phase 2 — Topbar SCSS + Rewrite

**Manifest IDs:** R3 (topbar partial), R5, RI2, RI3

**Touches:**
- `apps/web/src/scss/layout/_topbar.scss` (create)
- `apps/web/src/components/organisms/Topbar/Topbar.tsx` (rewrite)

**Work:**
1. Write `scss/layout/_topbar.scss` with all `.ms-topbar` BEM rules exactly per Notion spec: `__inner`, `__wordmark`, `__search`, `__actions`, `__cart-badge`, `__category-rail`, `__chip`, `__mobile-menu`, `__mobile-link`; `.ms-search-dropdown`, `__item`, `__footer`. All `transition:` inside `@include m.motion`.
2. Strip all Tailwind classes from `Topbar.tsx`.
3. Rewrite `Topbar.tsx` JSX with `ms-topbar` BEM class names. Preserve: sticky + z-40, search with product suggestion dropdown, cart badge count from `useCart`, mobile hamburger state, category chip rail from API, dark mode toggle via `useTheme`.

**Exit gate:** Topbar renders on homepage with sticky glass header, visible wordmark, cart icon + badge, and category rail. Mobile hamburger opens slide-down menu. No Tailwind classes in `Topbar.tsx`. No inline styles. `npm run lint` passes on the file.

---

### Phase 3 — Homepage page.tsx + Home SCSS

**Manifest IDs:** R3 (promo-banner + home partials), R4, RI2, RI3

**Touches:**
- `apps/web/src/scss/layout/_promo-banner.scss` (create)
- `apps/web/src/scss/pages/_home.scss` (create)
- `apps/web/src/app/page.tsx` (rewrite)

**Work:**
1. Write `scss/layout/_promo-banner.scss`: `.ms-promo-banner`, `__text` per Notion spec.
2. Write `scss/pages/_home.scss`: `.ms-hero` + `__inner/__title/__sub`, `.ms-section` + `--surface-0/1` modifier, `.ms-section-header` + `__title/__link`, `.ms-category-grid`, `.ms-category-card` + `__image/__fallback/__overlay/__label/__count`, `.ms-trust-grid`, `.ms-trust-tile` + `__icon/__title/__sub`. All transitions inside `@include m.motion`.
3. Strip all Tailwind from `page.tsx`.
4. Rewrite `page.tsx` with `ms-*` class names. Layout order: `.ms-promo-banner` → `.ms-hero` → `.ms-section.ms-section--surface-0` (categories) → `.ms-section.ms-section--surface-1` (featured) → `.ms-section.ms-section--surface-0` (trust) → footer/bottom-nav handled by layout.tsx. Preserve server-component data fetching (revalidate: 60). Section header pattern per Notion: `ms-section-header__title` + `ms-section-header__link`. Trust badges use Lucide icons (Truck, ShieldCheck, RotateCcw, FileText) replacing emoji.

**Exit gate:** Homepage renders all 5 content sections (promo, hero, categories, featured, trust) with BEM class names. No Tailwind in `page.tsx`. Trust badges show Lucide icons. `npm run lint` passes.

---

### Phase 4 — ProductCard SCSS + Rewrite

**Manifest IDs:** R8, RI2, RI5

**Touches:**
- `apps/web/src/scss/components/_product-card.scss` (create)
- `apps/web/src/components/molecules/ProductCard/ProductCard.tsx` (rewrite)
- `apps/web/src/components/molecules/ProductCard/ProductCard.module.css` (delete)

**Work:**
1. Write `scss/components/_product-card.scss` with the full `.ms-pc` BEM spec per Notion: `__image`, `__badges`, `__wish`, `__wish--active`, `__body`, `__cat`, `__name`, `__price-row`, `__price`, `__mrp`, `__foot`; `.ms-pc--skeleton` pulse animation gated in `@include m.motion`. Hover lift and image zoom also in motion block.
2. Strip all Tailwind classes and `ProductCard.module.css` import from `ProductCard.tsx`.
3. Rewrite `ProductCard.tsx` JSX to use `ms-pc` BEM class names. Preserve all logic: `useCart`, `useWishlist`, `useToast`, `useAuth`, truncation `ResizeObserver`, discount calc, `FallbackImage`, wishlist toggle behavior, cart add. The tooltip for truncated titles maps to `ms-pc__tooltip`.
4. Delete `ProductCard.module.css`.

**Exit gate:** Featured products on homepage render with `.ms-pc` BEM structure. Wishlist heart toggles correctly. Discount badge appears when `discount > 0`. "Add to Cart" button functions. `ProductCard.module.css` no longer exists. No Tailwind in `ProductCard.tsx`. `npm run lint` passes.

---

### Phase 5 — BottomNav SCSS + Rewrite

**Manifest IDs:** R3 (bottom-nav partial), R6, RI2, RI3

**Touches:**
- `apps/web/src/scss/layout/_bottom-nav.scss` (create)
- `apps/web/src/components/organisms/BottomNav/BottomNav.tsx` (rewrite)

**Work:**
1. Write `scss/layout/_bottom-nav.scss`: `.ms-bottom-nav`, `__item`, `__item--active` (with `::before` indicator bar), `__icon`, `__label`, `__badge`. Hidden on `md+`. Glass background via `@include m.glass`. All transitions in `@include m.motion`. `padding-bottom: env(safe-area-inset-bottom)`.
2. Strip Tailwind from `BottomNav.tsx`.
3. Rewrite `BottomNav.tsx` with `ms-bottom-nav` BEM. Preserve: pathname-based active detection, cart badge from `useCart`, 4 nav tabs (Home, Browse, Cart, Profile).

**Exit gate:** Bottom nav visible on mobile, hidden on desktop. Active tab shows brand-colored indicator bar. Cart badge shows when items > 0. No Tailwind in `BottomNav.tsx`. `npm run lint` passes.

---

### Phase 6 — Footer SCSS + Rewrite

**Manifest IDs:** R3 (footer partial), R7, RI2, RI3

**Touches:**
- `apps/web/src/scss/layout/_footer.scss` (create)
- `apps/web/src/components/layout/footer.tsx` (rewrite)

**Work:**
1. Write `scss/layout/_footer.scss`: `.ms-footer`, `__grid`, `__heading`, `__link`, `__trust-row`, `__copy`. Background `#18181B` (intentional dark, not a token surface per Notion spec). `display: none` at mobile, `display: block` at `md+`.
2. Strip Tailwind from `footer.tsx`.
3. Rewrite `footer.tsx` with `ms-footer` BEM. Preserve: 4-column grid, `useStoreConfig` for store name and contact, policy links (About, Shipping, Returns, Privacy, Terms), trust row, copyright.

**Exit gate:** Footer hidden on mobile, renders 4-column dark grid on desktop. `useStoreConfig` data populates store name. No Tailwind in `footer.tsx`. `npm run lint` passes.

---

## Dependency Order

```
Phase 1 (Foundation)
  └── Phase 2 (Topbar) — needs m.glass, m.motion, m.hide-scrollbar mixins
        └── Phase 3 (Homepage) — needs promo + home partials, topbar already styled
              └── Phase 4 (ProductCard) — homepage phase 3 uses ProductCard in featured section
                    └── Phase 5 (BottomNav) — independent from ProductCard but after homepage works
                          └── Phase 6 (Footer) — last layout piece; independent of BottomNav
```

Phases 5 and 6 are independent of each other and of Phase 4; they are ordered last to minimize risk of visible regressions before the core homepage (phases 1–4) is verified working.

## Branch Strategy

- Base branch: `ai-changes` (current working branch)
- Feature branch: `feat/homepage-redesign` (create from `ai-changes` before Phase 1 begins)
- Commit per phase (or per file within a phase): `feat(web): <phase description>`
- Do not commit to `main` or `ai-changes` directly. PR targets `ai-changes`.
- Dirty state recorded at build start: `apps/web/src/app/globals.css` has recent modifications (theme tokens already updated per system reminder). Preserve and build on top of.

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|
| SCSS mixin referenced before definition (barrel ordering) | Medium | Build error | Define `_variables.scss` and `_mixins.scss` before any partial `@use`s them; barrel `index.scss` uses explicit file order | Build | R1, RI1 |
| CSS custom property missing — token used in SCSS but not defined in globals.css | Medium | Silent visual bug (renders as undefined/transparent) | Audit all `var(--token)` refs in Notion spec against globals.css additions in Phase 1 before moving to Phase 2 | Build Phase 1 | R2, RI4 |
| ProductCard.module.css deletion breaks other pages | Low | 404 on styles | Verify no other file imports `ProductCard.module.css` before deletion | Build Phase 4 | R8 |
| Topbar search dropdown z-index conflicts with new SCSS stacking context | Low | Dropdown hidden behind other elements | `_variables.scss` defines explicit z-index scale; topbar z-40, dropdown z-50, modal z-60 | Build Phase 2 | R5 |
| `prefers-reduced-motion` mixin wrapping breaks expected transition behavior in tests | Low | Functional regression | Manual QA on two browsers (reduced motion off = transitions work; on = instant state changes) | Review | RI3 |
| Inter font already loaded via Next.js `next/font` — SCSS `--font-sans` var may conflict | Low | Font fallback | `--font-sans` maps to the Inter CSS variable already set on `<html>` by layout.tsx; document in Phase 1 | Build Phase 1 | R1 |

## Verification Plan

| Manifest ID | Evidence | Owner phase | Notes |
|---|---|---|---|
| R1 | `npm run dev` compiles SCSS without error; mixins resolve | Phase 1 | Manual check: no compile errors in terminal |
| R2 | All `var(--shadow-*)` etc. resolve to non-empty values in browser DevTools | Phase 1 | DevTools computed styles check |
| R3 | Each partial exists at expected path; `@use` in index resolves | Per phase | File existence + compile check |
| R4 | Homepage renders 5 sections; zero Tailwind classes in `page.tsx` | Phase 3 | `grep -n "className=" apps/web/src/app/page.tsx` shows only `ms-*` |
| R5 | Topbar renders sticky; search dropdown opens; cart badge shows count | Phase 2 | Manual QA on desktop + mobile viewport |
| R6 | BottomNav visible on mobile (< 768px); hidden on desktop; active tab indicator | Phase 5 | Manual QA: resize browser |
| R7 | Footer renders 4-column grid on desktop; hidden on mobile | Phase 6 | Manual QA: resize browser |
| R8 | ProductCard.module.css absent; `ms-pc` class on card root; wishlist and cart work | Phase 4 | `ls ProductCard.module.css` returns not found; manual cart/wishlist test |
| RI1 | SCSS styles apply on all app routes without per-page import | Phase 1 | Navigate to `/products` — styles should cascade from layout import |
| RI2 | Zero `style={{ ... }}` in touched files | All phases | `grep -n "style={{" <file>` returns empty |
| RI3 | `@include m.motion` wraps all animation/transition rules in SCSS | All phases | Code review of SCSS files |
| RI4 | `.dark` toggle on `<html>` flips all homepage colors | Phase 1 (tokens) + Phase 3 (visual check) | Manual: toggle `.dark` class in DevTools |
| RI5 | Featured products section renders with correct `.ms-pc` hierarchy | Phase 4 | Manual: homepage featured section visual check |

## Architecture Notes

- **role**: Principal Engineer
- **decision**: Import SCSS via `import '@/scss/index.scss'` in `layout.tsx` (Next.js native sass). No compile step, no `css/` output directory. This deviates from the Notion "compile SCSS" instructions but is equivalent in output and simpler for the dev workflow. Future pages just add their partials to `index.scss`.
- **decision**: `_variables.scss` defines SCSS compile-time vars (breakpoints as `$bp-md`). CSS runtime tokens (`--shadow-sm`, etc.) stay in `globals.css`. SCSS files reference runtime tokens via `var(--token)` — they do NOT use SCSS vars for colors/radii/shadows.
- **constraint**: `shared/components/UIPrimitives.tsx` and admin-side atoms are out of scope. Local web atoms (`Button`, `Input`, `Badge`) are not rewritten in this task — they retain their current Tailwind/module classes. The homepage uses them in limited contexts (CTA button in hero, Add-to-Cart in ProductCard); their styling will show as-is.
- **constraint**: `apps/web/src/app/globals.css` retains Tailwind base imports (`@tailwind base/components/utilities`). The spec says Tailwind may remain in globals.css as a shim. Tailwind is only removed from component/page JSX files.
- **tradeoff**: Rewriting `Topbar.tsx` (370 lines, complex) early (Phase 2) before the homepage page itself (Phase 3) ensures the topbar looks correct before the hero section is seen, and reduces visual jarring during incremental development.
- **tradeoff**: Deleting `ProductCard.module.css` cleanly severs the CSS module dependency. Alternative (keep module, add BEM via module) was rejected per Notion spec ("no inline styles or utility classes in component files") — CSS modules are a separate styling layer that conflicts with the pure-BEM approach.
- **downstream**: All Pages 02+ will `@use 'variables' as v` and `@use 'mixins' as m` from the barrel; the mixin API established in Phase 1 must not change signatures without updating all callers.

## Open Questions

None. All questions resolved in brief.

## Exit Gate

- [x] Every active R and RI mapped to a phase.
- [x] Every phase has a binary exit gate.
- [x] Verification plan covers every R and RI.
- [x] User approved or waiver recorded. (plan written for user review — approval needed before Build starts)
