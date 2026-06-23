---
slug: page03-pdp
version: 1
status: ready-for-next-phase
created: 2026-06-22
brief: .workflow/artifacts/briefs/page03-pdp-v1.md
branch: feat/homepage-redesign
---

# Plan — Page 03: Product Detail (`/products/[slug]`)

## Objective

Migrate the PDP from Tailwind inline classes across 3 files to `ms-*` BEM SCSS. All layout and component classes live in `pdp.scss`, co-located in `apps/web/src/app/products/[slug]/`. The two shared files (`ProductDetailsPage.tsx`, `components.tsx`) are updated to emit `ms-*` class names — they carry no SCSS of their own; the web app's compiled `pdp.scss` provides the styles.

---

## Phase 1 — Write `pdp.scss`

Location: `apps/web/src/app/products/[slug]/pdp.scss`
`@use` paths: `../../../../styles/mixins` and `../../../../styles/variables`

### Full BEM spec:

**Page scaffold**
```
.ms-pdp
  min-height: 100vh
  background: var(--surface-1)
  padding-bottom: 5rem   ← space for BottomNav on mobile

  &__container
    max-width: var(--container-max)
    margin: 0 auto
    padding: 2rem 1rem
    @include m.md → 2rem 1.5rem
    @include m.lg → 2rem 2rem
```

**Layout grid**
```
.ms-pdp-layout
  display: grid
  grid-template-columns: 1fr
  gap: 2rem
  align-items: start
  margin-top: 1rem

  @include m.lg
    grid-template-columns: 5fr 7fr
    gap: 3rem
```

**Breadcrumb**
```
.ms-breadcrumb
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 0.25rem
  font-size: 0.875rem
  color: var(--text-tertiary)
  overflow-x: auto
  @include m.hide-scrollbar
  margin-bottom: 1.5rem

  &__link
    color: inherit
    text-decoration: none
    @include m.motion { transition: color v.$duration-fast ease }
    &:hover { color: var(--text-primary) }

  &__sep
    color: var(--text-tertiary)
    display: flex
    align-items: center

  &__current
    color: var(--text-primary)
    font-weight: 500
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
    max-width: 12.5rem
```

**Gallery**
```
.ms-gallery
  display: flex
  flex-direction: column
  gap: 1rem

  @include m.lg
    position: sticky
    top: 5.5rem
    align-self: flex-start

  &__main
    position: relative
    aspect-ratio: 4 / 5
    background: var(--surface-2)
    border-radius: var(--radius-2xl)
    overflow: hidden
    border: 1px solid var(--border-subtle)
    box-shadow: var(--shadow-sm)

    img
      width: 100%; height: 100%
      object-fit: cover
      @include m.motion { transition: transform v.$duration-slower ease }

    &:hover img
      @include m.motion { transform: scale(1.05) }

  &__badge
    position: absolute
    top: 1rem; left: 1rem
    z-index: 1

  &__thumbs
    display: flex
    gap: 0.75rem
    overflow-x: auto
    padding-bottom: 0.5rem
    @include m.hide-scrollbar

  &__thumb
    position: relative
    width: 5rem; height: 5rem
    border-radius: var(--radius-xl)
    overflow: hidden
    flex-shrink: 0
    border: 2px solid transparent
    opacity: 0.6
    cursor: pointer
    background: var(--surface-0)
    @include m.motion { transition: all v.$duration-fast ease }
    &:hover { opacity: 1 }

    img { width: 100%; height: 100%; object-fit: cover }

    &--active
      border-color: var(--brand-primary)
      opacity: 1
      box-shadow: var(--shadow-md)
```

