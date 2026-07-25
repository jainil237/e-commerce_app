---
slug: page05-checkout
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page05-checkout-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Plan — Page 05: Checkout (`/checkout`)

## Objective

Remove `checkout.module.css` and migrate `page.tsx` (494 lines, single file) to co-located BEM SCSS. Four section cards (address, coupon, order review, summary sidebar) and a loading state — all handled in one SCSS file with ~50 BEM tokens.

---

## Phase 1 — Write `src/app/checkout/checkout.scss`

`@use` paths: `../../styles/mixins` and `../../styles/variables`.

### Full BEM spec

```scss
@use '../../styles/mixins' as m;
@use '../../styles/variables' as v;

// ─── Page scaffold ────────────────────────────────────────
.ms-checkout {
  min-height: 100vh;
  background: var(--surface-1);

  &--loading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__container {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: 2rem 1rem;
    @include m.md { padding: 2rem 1.5rem; }
    @include m.lg { padding: 2rem 2rem; }
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  &__back {
    padding: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-xl);
    color: var(--text-primary);
    @include m.motion { transition: background v.$duration-fast ease; }
    &:hover { background: var(--surface-2); }
  }

  &__title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: var(--text-primary);
    @include m.md { font-size: 1.875rem; }
  }
}

// ─── Layout grid: 1col → md: [2fr 1fr] ───────────────────
.ms-checkout-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  align-items: start;
  @include m.md { grid-template-columns: 2fr 1fr; }
}

.ms-checkout__main {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

// ─── Section card (shared by address / coupon / review / summary) ──
.ms-checkout-section {
  background: var(--surface-0);
  padding: 1.5rem;
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;

  &--sticky {
    position: sticky;
    top: 6rem;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: var(--text-primary);
    margin-bottom: 1.25rem;
  }

  &__icon {
    color: var(--text-tertiary);
  }
}

// ─── Address ──────────────────────────────────────────────
.ms-checkout-address {
  &--empty {
    text-align: center;
    padding: 2rem;
    background: var(--surface-1);
    border-radius: var(--radius-xl);
    border: 1px dashed var(--border-base);
  }

  &__empty-text {
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  &__item {
    display: block;
    padding: 1rem;
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    cursor: pointer;
    background: var(--surface-0);
    @include m.motion { transition: box-shadow v.$duration-fast ease, border-color v.$duration-fast ease; }
    &:hover { box-shadow: var(--shadow-md); }

    &--selected {
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-primary) 20%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 5%, transparent);
    }
  }

  &__info {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  &__radio {
    margin-top: 0.25rem;
    width: 1rem;
    height: 1rem;
    accent-color: var(--brand-primary);
    flex-shrink: 0;
  }

  &__content { flex: 1; }

  &__name {
    font-weight: 700;
    font-size: 1rem;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  &__line {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  &__check {
    width: 1.25rem;
    height: 1.25rem;
    color: var(--brand-primary);
    flex-shrink: 0;
  }

  &__add-row {
    padding-top: 0.75rem;
  }
}

// ─── Coupon ───────────────────────────────────────────────
.ms-checkout-coupon {
  &--applied {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: color-mix(in srgb, #22c55e 8%, transparent);
    border: 1px solid color-mix(in srgb, #22c55e 30%, transparent);
    border-radius: var(--radius-xl);
  }

  &__code {
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #16a34a;
  }

  &__remove {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--error);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.5rem;
    @include m.motion { transition: color v.$duration-fast ease; }
    &:hover { color: color-mix(in srgb, var(--error) 70%, black); }
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  &__input-row {
    display: flex;
    gap: 0.75rem;
  }

  &__offers-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  &__offers-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  &__offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.75rem;
    border: 1px dashed var(--border-base);
    border-radius: var(--radius-lg);
    background: none;
    cursor: pointer;
    text-align: left;
    @include m.motion { transition: border-color v.$duration-fast ease; }
    &:hover { border-color: var(--brand-primary); }
  }

  &__offer-code {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--brand-primary);
  }

  &__offer-desc {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }
}

// ─── Order review items ───────────────────────────────────
.ms-checkout-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ms-checkout-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border-radius: var(--radius-xl);
  @include m.motion { transition: background v.$duration-fast ease; }
  &:hover { background: var(--surface-1); }

  &__image {
    position: relative;
    width: 3.5rem;
    height: 3.5rem;
    background: var(--surface-2);
    border-radius: var(--radius-lg);
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--border-subtle);
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 0.125rem;
  }

  &__qty {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  &__error {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--error);
  }

  &__total {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    @include m.price-text;
  }
}

// ─── Order summary sidebar ────────────────────────────────
.ms-checkout-summary {
  &__rows {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-bottom: 1.25rem;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  &__value {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  &__discount {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.75rem;
    color: var(--success);
  }

  &__divider {
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 1.25rem 0;
  }

  &__total-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 0.25rem;
  }

  &__total-label {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  &__total-value {
    font-size: 1.5rem;
    font-weight: 900;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    @include m.price-text;
  }

  &__tax {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-weight: 500;
  }

  &__secure {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    text-align: center;
    margin-top: 1.25rem;
  }
}
```

