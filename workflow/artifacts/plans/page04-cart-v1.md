---
slug: page04-cart
version: 1
status: ready-for-next-phase
created: 2026-06-22
brief: .workflow/artifacts/briefs/page04-cart-v1.md
branch: ai-changes
---

# Plan — Page 04: Cart (`/cart`)

## Objective

Remove `cart.module.css` and migrate `page.tsx` (305 lines, single file) to co-located BEM SCSS. Three render states (skeleton, empty, full cart) all handled in one SCSS file with 47 BEM blocks.

---

## Phase 1 — Write `src/app/cart/cart.scss`

`@use` paths: `../../styles/mixins` and `../../styles/variables`.

### Full BEM spec

```scss
@use '../../styles/mixins' as m;
@use '../../styles/variables' as v;

// Page scaffold
.ms-cart {
  min-height: 100vh;
  background: var(--surface-1);

  &__container {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: 2rem 1rem;
    @include m.md { padding: 2rem 1.5rem; }
    @include m.lg { padding: 2rem 2rem; }
  }

  &__title {
    font-size: 1.5rem; font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2rem;
    @include m.md { font-size: 1.875rem; }
  }
}

// Layout grid: 1col → lg: [2fr 1fr]
.ms-cart-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  align-items: start;
  @include m.lg { grid-template-columns: 2fr 1fr; }
}

.ms-cart-items { display: flex; flex-direction: column; gap: 1rem; }

// Item card
.ms-cart-item {
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1rem; background: var(--surface-0);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  @include m.sm { flex-direction: row; padding: 1.5rem; }

  &__image {
    position: relative;
    width: 6rem; height: 6rem;
    background: var(--surface-2);
    border-radius: var(--radius-xl);
    overflow: hidden; flex-shrink: 0;
    border: 1px solid var(--border-subtle);
    @include m.sm { width: 7rem; height: 7rem; }
    img {
      object-fit: cover;
      @include m.motion { transition: transform v.$duration-slow ease; }
    }
    &:hover img { @include m.motion { transform: scale(1.05); } }
  }

  &__content { display: flex; flex-direction: column; flex: 1; }

  &__header {
    display: flex; justify-content: space-between;
    align-items: flex-start; gap: 1rem; margin-bottom: 0.5rem;
  }

  &__name {
    font-weight: 600; font-size: 1.0625rem;
    color: var(--text-primary); text-decoration: none;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
    @include m.motion { transition: color v.$duration-fast ease; }
    &:hover { color: var(--brand-primary); }
  }

  &__meta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; }

  &__price-block { text-align: right; flex-shrink: 0; }

  &__total {
    font-weight: 700; font-size: 1.125rem;
    color: var(--text-primary); @include m.price-text;
  }

  &__discount { font-size: 0.75rem; font-weight: 600; color: var(--success); margin-top: 0.25rem; }

  &__breakdown { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; }

  &__unit-price { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); @include m.price-text; }

  &__unit-mrp { font-size: 0.75rem; text-decoration: line-through; color: var(--text-tertiary); @include m.price-text; }

  &__controls {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: auto; padding-top: 1rem;
    border-top: 1px solid var(--border-subtle);
  }

  &__qty {
    display: flex; align-items: center;
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); overflow: hidden;
    background: var(--surface-0);
  }

  &__qty-btn {
    padding: 0.5rem; border: none; background: none; cursor: pointer;
    color: var(--text-secondary);
    @include m.motion { transition: background v.$duration-fast ease, color v.$duration-fast ease; }
    &:hover { background: var(--surface-2); color: var(--text-primary); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &__qty-value {
    width: 2.5rem; text-align: center;
    font-weight: 500; font-size: 0.875rem; color: var(--text-primary);
  }

  &__stock-error { font-size: 0.75rem; font-weight: 500; color: var(--error); }

  &__remove {
    padding: 0.5rem; border: none; background: none; cursor: pointer;
    color: var(--error); border-radius: var(--radius-md); margin-left: auto;
    @include m.motion { transition: background v.$duration-fast ease; }
    &:hover { background: rgba(239, 68, 68, 0.08); }
  }
}

// Clear cart row
.ms-cart-clear { margin-top: 1.5rem; display: flex; justify-content: center; }

// Order summary sidebar
.ms-cart-summary {
  background: var(--surface-0); padding: 1.5rem;
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border-base);
  box-shadow: var(--shadow-sm);
  position: sticky; top: 6rem;

  &__title {
    font-size: 1.25rem; font-weight: 700;
    margin-bottom: 1.5rem; color: var(--text-primary);
  }

  &__rows { display: flex; flex-direction: column; gap: 1rem; }

  &__row {
    display: flex; justify-content: space-between;
    font-size: 0.875rem; color: var(--text-secondary);
  }

  &__value { color: var(--text-primary); font-weight: 500; font-variant-numeric: tabular-nums; }

  &__shipping-notice {
    font-size: 0.875rem; font-weight: 500;
    color: #D97706; background: #FFFBEB;
    padding: 0.75rem; border-radius: var(--radius-lg);
    border: 1px solid #FDE68A; margin-top: 1rem; text-align: center;
  }

  &__divider { border: none; border-top: 1px solid var(--border-subtle); margin: 1.5rem 0; }

  &__total-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 0.5rem; }

  &__total-label { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }

  &__total-value { font-size: 1.5rem; font-weight: 900; color: var(--text-primary); @include m.price-text; }

  &__tax { font-size: 0.75rem; color: var(--text-tertiary); }

  &__actions { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 2rem; }

  &__stock-error { font-size: 0.875rem; color: var(--error); }
}

// Skeleton
.ms-cart-skeleton {
  &__title {
    height: 2.5rem; width: 12rem;
    background: var(--surface-2); border-radius: var(--radius-sm);
    margin-bottom: 2rem;
    @include m.motion { animation: ms-cart-pulse 1.5s ease-in-out infinite; }
  }

  &__item {
    display: flex; gap: 1rem; padding: 1rem;
    background: var(--surface-0); border-radius: var(--radius-2xl);
    border: 1px solid var(--border-subtle);
    @include m.sm { padding: 1.5rem; }
  }

  &__image {
    width: 7rem; height: 7rem; flex-shrink: 0;
    background: var(--surface-2); border-radius: var(--radius-xl);
    @include m.motion { animation: ms-cart-pulse 1.5s ease-in-out infinite; }
  }

  &__content { flex: 1; display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0; }

  &__line {
    background: var(--surface-2); border-radius: var(--radius-sm);
    @include m.motion { animation: ms-cart-pulse 1.5s ease-in-out infinite; }
    &--lg { height: 1.25rem; width: 75%; }
    &--sm { height: 1rem;    width: 25%; }
    &--md { height: 2rem;    width: 33%; margin-top: 0.25rem; }
  }

  &__summary {
    height: 22rem; background: var(--surface-2);
    border-radius: var(--radius-2xl);
    @include m.motion { animation: ms-cart-pulse 1.5s ease-in-out infinite; }
  }
}

@include m.motion {
  @keyframes ms-cart-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
  }
}

// Empty state
.ms-cart-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 60vh; padding: 4rem 2rem; text-align: center;
  max-width: 28rem; margin: 0 auto;

  &__icon {
    width: 6rem; height: 6rem;
    background: var(--surface-2); border-radius: var(--radius-full);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-tertiary); margin-bottom: 1.5rem;
  }

  &__title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.75rem; }

  &__sub { color: var(--text-secondary); margin-bottom: 2rem; }
}
```

