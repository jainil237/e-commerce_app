---
slug: page03-pdp
version: 1
status: draft
created: 2026-06-22
---

# Think Brief — Page 03: Product Detail (`/products/[slug]`)

## Summary

The PDP is architecturally split across three layers:

1. **`apps/web/src/app/products/[slug]/page.tsx`** — 159-line client component. Handles data fetching, cart/wishlist/share actions, and two inline states (loading skeleton, not-found). Uses `product.module.css` (2 classes, both `@apply`). Delegates all layout to `ProductDetailsPage`.

2. **`shared/pages/product/ProductDetailsPage.tsx`** — 171-line shared component, used by both web (customer) and admin. Contains all layout composition. Uses 32 inline Tailwind `className` strings directly in JSX.

3. **`shared/pages/product/components.tsx`** — 218-line file with 6 sub-components (`ProductBreadcrumbs`, `ProductGallery`, `ProductInfo`, `ProductPricing`, `ProductSpecifications`, `TrustBadges`). Uses 28 inline Tailwind `className` strings.

**Key constraint**: `shared/` is not a Next.js app — it has no SCSS pipeline of its own. It imports from neither `apps/web` nor `apps/admin`. The BEM SCSS must live in `apps/web/src/app/products/[slug]/pdp.scss` and be imported by the web `page.tsx`. The shared components receive their styling purely from the BEM class names they emit, which the web app's compiled SCSS targets.

**This means**: shared components must be rewritten to emit `ms-*` BEM class names instead of Tailwind strings. The SCSS that styles those classes compiles in the consuming app (web/admin). Admin will need its own SCSS for these classes when that page is tackled — but that's out of scope here.

---

## Requirements

### R1 — `pdp.scss` in `apps/web/src/app/products/[slug]/`
Write all BEM blocks per Notion spec. `@use` paths: `../../../../styles/mixins` and `../../../../styles/variables`.

BEM blocks needed:

| Block | Role |
|-------|------|
| `.ms-pdp` | Page wrapper (min-height screen, surface-1 bg) |
| `.ms-pdp__container` | Max-width container, padding |
| `.ms-pdp-layout` | CSS grid: 5/7 col on lg (gallery \| info) |
| `.ms-breadcrumb` | Flex scrollable breadcrumb nav |
| `.ms-breadcrumb__link` | Ancestor links |
| `.ms-breadcrumb__sep` | Chevron separator |
| `.ms-breadcrumb__current` | Current page segment |
| `.ms-gallery` | Gallery column wrapper |
| `.ms-gallery__main` | Main image: aspect-ratio 4/5, rounded-2xl, overflow hidden, hover zoom |
| `.ms-gallery__thumbs` | Thumbnail strip, overflow-x scroll, hide-scrollbar |
| `.ms-gallery__thumb` | 5rem × 5rem, border-2, opacity 0.6 |
| `.ms-gallery__thumb--active` | border brand-primary, opacity 1 |
| `.ms-pdp-info` | Info panel, sticky top 88px, flex-col gap |
| `.ms-pdp-info__cat` | Category eyebrow link |
| `.ms-pdp-info__name` | Product title, font-black |
| `.ms-pdp-info__stock` | Stock status row |
| `.ms-pdp-info__stock-dot` | Coloured circle |
| `.ms-pdp-info__stock-dot--in` / `--out` | success / error color |
| `.ms-pdp-info__stock-text` | Stock label |
| `.ms-pdp-info__stock-text--in` / `--out` | |
| `.ms-pdp-info__price-row` | Price + MRP baseline row |
| `.ms-pdp-info__price` | Selling price, font-black, tabular-nums |
| `.ms-pdp-info__mrp` | Struck-through MRP |
| `.ms-pdp-info__tax` | "Incl. all taxes" note |
| `.ms-pdp-info__savings` | Savings breakdown card (surface-0, rounded-2xl) |
| `.ms-pdp-info__savings-row` | Each line: label + value |
| `.ms-pdp-info__section` | Description section (border-bottom) |
| `.ms-pdp-info__section-title` | Section h3 |
| `.ms-pdp-info__description` | Body text |
| `.ms-pdp-info__qty-row` | Quantity label + control row |
| `.ms-pdp-info__qty-ctrl` | +/− stepper (surface-2 bg, border, rounded-xl) |
| `.ms-pdp-info__qty-btn` | Stepper button |
| `.ms-pdp-info__qty-value` | Quantity number span |
| `.ms-pdp-info__actions` | Add to Cart + Wishlist + Share row |
| `.ms-trust-row` | 3-col trust grid (border-top + bottom) |
| `.ms-trust-row__item` | Each trust cell |
| `.ms-trust-row__icon` | Icon circle (surface-2 bg, brand-primary color) |
| `.ms-trust-row__label` | Trust label text |
| `.ms-spec-card` | Specifications card (surface-0, rounded-2xl, border) |
| `.ms-spec-card__grid` | 2-col spec grid |
| `.ms-spec-card__item` | Each spec row (border-bottom) |
| `.ms-spec-card__key` | `@include m.eyebrow` |
| `.ms-spec-card__val` | Value, font-bold; SKU uses `font-family: var(--font-mono)` |
| `.ms-spec-card__tags` | Tag chips row |
| `.ms-pdp-skeleton` | Loading skeleton layout |
| `.ms-pdp-not-found` | Not-found state (centered, icon + text) |