**Info panel**
```
.ms-pdp-info
  display: flex
  flex-direction: column
  gap: 1.5rem

  &__cat
    font-size: 0.75rem
    font-weight: 700
    color: var(--brand-primary)
    text-transform: uppercase
    letter-spacing: 0.08em
    text-decoration: none

  &__name
    font-size: 1.875rem
    font-weight: 900
    color: var(--text-primary)
    line-height: 1.2
    letter-spacing: -0.01em

    @include m.md { font-size: 2.25rem }

  &__stock
    display: flex
    align-items: center
    gap: 1rem
    margin-top: 0.25rem

  &__stock-indicator
    display: flex; align-items: center; gap: 0.375rem

  &__stock-dot
    width: 0.5rem; height: 0.5rem
    border-radius: var(--radius-full)
    &--in  { background: var(--success) }
    &--out { background: var(--error) }

  &__stock-text
    font-size: 0.875rem; font-weight: 700
    &--in  { color: var(--success) }
    &--out { color: var(--error) }

  &__stock-qty
    font-size: 0.875rem
    color: var(--text-secondary)
    border-left: 1px solid var(--border-subtle)
    padding-left: 1rem

  &__price-row
    display: flex
    align-items: baseline
    gap: 0.75rem
    flex-wrap: wrap

  &__price
    font-size: 2.25rem
    font-weight: 900
    color: var(--text-primary)
    @include m.price-text

  &__mrp
    font-size: 1.25rem
    font-weight: 500
    color: var(--text-tertiary)
    text-decoration: line-through
    @include m.price-text

  &__tax
    font-size: 0.75rem
    color: var(--text-tertiary)
    margin-top: 0.25rem

  &__savings
    margin-top: 1rem
    padding: 1rem
    background: var(--surface-0)
    border-radius: var(--radius-xl)
    border: 1px solid var(--border-subtle)
    box-shadow: var(--shadow-sm)

  &__savings-row
    display: flex
    justify-content: space-between
    font-size: 0.875rem
    padding: 0.25rem 0

    &:last-child
      border-top: 1px solid var(--border-subtle)
      padding-top: 0.5rem
      margin-top: 0.25rem
      font-weight: 700
      color: var(--text-primary)

      span:last-child { color: var(--success) }

  &__actions
    border-top: 1px solid var(--border-subtle)
    padding-top: 1.5rem
    display: flex
    flex-direction: column
    gap: 1.5rem

  &__qty-row
    display: flex
    align-items: center
    gap: 1.5rem

  &__qty-label
    font-size: 0.75rem
    font-weight: 700
    color: var(--text-secondary)
    text-transform: uppercase
    letter-spacing: 0.08em

  &__qty-ctrl
    display: flex
    align-items: center
    background: var(--surface-2)
    border: 1px solid var(--border-subtle)
    border-radius: var(--radius-xl)
    padding: 0.25rem
    gap: 0

  &__qty-btn
    width: 2.5rem; height: 2.5rem
    display: flex; align-items: center; justify-content: center
    border-radius: var(--radius-lg)
    border: none
    background: none
    cursor: pointer
    color: var(--text-primary)
    @include m.motion { transition: background v.$duration-fast ease }
    &:hover:not(:disabled) { background: var(--surface-0); box-shadow: var(--shadow-sm) }
    &:disabled { opacity: 0.2; cursor: not-allowed }

  &__qty-value
    width: 3rem
    text-align: center
    font-weight: 700
    font-size: 1.125rem
    color: var(--text-primary)

  &__cta-row
    display: flex
    gap: 0.75rem

  &__cta-main
    flex: 1

  &__cta-icon
    width: 3.5rem; height: 3.5rem
    flex-shrink: 0
    border-radius: var(--radius-xl)

  &__section
    border-top: 1px solid var(--border-subtle)
    padding-top: 1.5rem

  &__section-title
    font-size: 1.125rem
    font-weight: 900
    color: var(--text-primary)
    display: flex
    align-items: center
    gap: 0.5rem
    margin-bottom: 1rem

  &__description
    font-size: 0.9375rem
    color: var(--text-secondary)
    line-height: 1.7
```

**Trust row**
```
.ms-trust-row
  display: grid
  grid-template-columns: repeat(3, 1fr)
  gap: 1rem
  padding: 1.5rem 0
  border-top: 1px solid var(--border-subtle)
  border-bottom: 1px solid var(--border-subtle)

  &__item
    display: flex
    flex-direction: column
    align-items: center
    text-align: center
    gap: 0.5rem

  &__icon
    width: 2.5rem; height: 2.5rem
    background: var(--surface-2)
    border-radius: var(--radius-full)
    display: flex; align-items: center; justify-content: center
    color: var(--brand-primary)

  &__label
    font-size: 0.625rem
    font-weight: 700
    color: var(--text-secondary)
    line-height: 1.3
```

