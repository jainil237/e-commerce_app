---
slug: page06-wishlist
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, RI1, RI2, RI3]
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User invoked 'start with page 06' — pattern established by page01–05; brief-review checkpoint waived."
---

# Think Brief — Page 06: Wishlist (`/wishlist`)

## Summary

The Wishlist page is a single client component: `apps/web/src/app/wishlist/page.tsx` (233 lines). It renders four states: loading spinner, a login-gate card (unauthenticated), an empty-wishlist card, and a responsive product grid (1 → 2 → 3 → 4 columns). Unlike pages 01–05, there is **no CSS module to delete** — all styling is currently expressed as inline Tailwind utility strings and CSS custom property references directly in JSX. No co-located `.scss` file exists yet.

The page has no sub-components. Cart integration (`addItem`), wishlist mutation (`removeFromWishlist`), and SWR-style refetch are pure state/effect — they are not touched by this migration.

---

## Requirements

### R1 — Write `apps/web/src/app/wishlist/wishlist.scss`

Co-located SCSS file. `@use '../../styles/mixins' as m` and `@use '../../styles/variables' as v`. All inline Tailwind utility strings → BEM `ms-wishlist` namespace. ~45 BEM tokens total.

**Acceptance criteria:** File compiles without error; all visual output is pixel-equivalent to the current Tailwind output; all transitions and animations use `@include m.motion`; no `@apply` or Tailwind utilities present.

### R2 — Rewrite `apps/web/src/app/wishlist/page.tsx`

Add `import './wishlist.scss'` (no old import to remove — this page never had a CSS module). Replace every inline Tailwind utility string with the corresponding BEM class string. Two utility strings are allowed to remain as image-intrinsic or atomic-component-controlled (see RI3).

**Acceptance criteria:** Zero remaining inline Tailwind utility strings on elements that have a BEM counterpart; page renders identically across all four states and all breakpoints.

---

## Implicit Requirements

### RI1 — `@include m.motion` for all transitions and animations

Every `transition-*` and `animation` declaration must be wrapped in `@include m.motion`. This includes the card hover lift (`hover:shadow-xl hover:-translate-y-1`), image scale (`group-hover:scale-105`), and name colour shift (`group-hover:text-[var(--brand-primary)]`). Consistent with page01–05.

### RI2 — No `dark:` Tailwind prefixes

The two Heart icon instances in empty/gate states currently carry `text-gray-300 dark:text-gray-600`. These are replaced with `color: var(--text-tertiary)` in SCSS, which already switches in dark mode via CSS custom properties. The out-of-stock overlay badge (`bg-white/90 text-gray-900`) is placed on a dark scrim — use `background: rgba(255,255,255,0.9); color: #111` which is theme-invariant by context.

### RI3 — Image-intrinsic and atom-controlled classes stay

`FallbackImage className="object-cover"` is image-intrinsic and stays (matches PDP/cart/checkout precedent). The `Button` atom's `className="flex-1"` structural override and icon-button `className="..."` passes are atom-controlled and stay on the component, not absorbed into SCSS.

---

## Architecture Notes

- **Role:** Architect
- **Scope:** Style-only migration. No logic, no state, no API contract is touched.
- **Namespace:** `ms-wishlist` (storefront prefix, matches page01–05 `ms-*` convention).
- **No CSS module deletion:** Unlike previous pages, there is no `*.module.css` file. Only an import add + JSX rewrite.
- **Four render states and their BEM blocks:**
  1. **Loading** — `.ms-wishlist__spinner-wrap` (centered full-page)
  2. **Gate (unauthenticated)** — `.ms-wishlist-gate` card (`max-w-md` centred, `border-[var(--border-subtle)]`, `rounded-3xl`)
  3. **Empty** — `.ms-wishlist-empty` card (`border-dashed`, `rounded-3xl`)
  4. **Grid** — `.ms-wishlist-grid` responsive 1→2→3→4 column layout using CSS Grid + breakpoint mixins
- **Card lift effect:** The product card uses `hover:shadow-xl hover:-translate-y-1 group` — absorbed into `.ms-wishlist-card` with `@include m.motion { transition: box-shadow v.$duration-base ease, transform v.$duration-base ease; } &:hover { box-shadow: var(--shadow-xl); transform: translateY(-4px); }`.
- **Image scale on group hover:** `group-hover:scale-105` on `FallbackImage` is driven by a CSS sibling/group rule — handled in SCSS as `.ms-wishlist-card:hover .ms-wishlist-card__image img { transform: scale(1.05); }`.
- **Name colour on group hover:** `group-hover:text-[var(--brand-primary)]` — handled as `.ms-wishlist-card:hover .ms-wishlist-card__name { color: var(--brand-primary); }`.
- **Responsive grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6` → CSS Grid with `@include m.sm`, `m.lg`, `m.xl` breakpoints. Note: `xl` breakpoint for 4 cols — confirm `$bp-xl` covers `1280px+` in `_variables.scss`.
- **Downstream impact:** Plan owns the full BEM spec and mapping table. Build owns the file writes.