---

## Phase 2 — Rewrite `src/app/cart/page.tsx`

Swap import, replace all `styles.*` with BEM strings, remove inline Tailwind.

**Import:**
```ts
// Remove: import styles from './cart.module.css'
// Add:    import './cart.scss'
```

**Full class mapping:**

```
styles.wrapper              → "ms-cart"
styles.container            → "ms-cart__container"
styles.pageTitle            → "ms-cart__title"
styles.layoutGrid           → "ms-cart-layout"
styles.itemsColumn          → "ms-cart-items"
styles.itemCard             → "ms-cart-item"
styles.itemImageWrapper     → "ms-cart-item__image"
styles.itemImage            → "object-cover"  (image intrinsic — keep on FallbackImage)
styles.itemContent          → "ms-cart-item__content"
styles.itemHeaderRow        → "ms-cart-item__header"
styles.itemTitle            → "ms-cart-item__name"
styles.itemMeta             → "ms-cart-item__meta"
styles.priceBlock           → "ms-cart-item__price-block"
styles.itemTotal            → "ms-cart-item__total"
styles.itemDiscount         → "ms-cart-item__discount"
styles.priceBreakdown       → "ms-cart-item__breakdown"
styles.unitPrice            → "ms-cart-item__unit-price"
styles.unitMrp              → "ms-cart-item__unit-mrp"
styles.controlsRow          → "ms-cart-item__controls"
styles.quantityCtrl         → "ms-cart-item__qty"
styles.quantityBtn          → "ms-cart-item__qty-btn"
styles.quantityValue        → "ms-cart-item__qty-value"
styles.removeBtn            → "ms-cart-item__remove"
styles.summaryCard          → "ms-cart-summary"
styles.summaryTitle         → "ms-cart-summary__title"
styles.summaryRow           → "ms-cart-summary__row"
styles.summaryValue         → "ms-cart-summary__value"
styles.freeShippingNotice   → "ms-cart-summary__shipping-notice"
styles.divider              → "ms-cart-summary__divider"
styles.totalRow             → "ms-cart-summary__total-row"
styles.totalLabel           → "ms-cart-summary__total-label"
styles.totalValue           → "ms-cart-summary__total-value"
styles.taxesNotice          → "ms-cart-summary__tax"
styles.actions              → "ms-cart-summary__actions"
styles.emptyState           → "ms-cart-empty"
styles.emptyIconWrapper     → "ms-cart-empty__icon"
```