**Spec card**
```
.ms-spec-card
  background: var(--surface-0)
  border-radius: var(--radius-2xl)
  border: 1px solid var(--border-subtle)
  padding: 1.5rem
  box-shadow: var(--shadow-sm)

  &__title
    font-size: 1rem
    font-weight: 700
    color: var(--text-primary)
    margin-bottom: 1.25rem

  &__grid
    display: grid
    grid-template-columns: repeat(2, 1fr)
    gap: 1.25rem 2rem

  &__item
    display: flex
    flex-direction: column
    gap: 0.25rem

  &__key
    @include m.eyebrow

  &__val
    font-size: 0.875rem
    font-weight: 700
    color: var(--text-primary)
    &--mono { font-family: var(--font-mono); text-transform: uppercase }

  &__tags-section
    border-top: 1px solid var(--border-subtle)
    margin-top: 1.5rem
    padding-top: 1.5rem

  &__tags-label
    display: flex; align-items: center; gap: 0.5rem
    margin-bottom: 0.75rem
    @include m.eyebrow

  &__tags
    display: flex; flex-wrap: wrap; gap: 0.5rem
```

**Admin pricing panel**
```
.ms-pdp-admin-pricing
  margin-top: 1rem
  padding: 1rem
  background: var(--surface-0)
  border: 1px solid var(--border-subtle)
  border-radius: var(--radius-xl)
  box-shadow: var(--shadow-sm)

  &__row
    display: flex
    justify-content: space-between
    font-size: 0.875rem
    padding: 0.25rem 0

    &--total
      border-top: 1px solid var(--border-subtle)
      padding-top: 0.5rem
      margin-top: 0.25rem
      font-weight: 700
      span:last-child { color: var(--success) }
```

**Admin actions**
```
.ms-pdp-admin-actions
  border-top: 1px solid var(--border-subtle)
  padding-top: 1.5rem
  display: flex
  flex-direction: column
  gap: 1rem

  &__label
    display: flex; align-items: center; gap: 0.5rem
    font-size: 0.875rem
    color: var(--text-secondary)
    margin-bottom: 0.25rem

  &__row
    display: flex; gap: 1rem
```

**Skeleton**
```
.ms-pdp-skeleton
  display: grid
  grid-template-columns: 1fr
  gap: 2rem
  margin-top: 1rem

  @include m.lg { grid-template-columns: 5fr 7fr; gap: 3rem }

  &__image
    aspect-ratio: 4/5
    border-radius: var(--radius-2xl)
    background: var(--surface-2)
    @include m.motion { animation: ms-pdp-pulse 1.5s ease-in-out infinite }

  &__lines
    display: flex; flex-direction: column; gap: 1.5rem
    padding-top: 1rem

  &__line
    background: var(--surface-2)
    border-radius: var(--radius-sm)
    @include m.motion { animation: ms-pdp-pulse 1.5s ease-in-out infinite }
    &--sm  { height: 1rem; width: 8rem }
    &--md  { height: 3rem; width: 75% }
    &--lg  { height: 2.5rem; width: 40% }
    &--xl  { height: 8rem }
    &--cta { height: 4rem }
```

```scss
@include m.motion {
  @keyframes ms-pdp-pulse {
    0%, 100% { opacity: 1 }
    50%       { opacity: 0.5 }
  }
}
```

**Not-found state**
```
.ms-pdp-not-found
  display: flex; flex-direction: column; align-items: center; justify-content: center
  min-height: 60vh
  text-align: center
  padding: 2rem

  &__icon
    width: 6rem; height: 6rem
    background: var(--surface-2)
    border-radius: var(--radius-full)
    display: flex; align-items: center; justify-content: center
    margin-bottom: 1.5rem
    color: var(--text-tertiary)

  &__title
    font-size: 1.875rem; font-weight: 900
    color: var(--text-primary); margin-bottom: 1rem

  &__sub
    font-size: 1rem; color: var(--text-secondary)
    margin-bottom: 2rem; max-width: 28rem
```

