---
slug: page02-plp
version: 1
status: draft
created: 2026-06-22
---

# Think Brief — Page 02: Product Listing (`/products`)

## Summary

The PLP is split across two files: a server component `page.tsx` (data fetching, clean) and a 408-line client component `products-client.tsx` which drives all filtering, sorting, pagination, and the mobile drawer. It currently uses `products.module.css` (170 lines, 38 `@apply` directives) and 8 inline Tailwind strings for elements the module doesn't cover. There is no co-located SCSS file — all styling lives in the CSS module.

The task is: remove `products.module.css`, write `products-client.scss` co-located at `src/app/products/`, rewrite every `styles.*` and inline Tailwind class in `products-client.tsx` to BEM `ms-*` classes, and wire the `Select` atom to `ms-select` (it still uses its own Tailwind module).

---

## Requirements

### R1 — `plp.scss` co-located in `src/app/products/`
Write all BEM blocks needed for the page. Notion spec class names:

| BEM block | Role |
|-----------|------|
| `.ms-plp` | Page wrapper (min-height screen, surface-1 bg) |
| `.ms-plp__container` | Max-width container |
| `.ms-plp__header` | Title row (flex, space-between) |
| `.ms-plp__title` | Page h1 |
| `.ms-plp__subtitle` | Product count line |
| `.ms-plp-layout` | Flex row: sidebar + main column |
| `.ms-filter-sidebar` | Desktop only (hidden → md:block, sticky, width 14rem) |
| `.ms-filter-sidebar__section` | Each filter group |
| `.ms-filter-sidebar__heading` | `@include m.eyebrow` label |
| `.ms-filter-sidebar__radio-item` | Category link row (`--active` modifier) |
| `.ms-filter-drawer` | Mobile slide-up panel (fixed bottom, `transform: translateY(100%)` → `--open`) |
| `.ms-filter-drawer__handle` | Drag handle pill |
| `.ms-filter-drawer__footer` | Sticky CTA row inside drawer |
| `.ms-filter-trigger` | Mobile "Filters" pill button (shown above grid on mobile) |
| `.ms-sort-bar` | Count + sort select row, border-bottom |
| `.ms-sort-bar__count` | "X products" text |
| `.ms-chip` | Active filter chip (removable pill) |
| `.ms-chip__remove` | ✕ icon inside chip |
| `.ms-product-grid` | 2-col → 3-col (md) product grid; 4-col (xl, when no sidebar) |
| `.ms-pagination` | Prev / Next / indicator row |
| `.ms-empty-state` | Centered empty state |
| `.ms-empty-state__icon` | Large icon |
| `.ms-empty-state__title` | Heading |
| `.ms-empty-state__sub` | Body text |

Skeleton loading already handled by `.ms-pc--skeleton` (from `product-card.scss`).

### R2 — Migrate `products-client.tsx`
- Remove `import styles from './products.module.css'`
- Add `import './plp.scss'`
- Replace every `styles.*` reference with the corresponding `ms-*` BEM class
- Replace 8 remaining inline Tailwind strings (listed in Impacted Sections below)
- Preserve: all state logic, SWR fetching, filter chip generation, keyboard nav, pagination, mobile drawer open/close — zero behaviour changes

### R3 — Select atom → `ms-select`
`products-client.tsx` imports `<Select>` from the atoms library. `Select.tsx` still uses `Select.module.css` with `@apply`. Migrate `Select.tsx` + write `select.scss` co-located at `src/components/atoms/Select/`. This is in scope here because Select is prominently used for the sort dropdown on PLP and `input.scss` already has the `.ms-select` / `.ms-select-field` spec from Phase 3 of the homepage task — it just needs the atom wired up.

### R4 — Delete CSS artifacts
- `src/app/products/products.module.css` — delete
- `src/components/atoms/Select/Select.module.css` — delete

---

## Impacted Sections in `products-client.tsx`

**Inline Tailwind strings to replace:**