---

## Phase 2 — Rewrite `src/app/checkout/page.tsx`

**Import swap:**
```ts
// Remove:
import styles from './checkout.module.css'
// Add:
import './checkout.scss'
```

### `styles.*` → BEM mapping (28 module classes + 12 inline strings)

| CSS Module / Inline | BEM class |
|---|---|
| `styles.wrapper` (base) | `ms-checkout` |
| `${styles.wrapper} flex items-center justify-center` (loading) | `ms-checkout ms-checkout--loading` |
| `styles.container` | `ms-checkout__container` |
| `styles.header` | `ms-checkout__header` |
| `styles.backBtn` | `ms-checkout__back` |
| `styles.pageTitle` | `ms-checkout__title` |
| `styles.layoutGrid` | `ms-checkout-layout` |
| `styles.mainColumn` | `ms-checkout__main` |
| `styles.sectionCard` | `ms-checkout-section` |
| `styles.sectionHeader` | `ms-checkout-section__header` |
| `styles.sectionIcon` | `ms-checkout-section__icon` |
| `${styles.sectionCard} ${styles.summarySection}` | `ms-checkout-section ms-checkout-section--sticky` |
| `styles.addressEmpty` | `ms-checkout-address--empty` |
| `styles.addressEmptyText` | `ms-checkout-address__empty-text` |
| `styles.addressList` | `ms-checkout-address__list` |
| `styles.addressLabel` | `ms-checkout-address__item` |
| `${styles.addressLabel} ${styles.addressSelected}` | `ms-checkout-address__item ms-checkout-address__item--selected` |
| `${styles.addressLabel} ${styles.addressUnselected}` | `ms-checkout-address__item` |
| `styles.addressInfo` | `ms-checkout-address__info` |
| `styles.radioInput` | `ms-checkout-address__radio` |
| `styles.addressContent` | `ms-checkout-address__content` |
| `styles.addressName` | `ms-checkout-address__name` |
| `styles.addressLines` | `ms-checkout-address__line` |
| `styles.checkIcon` | `ms-checkout-address__check` |
| `"pt-3"` (add new address wrapper) | `ms-checkout-address__add-row` |
| `styles.couponApplied` | `ms-checkout-coupon--applied` |
| `styles.couponCode` | `ms-checkout-coupon__code` |
| `styles.couponRemove` | `ms-checkout-coupon__remove` |
| `"space-y-4"` (coupon body) | `ms-checkout-coupon__body` |
| `styles.couponInputWrapper` | `ms-checkout-coupon__input-row` |
| `styles.couponInput` → Input `className` | remove; Input handles its own width via `flex: 1` in row |
| `"text-sm font-medium text-[var(--foreground-2)]"` (Available Offers label) | `ms-checkout-coupon__offers-label` |
| `"flex flex-wrap gap-2"` (offers list) | `ms-checkout-coupon__offers-list` |
| `"flex flex-col ... border-dashed ..."` (offer button) | `ms-checkout-coupon__offer` |
| `"text-sm font-bold text-brand-primary"` (offer code span) | `ms-checkout-coupon__offer-code` |
| `"text-xs text-[var(--foreground-3)]"` (offer desc span) | `ms-checkout-coupon__offer-desc` |
| `styles.orderItemsList` | `ms-checkout-items` |
| `styles.orderItem` | `ms-checkout-item` |
| `styles.itemImageWrapper` | `ms-checkout-item__image` |
| `styles.itemImage` (FallbackImage) | `"object-cover"` (keep intrinsic class) |
| `styles.itemInfo` | `ms-checkout-item__info` |
| `styles.itemName` | `ms-checkout-item__name` |
| `styles.itemQty` | `ms-checkout-item__qty` |
| `"text-xs text-red-600 dark:text-red-400 font-medium"` (item error) | `ms-checkout-item__error` |
| `styles.itemTotal` | `ms-checkout-item__total` |
| `"space-y-1 mb-5"` (summary rows wrapper) | `ms-checkout-summary__rows` |
| `styles.summaryRow` | `ms-checkout-summary__row` |
| `styles.summaryValue` | `ms-checkout-summary__value` |
| `styles.summaryDiscount` | `ms-checkout-summary__discount` |
| `styles.divider` | `ms-checkout-summary__divider` |
| `"mb-6"` (total wrapper div) | remove — margin on `__total-row` in SCSS |
| `styles.totalRow` | `ms-checkout-summary__total-row` |
| `styles.totalLabel` | `ms-checkout-summary__total-label` |
| `styles.totalValue` | `ms-checkout-summary__total-value` |
| `styles.taxNotice` | `ms-checkout-summary__tax` |
| `styles.secureNotice` | `ms-checkout-summary__secure` |