---

## Phase 2 — Rewrite `shared/pages/product/components.tsx`

Line-by-line class substitutions (zero logic changes):

**`ProductBreadcrumbs`**
```
nav className           → "ms-breadcrumb"
ol className            → (remove — ms-breadcrumb is the flex container)
Link (home/products)    → "ms-breadcrumb__link"
ChevronRight wrapper li → <li className="ms-breadcrumb__sep">
last li (current page)  → <li className="ms-breadcrumb__current">
```

**`ProductGallery`**
```
outer div (space-y-4)           → "ms-gallery"
main image div (relative...)    → "ms-gallery__main"
discount badge div (absolute)   → "ms-gallery__badge"
thumbnails div (flex gap-4...)  → "ms-gallery__thumbs"
each thumb button               → "ms-gallery__thumb" + "ms-gallery__thumb--active" conditional
FallbackImage in thumb          → no className (fills parent via CSS)
```

**`ProductInfo`**
```
outer div (space-y-2)         → "ms-pdp-info__header" (new wrapper for info block)
category Link > p             → Link className="ms-pdp-info__cat"
h1                            → "ms-pdp-info__name"
stock row div                 → "ms-pdp-info__stock"
stock indicator div           → "ms-pdp-info__stock-indicator"
stock dot span                → "ms-pdp-info__stock-dot ms-pdp-info__stock-dot--{in|out}"
stock text span               → "ms-pdp-info__stock-text ms-pdp-info__stock-text--{in|out}"
admin qty div (border-l...)   → "ms-pdp-info__stock-qty"
```

**`ProductPricing`**
```
outer div (space-y-1)         → "ms-pdp-info__pricing"
price row div                 → "ms-pdp-info__price-row"
price span                    → "ms-pdp-info__price"
mrp span                      → "ms-pdp-info__mrp"
tax p                         → "ms-pdp-info__tax"
admin savings div (mt-4 p-4)  → "ms-pdp-admin-pricing"
each savings row div          → "ms-pdp-admin-pricing__row"
last row (total)              → "ms-pdp-admin-pricing__row ms-pdp-admin-pricing__row--total"
```

**`ProductSpecifications`**
```
outer div (space-y-6)         → "ms-spec-card" (remove the inner bg div, merge)
inner bg div                  → (remove wrapping div — ms-spec-card IS the card)
h3                            → "ms-spec-card__title"
spec grid div                 → "ms-spec-card__grid"
each spec div (space-y-1)     → "ms-spec-card__item"
key span                      → "ms-spec-card__key"
value p                       → "ms-spec-card__val" (SKU: add "ms-spec-card__val--mono")
tags section div              → "ms-spec-card__tags-section"
tags label div                → "ms-spec-card__tags-label"
tags row div                  → "ms-spec-card__tags"
each tag span                 → "ms-badge ms-badge--secondary ms-badge--sm"
```

**`TrustBadges`**
```
outer grid div                → "ms-trust-row"
each trust item div           → "ms-trust-row__item"
icon wrapper div              → "ms-trust-row__icon"
label p                       → "ms-trust-row__label"
```

---

## Phase 3 — Rewrite `shared/pages/product/ProductDetailsPage.tsx`