### R2 — Rewrite `shared/pages/product/ProductDetailsPage.tsx`
Replace all 32 inline Tailwind `className` strings with `ms-*` BEM class names. Preserve `viewer` prop logic (`isCustomer` / `isAdmin` conditionals).

### R3 — Rewrite `shared/pages/product/components.tsx`
Replace all 28 inline Tailwind `className` strings in the 6 sub-components with `ms-*` BEM class names. No logic changes.

### R4 — Rewrite `apps/web/src/app/products/[slug]/page.tsx`
- Replace `import styles from './product.module.css'` → `import './pdp.scss'`
- Replace `styles.wrapper` → `"ms-pdp"`
- Replace loading skeleton's inline Tailwind grid/skeleton classes → `ms-pdp-skeleton` BEM
- Replace not-found state's inline Tailwind → `ms-pdp-not-found` BEM

### R5 — Delete `product.module.css`

---

## Impacted Files

| File | Change |
|------|--------|
| `apps/web/src/app/products/[slug]/pdp.scss` | Create |
| `apps/web/src/app/products/[slug]/page.tsx` | Replace module import + skeleton/not-found classes |
| `apps/web/src/app/products/[slug]/product.module.css` | Delete |
| `shared/pages/product/ProductDetailsPage.tsx` | Rewrite 32 className strings → ms-* |
| `shared/pages/product/components.tsx` | Rewrite 28 className strings → ms-* |

---

## Risks / Notes

- **Shared component impact**: `ProductDetailsPage` and `components.tsx` are imported by both `apps/web` and `apps/admin`. The admin app currently relies on these same Tailwind classes for its PDP view. After migration, admin PDP will render unstyled until admin gets its own SCSS import for these `ms-*` classes — this is acceptable and expected; the admin PDP brief will address it.
- **`SharedBadge` in `components.tsx`**: The discount badge uses `<SharedBadge>` from `shared/components/UIPrimitives.tsx`, which emits a `badge` utility class, not `ms-badge`. Leave this as-is for now — `UIPrimitives` is a shared primitive used by both apps and is out of scope for this task. It renders correctly with its own styles.
- **`product.module.css` scope**: Only 2 classes (`wrapper`, `container` — actually `breadcrumbNav` etc.) but `container` is never used — `ProductDetailsPage` handles its own container. Only `.wrapper` (`min-h-screen bg-surface-1 pb-20`) is actively used in `page.tsx`.
- **Skeleton loading**: The current skeleton in `page.tsx` uses raw Tailwind `grid`/`skeleton` classes. The `skeleton` utility may come from a global CSS rule in `globals.css` — check before removing.
- **`@shared/*` alias**: `shared/` components import from `../../types` and `../../components/UIPrimitives` via relative paths, not tsconfig aliases. Keep relative paths intact.
