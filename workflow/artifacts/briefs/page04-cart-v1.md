---
slug: page04-cart
version: 1
status: draft
created: 2026-06-22
---

# Think Brief — Page 04: Cart (`/cart`)

## Summary

The Cart page is a single client component: `apps/web/src/app/cart/page.tsx` (305 lines). It has three render states: loading skeleton, empty state, and the full cart view (items list + order summary sidebar). All styling lives in `cart.module.css` (152 lines, 24 classes, all `@apply`) plus 15 inline Tailwind strings scattered across the three render states.

The page is self-contained — no shared components involved, no sub-components split into separate files. Everything is inlined.

---

## Requirements

### R1 — Write `apps/web/src/app/cart/cart.scss`

Co-located at `src/app/cart/cart.scss`. `@use` paths: `../../styles/mixins` and `../../styles/variables`.

| Block / Element | Role |
|-----------------|------|
| `.ms-cart` | Page wrapper: `min-height: 100vh`, `background: var(--surface-1)` |
| `.ms-cart__container` | Max-width container: `max-width: var(--container-max)`, centered, responsive padding |
| `.ms-cart__title` | Page `<h1>`: `1.5rem` → `md: 1.875rem`, `font-weight: 700`, `color: var(--text-primary)`, `margin-bottom: 2rem` |
| `.ms-cart-layout` | CSS grid: `1fr` → `lg: 2fr 1fr`, `gap: 2rem`, `align-items: start` |
| `.ms-cart-items` | Items column — no layout needed (flex-col gap is on children) |
| `.ms-cart-item` | Card: `display: flex`, `flex-direction: column` → `sm: row`, `gap: 1rem`, `padding: 1rem` → `md: 1.5rem`, `background: var(--surface-0)`, `border-radius: var(--radius-2xl)`, `border: 1px solid var(--border-subtle)`, `box-shadow: var(--shadow-sm)` |
| `.ms-cart-item__image` | Image wrapper (link): `position: relative`, `width: 6rem; height: 6rem` → `sm: 7rem`, `background: var(--surface-2)`, `border-radius: var(--radius-xl)`, `overflow: hidden`, `flex-shrink: 0`, `border: 1px solid var(--border-subtle)`. `img`: `object-fit: cover`, `@include m.motion { transition: transform }`, hover → `scale(1.05)` |
| `.ms-cart-item__content` | Flex col, `flex: 1` |
| `.ms-cart-item__header` | `display: flex`, `justify-content: space-between`, `align-items: flex-start`, `gap: 1rem`, `margin-bottom: 0.5rem` |
| `.ms-cart-item__name` | Product link: `font-weight: 600`, `font-size: 1.0625rem`, `color: var(--text-primary)`, hover → `color: var(--brand-primary)`, `display: -webkit-box`, `-webkit-line-clamp: 2`, overflow hidden (line clamp) |
| `.ms-cart-item__meta` | GST line: `font-size: 0.75rem`, `color: var(--text-secondary)`, `margin-top: 0.25rem` |
| `.ms-cart-item__price-block` | Right-aligned: `text-align: right`, `flex-shrink: 0` |
| `.ms-cart-item__total` | Line total: `font-weight: 700`, `font-size: 1.125rem`, `color: var(--text-primary)`, `@include m.price-text` |
| `.ms-cart-item__discount` | Save badge: `font-size: 0.75rem`, `font-weight: 600`, `color: var(--success)`, `margin-top: 0.25rem` |
| `.ms-cart-item__breakdown` | Unit price row: `display: flex`, `align-items: center`, `gap: 0.5rem`, `margin-bottom: 1rem` |
| `.ms-cart-item__unit-price` | `font-size: 0.875rem`, `font-weight: 500`, `color: var(--text-primary)`, `@include m.price-text` |
| `.ms-cart-item__unit-mrp` | `font-size: 0.75rem`, `text-decoration: line-through`, `color: var(--text-tertiary)`, `@include m.price-text` |
| `.ms-cart-item__controls` | `display: flex`, `align-items: center`, `justify-content: space-between`, `margin-top: auto`, `padding-top: 1rem`, `border-top: 1px solid var(--border-subtle)` |
| `.ms-cart-item__qty` | Stepper wrapper: `display: flex`, `align-items: center`, `border: 1px solid var(--border-base)`, `border-radius: var(--radius-lg)`, `overflow: hidden`, `background: var(--surface-0)` |
| `.ms-cart-item__qty-btn` | `padding: 0.5rem`, `color: var(--text-secondary)`, `border: none`, `background: none`, `cursor: pointer`, hover → `background: var(--surface-2)`, `color: var(--text-primary)`, disabled → `opacity: 0.5; cursor: not-allowed`, `@include m.motion { transition: background/color }` |
| `.ms-cart-item__qty-value` | `width: 2.5rem`, `text-align: center`, `font-weight: 500`, `font-size: 0.875rem`, `color: var(--text-primary)` |
| `.ms-cart-item__stock-error` | `font-size: 0.75rem`, `font-weight: 500`, `color: var(--error)` |
| `.ms-cart-item__remove` | `padding: 0.5rem`, `color: var(--error)`, `border: none`, `background: none`, `cursor: pointer`, `border-radius: var(--radius-md)`, hover → `background: rgba(239,68,68,0.08)`, `margin-left: auto`, `@include m.motion { transition }` |
| `.ms-cart-clear` | `margin-top: 1.5rem`, `display: flex`, `justify-content: center` |
| `.ms-cart-summary` | Sticky summary card: `background: var(--surface-0)`, `padding: 1.5rem`, `border-radius: var(--radius-2xl)`, `border: 1px solid var(--border-base)`, `box-shadow: var(--shadow-sm)`, `position: sticky`, `top: 6rem` |
| `.ms-cart-summary__title` | `font-size: 1.25rem`, `font-weight: 700`, `margin-bottom: 1.5rem`, `color: var(--text-primary)` |
| `.ms-cart-summary__rows` | `display: flex`, `flex-direction: column`, `gap: 1rem` |
| `.ms-cart-summary__row` | `display: flex`, `justify-content: space-between`, `font-size: 0.875rem`, `color: var(--text-secondary)` |
| `.ms-cart-summary__value` | `color: var(--text-primary)`, `font-weight: 500`, `font-variant-numeric: tabular-nums` |
| `.ms-cart-summary__shipping-notice` | Free shipping nudge: `font-size: 0.875rem`, `font-weight: 500`, `color: #D97706`, `background: #FFFBEB`, `padding: 0.75rem`, `border-radius: var(--radius-lg)`, `border: 1px solid #FDE68A`, `margin-top: 1rem`, `text-align: center` |
| `.ms-cart-summary__divider` | `border: none`, `border-top: 1px solid var(--border-subtle)`, `margin: 1.5rem 0` |
| `.ms-cart-summary__total-row` | `display: flex`, `justify-content: space-between`, `align-items: flex-end`, `margin-bottom: 0.5rem` |
| `.ms-cart-summary__total-label` | `font-size: 1.125rem`, `font-weight: 700`, `color: var(--text-primary)` |
| `.ms-cart-summary__total-value` | `font-size: 1.5rem`, `font-weight: 900`, `color: var(--text-primary)`, `@include m.price-text` |
| `.ms-cart-summary__tax` | `font-size: 0.75rem`, `color: var(--text-tertiary)` |
| `.ms-cart-summary__actions` | `display: flex`, `flex-direction: column`, `gap: 0.75rem`, `margin-top: 2rem` |
| `.ms-cart-summary__stock-error` | `font-size: 0.875rem`, `color: var(--error)` |
| `.ms-cart-skeleton` | Loading state layout — matches `.ms-cart-layout` grid |
| `.ms-cart-skeleton__title` | `height: 2.5rem`, `width: 12rem`, `background: var(--surface-2)`, `border-radius: var(--radius-sm)`, `margin-bottom: 2rem`, pulse animation |
| `.ms-cart-skeleton__item` | Matches `.ms-cart-item` shape — flex row, same padding/border/radius |
| `.ms-cart-skeleton__image` | `width: 7rem; height: 7rem`, `background: var(--surface-2)`, `border-radius: var(--radius-xl)`, pulse |
| `.ms-cart-skeleton__content` | `flex: 1`, `display: flex`, `flex-direction: column`, `gap: 0.75rem`, `padding: 0.5rem 0` |
| `.ms-cart-skeleton__line` | `background: var(--surface-2)`, `border-radius: var(--radius-sm)`, pulse. Modifiers: `--lg` (height 1.25rem, width 75%), `--sm` (height 1rem, width 25%), `--md` (height 2rem, width 33%) |
| `.ms-cart-skeleton__summary` | `height: 22rem`, `background: var(--surface-2)`, `border-radius: var(--radius-2xl)`, pulse |
| `.ms-cart-empty` | `display: flex`, `flex-direction: column`, `align-items: center`, `justify-content: center`, `min-height: 60vh`, `padding: 4rem 2rem`, `text-align: center`, `max-width: 28rem`, `margin: 0 auto` |
| `.ms-cart-empty__icon` | `width: 6rem; height: 6rem`, `background: var(--surface-2)`, `border-radius: var(--radius-full)`, `display: flex`, `align-items/justify-content: center`, `color: var(--text-tertiary)`, `margin-bottom: 1.5rem` |
| `.ms-cart-empty__title` | `font-size: 1.5rem`, `font-weight: 700`, `color: var(--text-primary)`, `margin-bottom: 0.75rem` |
| `.ms-cart-empty__sub` | `color: var(--text-secondary)`, `margin-bottom: 2rem` |