**Inline Tailwind replacements:**

```
Skeleton title div          "skeleton h-10 w-48 mb-8 rounded-lg"       → "ms-cart-skeleton__title"
Skeleton layoutGrid         styles.layoutGrid                            → "ms-cart-layout"  (already covered above)
Skeleton itemsColumn        styles.itemsColumn                           → "ms-cart-items"
Skeleton itemCard           styles.itemCard                              → "ms-cart-item"
Skeleton image div          "skeleton w-24 h-24 sm:w-28 sm:h-28 ..."   → "ms-cart-skeleton__image"
Skeleton content div        "flex-1 space-y-3 py-2"                     → "ms-cart-skeleton__content"
Skeleton line 1             "skeleton h-5 w-3/4 rounded"                → "ms-cart-skeleton__line ms-cart-skeleton__line--lg"
Skeleton line 2             "skeleton h-4 w-1/4 rounded"                → "ms-cart-skeleton__line ms-cart-skeleton__line--sm"
Skeleton line 3             "skeleton h-8 w-1/3 rounded mt-4"           → "ms-cart-skeleton__line ms-cart-skeleton__line--md"
Skeleton summary div        "skeleton h-[350px] rounded-2xl sticky ..." → "ms-cart-skeleton__summary"
Empty h1                    "text-2xl font-bold mb-3 text-gray-900 ..." → "ms-cart-empty__title"
Empty p                     "text-gray-500 mb-8 dark:text-gray-400"     → "ms-cart-empty__sub"
Stock error span            "text-xs text-red-600 dark:..."             → "ms-cart-item__stock-error"
Clear cart wrapper          "mt-6 flex justify-center"                  → "ms-cart-clear"
Clear cart Button           className="text-red-500 hover:..."          → className="ms-btn--ghost-danger"
Summary rows wrapper        "space-y-4"                                  → "ms-cart-summary__rows"
Summary stock error p       "text-sm text-red-600 dark:..."             → "ms-cart-summary__stock-error"
```

**Skeleton structure rewrite** — change from mixed `styles.*` + inline Tailwind to pure BEM:
```tsx
<div className="ms-cart">
  <div className="ms-cart__container">
    <div className="ms-cart-skeleton__title" />
    <div className="ms-cart-layout">
      <div className="ms-cart-items">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="ms-cart-skeleton__item">
            <div className="ms-cart-skeleton__image" />
            <div className="ms-cart-skeleton__content">
              <div className="ms-cart-skeleton__line ms-cart-skeleton__line--lg" />
              <div className="ms-cart-skeleton__line ms-cart-skeleton__line--sm" />
              <div className="ms-cart-skeleton__line ms-cart-skeleton__line--md" />
            </div>
          </div>
        ))}
      </div>
      <div className="ms-cart-skeleton__summary" />
    </div>
  </div>
</div>
```

---

## Phase 3 — Delete `cart.module.css`

```bash
rm apps/web/src/app/cart/cart.module.css
```

---

## File Change Summary

| File | Action |
|------|--------|
| `apps/web/src/app/cart/cart.scss` | Create |
| `apps/web/src/app/cart/page.tsx` | Rewrite imports + all class names |
| `apps/web/src/app/cart/cart.module.css` | Delete |

---

## Verification Checklist

- [ ] `cart.module.css` deleted — no `@apply` remaining
- [ ] `page.tsx` has zero `styles.` references
- [ ] `page.tsx` has zero inline Tailwind utility strings (except `object-cover` on FallbackImage)
- [ ] Skeleton renders three item placeholders + summary placeholder in correct layout
- [ ] Empty state renders icon + title + sub + CTA with correct BEM classes
- [ ] Full cart: items, qty stepper, remove, clear-cart all render with BEM classes
- [ ] Order summary: subtotal/shipping rows, free-shipping notice, total, CTA buttons
- [ ] `ms-btn--ghost-danger` on Clear Cart button (red ghost style)
- [ ] TypeScript `--noEmit` passes clean
