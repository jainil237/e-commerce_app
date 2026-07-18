---
slug: page05-checkout
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: none
  waiver: "User invoked 'proceed with Page 05' — pattern established by page01–04; brief-review checkpoint waived."
---

# Think Brief — Page 05: Checkout (`/checkout`)

## Summary

The Checkout page is a single client component: `apps/web/src/app/checkout/page.tsx` (494 lines). It renders three states: loading spinner (auth check), the full checkout form (address selection + coupon + order review + sidebar summary), and an empty-cart redirect. All styling lives in `checkout.module.css` (188 lines, 28 classes, all `@apply` Tailwind) plus ~12 inline Tailwind strings spread across the JSX.

The page is self-contained — no sub-components are split out. The Razorpay integration, cart validation, and coupon logic are pure state/effect; they are not touched by this migration.

---

## Requirements

### R1 — Write `apps/web/src/app/checkout/checkout.scss`

Co-located SCSS file. `@use '../../styles/mixins' as m` and `@use '../../styles/variables' as v`. All 28 CSS Module classes → BEM `ms-checkout` namespace. ~50 BEM tokens total.

**Acceptance criteria:** File compiles without error; all visual output is pixel-equivalent to the current Tailwind output; all transitions use `@include m.motion`; no `@apply` or Tailwind utilities.

### R2 — Rewrite `apps/web/src/app/checkout/page.tsx`

Replace `import styles from './checkout.module.css'` → `import './checkout.scss'`. Replace every `styles.*` reference and inline Tailwind string with the corresponding BEM class string.

**Acceptance criteria:** Zero remaining references to `styles.*` or `checkout.module.css`; no inline Tailwind utility strings on elements that have a BEM class; page renders identically at all breakpoints.

### R3 — Delete `apps/web/src/app/checkout/checkout.module.css`

**Acceptance criteria:** File absent from repo; no import references to it remain.

---

## Implicit Requirements

### RI1 — `@include m.motion` for all transitions

Every `transition-*` and `animation` declaration must be wrapped in `@include m.motion` (reduced-motion guard). Consistent with page01–04.

### RI2 — No `dark:` Tailwind prefixes

Theming handled by CSS custom properties (`var(--text-*)`, `var(--surface-*)`, etc.) which already switch in dark mode. Any `dark:` inline strings are dropped.

### RI3 — `object-cover` stays on `FallbackImage`

Per PDP and cart precedent: `FallbackImage className="object-cover"` is image-intrinsic and stays. The parent wrapper controls shape/overflow in SCSS.

---

## Architecture Notes

- **Role:** Architect
- **Scope:** Style-only migration. No logic, no state, no API contract is touched.
- **Namespace:** `ms-checkout` (storefront prefix, matches page01–04 `ms-*` convention).
- **Layout:** 3-col grid on `md+` (`grid-template-columns: 1fr` → `md: [2fr 1fr]` as `@media md`). Main column spans 2; sidebar is sticky at `top: 6rem`.
- **Section card pattern:** `.ms-checkout-section` is a reusable block used 4× (address, coupon, order review, summary). The summary sidebar adds a `--sticky` modifier.
- **Available coupons row:** Currently rendered with inline Tailwind (`flex flex-wrap gap-2`, `border-dashed`, etc.). Absorbed into `ms-checkout-coupon__offers-*` BEM elements.
- **Loading state:** The spinner wrapper currently mixes `styles.wrapper` with inline `flex items-center justify-center`. This becomes `ms-checkout--loading` modifier on the wrapper.
- **Downstream impact:** Plan owns the full BEM spec and mapping table. Build owns the file writes.