Skeleton pulse: `@include m.motion { animation: ms-cart-pulse 1.5s ease-in-out infinite }` — same pattern as PLP/PDP.

---

### R2 — Rewrite `apps/web/src/app/cart/page.tsx`

**Import changes:**
```ts
// Remove:
import styles from './cart.module.css'
// Add:
import './cart.scss'
```

**`styles.*` → BEM mapping (24 classes):**

| CSS Module | BEM |
|-----------|-----|
| `styles.wrapper` | `ms-cart` |
| `styles.container` | `ms-cart__container` |
| `styles.pageTitle` | `ms-cart__title` |
| `styles.layoutGrid` | `ms-cart-layout` |
| `styles.itemsColumn` | `ms-cart-items` |
| `styles.itemCard` | `ms-cart-item` |
| `styles.itemImageWrapper` | `ms-cart-item__image` |
| `styles.itemImage` | `object-cover` (keep on FallbackImage — image intrinsic, same as PDP) |
| `styles.itemContent` | `ms-cart-item__content` |
| `styles.itemHeaderRow` | `ms-cart-item__header` |
| `styles.itemTitle` | `ms-cart-item__name` |
| `styles.itemMeta` | `ms-cart-item__meta` |
| `styles.priceBlock` | `ms-cart-item__price-block` |
| `styles.itemTotal` | `ms-cart-item__total` |
| `styles.itemDiscount` | `ms-cart-item__discount` |
| `styles.priceBreakdown` | `ms-cart-item__breakdown` |
| `styles.unitPrice` | `ms-cart-item__unit-price` |
| `styles.unitMrp` | `ms-cart-item__unit-mrp` |
| `styles.controlsRow` | `ms-cart-item__controls` |
| `styles.quantityCtrl` | `ms-cart-item__qty` |
| `styles.quantityBtn` | `ms-cart-item__qty-btn` |
| `styles.quantityValue` | `ms-cart-item__qty-value` |
| `styles.removeBtn` | `ms-cart-item__remove` |
| `styles.summaryCard` | `ms-cart-summary` |
| `styles.summaryTitle` | `ms-cart-summary__title` |
| `styles.summaryRow` | `ms-cart-summary__row` |
| `styles.summaryValue` | `ms-cart-summary__value` |
| `styles.freeShippingNotice` | `ms-cart-summary__shipping-notice` |
| `styles.divider` | `ms-cart-summary__divider` |
| `styles.totalRow` | `ms-cart-summary__total-row` |
| `styles.totalLabel` | `ms-cart-summary__total-label` |
| `styles.totalValue` | `ms-cart-summary__total-value` |
| `styles.taxesNotice` | `ms-cart-summary__tax` |
| `styles.actions` | `ms-cart-summary__actions` |
| `styles.emptyState` | `ms-cart-empty` |
| `styles.emptyIconWrapper` | `ms-cart-empty__icon` |