**Address selected state — use `clsx`:**
```tsx
// Before (template literal):
className={`${styles.addressLabel} ${isSelected ? styles.addressSelected : styles.addressUnselected}`}

// After:
className={clsx('ms-checkout-address__item', { 'ms-checkout-address__item--selected': isSelected })}
```
`clsx` is already used elsewhere in the codebase.

**Coupon input `flex: 1`:** The `Input` atom already accepts `className`. Pass `className="flex-1"` or handle via the `__input-row` SCSS (`& > *:first-child { flex: 1; }`). Prefer the SCSS-only approach to avoid inline utilities.

---

## Phase 3 — Delete `src/app/checkout/checkout.module.css`

Delete the file. Verify no remaining import references.

---

## Impacted Files

| File | Change |
|---|---|
| `apps/web/src/app/checkout/checkout.scss` | **Create** |
| `apps/web/src/app/checkout/page.tsx` | Swap module import → scss; replace all `styles.*` and inline Tailwind |
| `apps/web/src/app/checkout/checkout.module.css` | **Delete** |

---

## Risks / Notes

- **`clsx` import:** `page.tsx` does not currently import `clsx`. Add `import clsx from 'clsx'` — the package is already in `apps/web` dependencies (used by other components).
- **Radio accent-color:** `checkout.module.css` used Tailwind's `text-[var(--brand-primary)]` on the radio which doesn't actually color radios reliably. Replaced with `accent-color: var(--brand-primary)` — correct CSS property.
- **Coupon `--applied` green:** Currently hardcoded `bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800`. SCSS uses `color-mix` against `#22c55e` for light/dark-agnostic tinting — no raw `dark:` needed.
- **`summarySection` sticky:** Currently `sticky top-24` inline on the sidebar wrapper div. Moved to `ms-checkout-section--sticky` modifier — clean separation.
- **`couponInput className`:** Currently `styles.couponInput` adds `flex-1 uppercase tracking-widest`. The `flex: 1` is structural (handled via `__input-row > *:first-child` in SCSS). The `uppercase tracking-widest` visually styles the coupon code — add these directly in SCSS on `__input-row input` selector (the Input atom renders an `<input>` internally).
- **Checkout logic untouched:** Razorpay script injection, cart validation, coupon POST, order creation — zero changes. Style-only migration.
