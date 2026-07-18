---
slug: page08-account-cluster
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page08-account-cluster-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Plan — Page 08: Account Cluster

Six files: 3 co-located SCSS (create) + 3 page rewrites. Token map per brief Architecture Notes.

## Phase 1 — `account/account.scss` + rewrite `account/page.tsx` (R1)

`ms-account` blocks:
- `.ms-account` — `min-height:100vh; background:var(--surface-1); padding-bottom:3rem`
- `&__container` — `max-width:56rem (max-w-4xl); margin:0 auto; padding` responsive
- `.ms-account-hero` — relative, `overflow:hidden; border-radius:var(--radius-2xl); background:var(--surface-0); border subtle; box-shadow sm; margin-bottom:2rem`
  - `&__gradient` — absolute top band `height:8rem; background:linear-gradient(to right, color-mix(brand-primary 20%), color-mix(brand-accent 20%), color-mix(brand-primary 20%))`
  - `&__body`, `&__avatar` (gradient brand-primary→brand-accent circle, white border-4 → `var(--surface-0)`), `&__name`, `&__meta`, `&__meta-item`, `&__sep`, `&__edit` (pill button, `background:var(--surface-2)`, hover darker via color-mix, `@include m.motion`)
- `.ms-account-grid` — `grid; 1col → md:2col; gap; margin-bottom`
- `.ms-account-tile` — relative card; `background:var(--surface-0); border subtle; radius-2xl; shadow-sm; @include m.motion{transition: box-shadow, border-color, transform}`; `&:hover{box-shadow md; border-color:color-mix(brand-primary 30%)}`
  - `&__sheen` — absolute gradient overlay `opacity:0; @include m.motion{transition:opacity}`; `.ms-account-tile:hover &{opacity:1}`
  - `&__icon-wrap` (radius-xl, surface-2, motion scale on hover), `&__icon`, `&__chevron` (translate on hover), `&__title` (hover→brand-primary), `&__desc`
- `.ms-account-logout` — centered; `&__btn` — pill, `color:var(--error)`; hover `background:color-mix(error 8%)`; `@include m.motion`; icon translate on hover.
- Loading: keep `<div className="skeleton ...">` wrapped in `.ms-account__loading` (centered).

## Phase 2 — `orders/orders.scss` + rewrite `orders/page.tsx` (R2)

`ms-orders` blocks:
- `.ms-orders` shell + `&__container` + `&__header`/`&__title`/`&__subtitle`
- `.ms-orders__loading`, `.ms-orders__gate` (centered states; gate keeps `btn btn-primary btn-sm` link — RI3)
- `.ms-orders-empty` — self-contained card (surface-0, border-subtle **dashed**, radius-2xl, padding), `&__icon-wrap`, `&__icon`, `&__title`, `&__text`
- `.ms-orders-list` — `display:grid; gap:1.5rem`
- `.ms-orders-card` — self-contained (surface-0, border-subtle, radius-2xl, shadow-sm, padding); `@include m.motion`; `&:hover{box-shadow md; border-color:color-mix(brand-primary 30%)}`
  - `&__top`, `&__id-row`, `&__icon-wrap`, `&__icon`, `&__number`, `&__date`
  - `&__status` — shape only (`font-size:.75rem; font-weight:700; padding:.25rem .75rem; border-radius:full; text-transform:uppercase; letter-spacing`); colour comes from appended `badge-*` class
  - `&__footer` (border-top), `&__stat`, `&__stat-label`, `&__stat-value`, `&__total`, `&__view` (margin-left:auto; brand-primary; chevron translate on hover via `.ms-orders-card:hover &`)

## Phase 3 — `addresses/addresses.scss` + rewrite `addresses/page.tsx` (R3)

`ms-addresses` blocks:
- `.ms-addresses` shell + `&__container` (max-w-4xl) + `&__loading`
- `&__header`, `&__title`, `&__subtitle`, `&__add-btn` (Button keeps `className` for `hidden sm:inline-flex` → replace with BEM `ms-addresses__add-btn` that does `display:none; @include m.sm{display:inline-flex}`)
- `.ms-addresses-form` — card (surface-0, radius-2xl, shadow-sm, border-subtle, padding); entrance animation:
  ```scss
  @include m.motion {
    animation: ms-addresses-slide-in v.$duration-slow ease;
  }
  @keyframes ms-addresses-slide-in { from {opacity:0; transform:translateY(-1rem);} to {opacity:1; transform:none;} }
  ```
  - `&__head`, `&__head-title`, `&__head-sub`, `&__grid` (1col → md:2col), `&__section` (vertical stack), `&__actions` (footer, border-top, reversed col → row at sm)
- `.ms-addresses-check` — the custom checkbox label (group, border, radius-xl, hover surface-2, `@include m.motion`):
  - `&__box` (5x5, border-2 base, radius-md, `@include m.motion`), `&__input` (`sr-only`; use `&:checked + .ms-addresses-check__box{background:var(--brand-primary); border-color:var(--brand-primary)}` and `&:checked ~ * .ms-addresses-check__tick` or restructure so tick is sibling), `&__tick` (svg, opacity 0 → 1 when checked), `&__label`, `&__hint`
  - NOTE: preserve current DOM order — input, box, svg are siblings inside a relative wrapper. Use `&__input:checked ~ &__box` and `&__input:checked ~ &__tick` sibling selectors.
- Empty state `.ms-addresses-empty` (dashed card) + icon-wrap (brand-primary 5% bg) + title + text.
- `.ms-addresses-grid` (1col → md:2col) + `.ms-addresses-card`:
  - self-contained card; `@include m.motion`; hover shadow
  - `&__badge` (absolute top-right, `rounded-bl` only, brand-primary 10% bg / brand-primary text)
  - `&__head`, `&__icon-wrap` (brand-primary 10% circle), `&__icon`, `&__label`, `&__lines`, `&__loc`, `&__pin` (semibold), `&__actions` (border-top). Edit/Delete keep Button atoms; delete keeps its red `className` → convert to `ms-addresses-card__delete`.

## Impacted Files

| File | Change |
|---|---|
| `apps/web/src/app/account/account.scss` | Create |
| `apps/web/src/app/account/page.tsx` | Rewrite to BEM |
| `apps/web/src/app/account/orders/orders.scss` | Create |
| `apps/web/src/app/account/orders/page.tsx` | Rewrite to BEM |
| `apps/web/src/app/account/addresses/addresses.scss` | Create |
| `apps/web/src/app/account/addresses/page.tsx` | Rewrite to BEM |

## Risks / Notes
- **`account/account.scss` vs `account/auth.scss`:** both live in `account/` — distinct filenames, distinct namespaces (`ms-account` vs `ms-auth`). No collision.
- **Gradients:** use `color-mix(in srgb, var(--brand-primary) 20%, transparent)` to reproduce Tailwind's `/20` alpha. Avatar gradient is solid brand→accent (no alpha).
- **Custom checkbox:** sibling-selector approach replaces Tailwind `peer`. Verify tick visibility toggles on check via production build + (optional) manual.
- **`badge-*` retained:** status pill = `clsx('ms-orders-card__status', statusColors[status] || 'badge-neutral')`. `clsx` already available.
- **`btn` link retained** on orders gate — pure component classes, acceptable.
- **No logic touched:** all fetch/CRUD/router/state unchanged.
- Verification: `npm run build --workspace=apps/web` is the compile-time gate (matches page06/07 Test).