**Inline Tailwind → BEM (15 strings):**

| Line | Current | BEM |
|------|---------|-----|
| 87 | `"skeleton h-10 w-48 mb-8 rounded-lg"` | `ms-cart-skeleton__title` |
| 88 | `styles.layoutGrid` (skeleton) | `ms-cart-layout` |
| 89 | `styles.itemsColumn` (skeleton) | `ms-cart-items` |
| 91 | `styles.itemCard` (skeleton) | `ms-cart-item` |
| 92 | `"skeleton w-24 h-24 sm:w-28 sm:h-28 rounded-xl"` | `ms-cart-skeleton__image` |
| 93 | `"flex-1 space-y-3 py-2"` | `ms-cart-skeleton__content` |
| 94 | `"skeleton h-5 w-3/4 rounded"` | `ms-cart-skeleton__line ms-cart-skeleton__line--lg` |
| 95 | `"skeleton h-4 w-1/4 rounded"` | `ms-cart-skeleton__line ms-cart-skeleton__line--sm` |
| 96 | `"skeleton h-8 w-1/3 rounded mt-4"` | `ms-cart-skeleton__line ms-cart-skeleton__line--md` |
| 101 | `"skeleton h-[350px] rounded-2xl sticky top-24"` | `ms-cart-skeleton__summary` |
| 114 | `"text-2xl font-bold mb-3 text-gray-900 dark:text-white"` on `<h1>` | `ms-cart-empty__title` |
| 115 | `"text-gray-500 mb-8 dark:text-gray-400"` on `<p>` | `ms-cart-empty__sub` |
| 208–210 | `"text-xs text-red-600 dark:text-red-400 font-medium"` stock error | `ms-cart-item__stock-error` |
| 229 | `"mt-6 flex justify-center"` clear-cart wrapper div | `ms-cart-clear` |
| 232 | Button `className="text-red-500 hover:..."` | remove `className`; use `variant="ghost"` + add `ms-btn--ghost-danger` via `className` |
| 248 | `"space-y-4"` around summary rows | `ms-cart-summary__rows` |
| 277 | `"text-sm text-red-600 dark:text-red-400 mb-2"` stock notice | `ms-cart-summary__stock-error` |