```
outer container div (max-w-7xl...)    → "ms-pdp__container" (wrap in ms-pdp in page.tsx instead)
layout grid div                       → "ms-pdp-layout"
gallery column div                    → (remove — ms-pdp-layout children are direct)
info column div (space-y-10 lg:pl-4) → "ms-pdp-info"
customer actions div (space-y-6 pt-4) → "ms-pdp-info__actions"
qty row div                           → "ms-pdp-info__qty-row"
qty label span                        → "ms-pdp-info__qty-label"
qty ctrl div                          → "ms-pdp-info__qty-ctrl"
qty minus/plus buttons                → "ms-pdp-info__qty-btn" (remove inline className)
qty value span                        → "ms-pdp-info__qty-value"
action buttons div (flex gap-4)       → "ms-pdp-info__cta-row"
SharedButton Add to Cart              → replace with ms-btn classes via className prop
SharedButton Wishlist                 → ms-btn ms-btn--secondary ms-btn--icon + className="ms-pdp-info__cta-icon"
SharedButton Share                    → same pattern
description section div               → "ms-pdp-info__section"
description h2                        → "ms-pdp-info__section-title"
description prose div                 → "ms-pdp-info__description"
admin actions div (pt-6 border-t)     → "ms-pdp-admin-actions"
admin label div                       → "ms-pdp-admin-actions__label"
admin buttons div (flex gap-4)        → "ms-pdp-admin-actions__row"
SharedButton Edit                     → ms-btn classes via className prop
SharedButton Toggle                   → ms-btn classes via className prop
```

> **Note on `SharedButton`**: `SharedButton` from `UIPrimitives` renders a `btn` utility class — it's out of scope to replace. Pass `className` with `ms-btn` classes to override visually, or accept that the shared primitive keeps its own style. Recommendation: leave `SharedButton` as-is for now; its `btn` class has its own styles in `globals.css`. The layout wrappers are what matter for the grid.

---

## Phase 4 — Rewrite `apps/web/src/app/products/[slug]/page.tsx`

```
import styles from './product.module.css'  → import './pdp.scss'
styles.wrapper (3 occurrences)             → "ms-pdp"

Loading skeleton (inline Tailwind grid):
  outer div                               → "ms-pdp__container"
  grid div                                → "ms-pdp-skeleton"
  gallery skeleton div                    → "ms-pdp-skeleton__image"
  info skeleton div                       → "ms-pdp-skeleton__lines"
  each skeleton line                      → "ms-pdp-skeleton__line ms-pdp-skeleton__line--{sm|md|lg|xl|cta}"

Not-found state (inline Tailwind):
  outer div (max-w-7xl...)               → "ms-pdp__container"
  icon wrapper div                        → "ms-pdp-not-found"
  inner icon div                          → "ms-pdp-not-found__icon"
  h1                                      → "ms-pdp-not-found__title"
  p                                       → "ms-pdp-not-found__sub"

ProductDetailsPage wrapper div:
  styles.wrapper                          → "ms-pdp"
  (ProductDetailsPage renders ms-pdp__container internally)
```

---

## Phase 5 — Delete `product.module.css`

```
apps/web/src/app/products/[slug]/product.module.css → delete
```

---

## File Change Summary

| File | Action |
|------|--------|
| `apps/web/src/app/products/[slug]/pdp.scss` | Create — full BEM spec |
| `apps/web/src/app/products/[slug]/page.tsx` | Replace module → pdp.scss; fix skeleton/not-found classes |
| `apps/web/src/app/products/[slug]/product.module.css` | Delete |
| `shared/pages/product/components.tsx` | Rewrite 28 Tailwind className strings → ms-* |
| `shared/pages/product/ProductDetailsPage.tsx` | Rewrite 32 Tailwind className strings → ms-* |

---

## Verification Checklist

- [ ] `ms-pdp` on page wrapper in DOM
- [ ] `ms-pdp-layout` grid in DOM
- [ ] `ms-breadcrumb`, `__link`, `__sep`, `__current` in DOM
- [ ] `ms-gallery`, `__main`, `__thumbs`, `__thumb`, `__thumb--active` in DOM
- [ ] `ms-pdp-info`, `__name`, `__price`, `__mrp` in DOM
- [ ] `ms-trust-row`, `__icon`, `__label` in DOM
- [ ] `ms-spec-card`, `__grid`, `__key`, `__val` in DOM
- [ ] `ms-pdp-skeleton` renders on load (before product arrives)
- [ ] `ms-pdp-not-found` renders for invalid slug
- [ ] Zero `styles.` references in `page.tsx`
- [ ] Zero inline Tailwind in `ProductDetailsPage.tsx` and `components.tsx`
- [ ] `product.module.css` deleted
- [ ] TypeScript: clean
- [ ] Next.js build: clean