| Line | Current | BEM target |
|------|---------|-----------|
| 179 | `"md:hidden"` on Filter button wrapper | `ms-filter-trigger` |
| 181 | `className` on Filter icon (Lucide) | remove className; color via parent |
| 201 | `className` on X icon inside chip | remove; style via `.ms-chip__remove` |
| 288 | `"p-2 text-... hover:..."` on drawer close button | `ms-btn ms-btn--ghost ms-btn--icon ms-btn--sm` |
| 289 | `className` on X icon in drawer header | remove |
| 294 | `"space-y-1 mb-8"` div wrapper in drawer | `ms-filter-sidebar__section` |
| 314 | `"mt-8"` price range section wrapper | `ms-filter-sidebar__section` |
| 334 | `"mt-6"` stock toggle section wrapper | `ms-filter-sidebar__section` |

---

## Mapping: `styles.*` → `ms-*`

| CSS Module class | BEM class |
|-----------------|-----------|
| `styles.wrapper` | `ms-plp` |
| `styles.container` | `ms-plp__container` |
| `styles.header` | `ms-plp__header` |
| `styles.title` | `ms-plp__title` |
| `styles.subtitle` | `ms-plp__subtitle` |
| `styles.filterChips` | `ms-plp__chips` |
| `styles.filterChip` | `ms-chip` |
| `styles.filterChipLabel` | `ms-chip__label` |
| `styles.clearAllBtn` | `ms-btn ms-btn--ghost ms-btn--sm` (with `color: var(--error)` via `ms-btn--ghost-danger` modifier) |
| `styles.mainLayout` | `ms-plp-layout` |
| `styles.sidebar` | `ms-filter-sidebar` |
| `styles.filterCard` | `ms-card ms-card--padded` (reuse existing card atom once migrated, or inline `.ms-filter-sidebar__card`) |
| `styles.filterSectionTitle` | `ms-filter-sidebar__heading` |
| `styles.categoryList` | `ms-filter-sidebar__section` |
| `styles.categoryLink` | `ms-filter-sidebar__radio-item` |
| `styles.categoryLinkActive` | `ms-filter-sidebar__radio-item--active` |
| `styles.categoryLinkInactive` | *(base state, no modifier needed)* |
| `styles.divider` | `ms-filter-sidebar__divider` |
| `styles.priceRangeGroup` | `ms-filter-sidebar__price-row` |
| `styles.stockToggle` | `ms-filter-sidebar__stock-toggle` |
| `styles.stockCheckbox` | `ms-filter-sidebar__stock-checkbox` |
| `styles.stockLabel` | `ms-filter-sidebar__stock-label` |
| `styles.mobileFilterOverlay` | `ms-filter-drawer` |
| `styles.mobileFilterBackdrop` | `ms-filter-drawer__backdrop` |
| `styles.mobileFilterPanel` | `ms-filter-drawer__panel` |
| `styles.mobileFilterHeader` | `ms-filter-drawer__header` |
| `styles.mobileFilterTitle` | `ms-filter-drawer__title` |
| `styles.productsColumn` | `ms-plp__main` |
| `styles.layoutGrid` | `ms-product-grid` |
| `styles.skeletonCard/Image/Content/Line1/Line2` | `ms-pc ms-pc--skeleton` (already in `product-card.scss`) |
| `styles.emptyState` | `ms-empty-state` |
| `styles.emptyText` | `ms-empty-state__sub` |
| `styles.pagination` | `ms-pagination` |
| `styles.pageIndicator` | `ms-pagination__indicator` |

---

## Risks / Notes

- **Skeleton rendering**: Current skeletons render custom `styles.skeletonCard` divs, not `<ProductCard>`. Replace with `<ProductCard skeleton />` or keep the custom divs but give them `ms-pc ms-pc--skeleton` — the SCSS already handles the skeleton pulse. Preference: keep the current custom divs, just swap class names. No `skeleton` prop needed on ProductCard.
- **`ms-btn--ghost-danger`**: `clearAllBtn` is red ghost style. Add a `--ghost-danger` modifier to `button.scss` rather than using inline `style={{ color: 'var(--error)' }}`.
- **`Select` atom scope**: Only the sort `<Select>` on PLP uses it in this file. Migrating the atom in this task also fixes it for any future page that needs a select — low risk, high payoff.
- **Mobile drawer**: Current implementation uses a right-side slide panel (`w-80`, `right-0`, `top-0 bottom-0`). Notion spec calls for a bottom sheet (`translateY(100%)`). The brief captures both patterns — the plan phase will decide which to implement (recommend aligning to Notion spec's bottom sheet for mobile UX consistency).