---

### R3 — Delete `cart.module.css`

---

## Impacted Files

| File | Change |
|------|--------|
| `apps/web/src/app/cart/cart.scss` | Create |
| `apps/web/src/app/cart/page.tsx` | Swap module import → scss, replace all `styles.*` + inline Tailwind |
| `apps/web/src/app/cart/cart.module.css` | Delete |

---

## Risks / Notes

- **`styles.itemImage` / `object-cover`**: The `FallbackImage` receives `className={styles.itemImage}` which compiles to `object-cover transition-transform hover:scale-105`. The hover scale is handled in SCSS via the parent `.ms-cart-item__image img` selector — so `FallbackImage` only needs `className="object-cover"` (image intrinsic, kept as-is per PDP precedent).
- **Clear cart button**: Currently uses inline `className` on `<Button>` with red ghost styles. Use `variant="ghost"` and add `className="ms-btn--ghost-danger"` to leverage the existing button modifier — no extra SCSS needed.
- **Free shipping notice**: Uses hardcoded amber/yellow Tailwind. Replace with `ms-cart-summary__shipping-notice` which encodes the amber color directly in SCSS (not a CSS var, since this is a semantic warning color that doesn't theme).
- **`dark:` prefixes**: `page.tsx` has a few `dark:text-gray-400` etc. on empty state and stock error. These are removed — theming is handled globally via CSS custom properties (`var(--text-secondary)` etc.) which already switch in dark mode.
- **No shared components**: Cart is fully self-contained. Only the `Button` atom and `FallbackImage` are imported.
