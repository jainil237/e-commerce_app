---
slug: page02-plp
version: 1
status: ready-for-next-phase
created: 2026-06-22
brief: .workflow/artifacts/briefs/page02-plp-v1.md
branch: feat/homepage-redesign
---

# Plan — Page 02: Product Listing (`/products`)

## Objective

Remove `products.module.css` and migrate `products-client.tsx` (408 lines) to co-located BEM SCSS. Migrate `Select` atom from its Tailwind module to `ms-select-field`/`ms-select`. Mobile filter changes from right-side panel to Notion-spec bottom sheet.

---

## Phase 1 — Select atom (`ms-select-field` + `ms-select`)

`input.scss` already defines `.ms-select-field` and `.ms-select` via `@extend`. The atom just needs rewiring.

### 1a. Add `select.scss` import to `Select.tsx`
`input.scss` lives at `src/styles/input.scss` and is already imported by `Input.tsx`. Since `Select.tsx` renders `.ms-select-field` / `.ms-select` classes defined there, `Select.tsx` should import the same file:
```ts
import '@/styles/input.scss'
```

### 1b. Rewrite `Select.tsx`
- Remove `import styles from './Select.module.css'`
- Add `import '@/styles/input.scss'`
- Wrapper div: `ms-select-field` + optional `className`
- Label: `ms-field__label`
- Select element: `ms-select` + `ms-select--error` if error
- ChevronDown: `ms-select-field__chevron`
- Error span: `ms-field__help ms-field__help--error`
- Helper span: `ms-field__help`
- Props API unchanged

### 1c. Delete `Select.module.css`

---

## Phase 2 — `button.scss` — add `--ghost-danger` modifier

`clearAllBtn` is a ghost-style red button. Rather than inline `style={{ color: 'var(--error)' }}`, add a modifier to the existing `button.scss`:

```scss
// in .ms-btn
&--ghost-danger {
  background: transparent;
  color: var(--error);
  border-color: transparent;
  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.08);
    color: var(--error);
  }
}
```

---

## Phase 3 — Write `src/app/products/plp.scss`

Co-located at `src/app/products/plp.scss`. `@use` paths: `../../styles/mixins` and `../../styles/variables`.

### Full BEM spec:

**Page scaffold**
```
.ms-plp
  min-height: 100vh
  background: var(--surface-1)

  &__container
    max-width: var(--container-max)
    margin: 0 auto
    padding: 2rem 1rem
    @include m.md → padding: 2rem 1.5rem
    @include m.lg → padding: 2rem 2rem

  &__header
    display: flex
    align-items: flex-start
    justify-content: space-between
    margin-bottom: 2rem
    gap: 1rem

  &__title
    font-size: 1.5rem, font-weight: 700, color: var(--text-primary), letter-spacing: -0.01em
    @include m.md → font-size: 1.875rem

  &__subtitle
    font-size: 0.875rem, color: var(--text-secondary), margin-top: 0.25rem, font-weight: 500

  &__chips
    display: flex, flex-wrap: wrap, gap: 0.5rem, margin-bottom: 1.5rem

  &__main
    flex: 1
    min-width: 0
```

**Layout**
```
.ms-plp-layout
  display: flex
  gap: 2rem
  align-items: flex-start
```

**Filter sidebar (desktop)**
```
.ms-filter-sidebar
  display: none
  @include m.md → display: block
  width: 14rem
  flex-shrink: 0
  position: sticky
  top: 5.5rem       ← below topbar (72px) + gap
  align-self: flex-start

  &__card
    background: var(--surface-0)
    border: 1px solid var(--border-subtle)
    border-radius: var(--radius-2xl)
    padding: 1.5rem
    box-shadow: var(--shadow-sm)

  &__heading
    @include m.eyebrow
    margin-bottom: 1rem

  &__section
    margin-bottom: 1.5rem

  &__divider
    border: none
    border-top: 1px solid var(--border-subtle)
    margin: 1.25rem 0

  &__radio-item
    display: block
    padding: 0.5rem 0.75rem
    border-radius: var(--radius-lg)
    font-size: 0.875rem, font-weight: 500
    color: var(--text-secondary)
    text-decoration: none
    @include m.motion { transition: all v.$duration-fast ease }
    &:hover { background: var(--surface-2); color: var(--text-primary) }
    &--active
      color: var(--brand-primary)
      background: color-mix(in srgb, var(--brand-primary) 10%, transparent)
      font-weight: 700

  &__price-row
    display: flex, gap: 0.5rem

  &__stock-toggle
    display: flex, align-items: center, gap: 0.75rem, cursor: pointer, user-select: none

  &__stock-checkbox
    width: 1.125rem, height: 1.125rem
    border-radius: var(--radius-sm)
    border: 2px solid var(--border-base)
    cursor: pointer
    accent-color: var(--brand-primary)

  &__stock-label
    font-size: 0.875rem, font-weight: 500, color: var(--text-primary)
```

**Mobile filter trigger**
```
.ms-filter-trigger
  @include m.md → display: none
  (rendered as ms-btn ms-btn--outline ms-btn--md, no extra class needed — hide via wrapper div)
```
Strategy: wrap the trigger `<Button>` in `<div className="ms-filter-trigger">`. The div is `display: block` on mobile, `display: none` on md+.

**Active filter chip**
```
.ms-chip
  display: inline-flex, align-items: center, gap: 0.375rem
  padding: 0.25rem 0.75rem
  border-radius: var(--radius-full)
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent)
  border: 1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)
  color: var(--brand-primary)
  font-size: 0.8125rem, font-weight: 500
  cursor: pointer
  border: none (reset native button border)
  @include m.motion { transition: background v.$duration-fast ease }
  &:hover { background: color-mix(in srgb, var(--brand-primary) 20%, transparent) }

  &__label
    font-size: 0.75rem, opacity: 0.7

  &__remove
    color: var(--brand-primary), opacity: 0.6, line-height: 1
    display: flex, align-items: center
```

**Sort bar**
```
.ms-sort-bar
  display: flex, align-items: center, justify-content: space-between
  padding: 1rem 0
  border-bottom: 1px solid var(--border-subtle)
  margin-bottom: 1.25rem

  &__count
    font-size: 0.875rem, color: var(--text-secondary)
    strong { color: var(--text-primary); font-weight: 600 }
```

**Product grid**
```
.ms-product-grid
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 1rem
  @include m.md → grid-template-columns: repeat(3, 1fr); gap: 1.25rem
```

**Mobile filter drawer (bottom sheet)**
```
.ms-filter-drawer
  position: fixed
  inset-x: 0, bottom: 0
  z-index: v.$z-modal
  @include m.md → display: none

  &__backdrop
    position: fixed, inset: 0
    background: rgba(0,0,0,0.5)
    backdrop-filter: blur(4px)

  &__panel
    position: fixed
    inset-x: 0, bottom: 0
    background: var(--surface-0)
    border-radius: var(--radius-2xl) var(--radius-2xl) 0 0
    padding: 1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom))
    max-height: 85vh
    overflow-y: auto
    box-shadow: var(--shadow-2xl)
    @include m.motion { transition: transform v.$duration-slow ease }
    transform: translateY(100%)     ← default (closed)
    &--open { transform: translateY(0) }

  &__handle
    width: 2.5rem, height: 0.25rem
    background: var(--border-base)
    border-radius: var(--radius-full)
    margin: 0 auto 1.25rem

  &__header
    display: flex, align-items: center, justify-content: space-between
    margin-bottom: 1.5rem
    padding-bottom: 1rem
    border-bottom: 1px solid var(--border-subtle)

  &__title
    font-size: 1.125rem, font-weight: 700, color: var(--text-primary)

  &__footer
    position: sticky, bottom: 0
    background: var(--surface-0)
    padding-top: 1rem
    margin-top: 1.5rem
    border-top: 1px solid var(--border-subtle)
```

**Skeleton**
```
.ms-plp-skeleton
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 1rem
  @include m.md → grid-template-columns: repeat(3, 1fr); gap: 1.25rem

  &__card
    background: var(--surface-0)
    border: 1px solid var(--border-subtle)
    border-radius: var(--radius-2xl)
    overflow: hidden

  &__image
    aspect-ratio: 4/3
    background: var(--surface-2)
    @include m.motion { animation: ms-plp-pulse 1.5s ease-in-out infinite }

  &__body
    padding: 1rem
    display: flex, flex-direction: column, gap: 0.75rem

  &__line
    height: 0.875rem
    background: var(--surface-2)
    border-radius: var(--radius-sm)
    @include m.motion { animation: ms-plp-pulse 1.5s ease-in-out infinite }
    &--wide { width: 75% }
    &--narrow { width: 50% }
```

```scss
@include m.motion {
  @keyframes ms-plp-pulse {
    0%, 100% { opacity: 1 }
    50%       { opacity: 0.5 }
  }
}
```

**Empty state**
```
.ms-empty-state
  text-align: center
  padding: 5rem 2rem
  background: var(--surface-0)
  border-radius: var(--radius-2xl)
  border: 2px dashed var(--border-subtle)

  &__icon  { width: 4rem; height: 4rem; color: var(--text-tertiary); margin: 0 auto 1rem }
  &__title { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem }
  &__sub   { font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem }
```

**Pagination**
```
.ms-pagination
  display: flex, align-items: center, justify-content: center
  gap: 0.75rem
  margin-top: 2.5rem

  &__indicator
    font-size: 0.875rem, font-weight: 500, color: var(--text-secondary)
    padding: 0 0.5rem
```

---

## Phase 4 — Rewrite `products-client.tsx`

Full class substitution — no logic changes:

```
styles.wrapper             → "ms-plp"
styles.container           → "ms-plp__container"
styles.header              → "ms-plp__header"
styles.title               → "ms-plp__title"
styles.subtitle            → "ms-plp__subtitle"
styles.filterChips         → "ms-plp__chips"
styles.filterChip          → "ms-chip" (button element, remove border prop)
styles.filterChipLabel     → "ms-chip__label"
X icon in chip             → wrap in <span className="ms-chip__remove">
styles.clearAllBtn         → "ms-btn ms-btn--ghost-danger ms-btn--sm"
styles.mainLayout          → "ms-plp-layout"
styles.sidebar             → "ms-filter-sidebar"
styles.filterCard          → "ms-filter-sidebar__card"
styles.filterSectionTitle  → "ms-filter-sidebar__heading"
styles.categoryList        → "ms-filter-sidebar__section"
styles.categoryLink        → "ms-filter-sidebar__radio-item"
  + Active: append " ms-filter-sidebar__radio-item--active"
styles.divider             → "ms-filter-sidebar__divider" (render as <hr>)
styles.priceRangeGroup     → "ms-filter-sidebar__price-row"
styles.stockToggle         → "ms-filter-sidebar__stock-toggle"
styles.stockCheckbox       → "ms-filter-sidebar__stock-checkbox"
styles.stockLabel          → "ms-filter-sidebar__stock-label"
styles.mobileFilterOverlay → "ms-filter-drawer"
styles.mobileFilterBackdrop→ "ms-filter-drawer__backdrop"
styles.mobileFilterPanel   → "ms-filter-drawer__panel ms-filter-drawer__panel--open"
styles.mobileFilterHeader  → "ms-filter-drawer__header"
styles.mobileFilterTitle   → "ms-filter-drawer__title"
  + add <div className="ms-filter-drawer__handle" /> at top of panel
styles.productsColumn      → "ms-plp__main"
styles.layoutGrid          → "ms-product-grid"
  + isValidating ? add class "ms-product-grid--loading" (opacity: 0.7 transition)
skeleton divs              → "ms-plp-skeleton" wrapper + "ms-plp-skeleton__card" etc.
styles.emptyState          → "ms-empty-state"
styles.emptyText           → "ms-empty-state__sub"
styles.pagination          → "ms-pagination"
styles.pageIndicator       → "ms-pagination__indicator"
```

**Inline Tailwind replacements:**
```
"md:hidden" on filter button wrapper  → <div className="ms-filter-trigger">
Filter icon className                  → remove (icon inherits parent color)
X icon in chip className               → remove (wrapped in ms-chip__remove span)
close drawer button className          → "ms-btn ms-btn--ghost ms-btn--icon ms-btn--sm"
X icon in drawer header className      → remove
"space-y-1 mb-8" drawer category div  → "ms-filter-sidebar__section"
"mt-8" price section div               → "ms-filter-sidebar__section"
"mt-6" stock toggle div                → "ms-filter-sidebar__section"
```

**Mobile drawer**: switch from `{showFilters && <div>...</div>}` conditional render to always-rendered with `--open` modifier (enables CSS transition):
```tsx
<div className={`ms-filter-drawer__panel${showFilters ? ' ms-filter-drawer__panel--open' : ''}`}>
```
Backdrop stays conditionally rendered (no transition needed).

**Import changes:**
```ts
// Remove:
import styles from './products.module.css'
// Add:
import './plp.scss'
```

---

## Phase 5 — Delete CSS artifacts

```
src/app/products/products.module.css        → delete
src/components/atoms/Select/Select.module.css → delete
```

---

## File Change Summary

| File | Action |
|------|--------|
| `src/components/atoms/Select/Select.tsx` | Rewrite — emit ms-select-field/ms-select |
| `src/components/atoms/Select/Select.module.css` | Delete |
| `src/components/atoms/Button/button.scss` | Add `--ghost-danger` modifier |
| `src/app/products/plp.scss` | Create — full BEM spec |
| `src/app/products/products-client.tsx` | Rewrite classes — no logic changes |
| `src/app/products/products.module.css` | Delete |

---

## Verification Checklist (for Build phase)

- [ ] `Select` renders `ms-select-field` wrapper + `ms-select` element in DOM
- [ ] `Select.module.css` deleted — no `@apply` in Select atom
- [ ] `ms-btn--ghost-danger` exists in `button.scss` and renders red ghost style
- [ ] `products-client.tsx` has zero `styles.` references
- [ ] `products-client.tsx` has zero inline Tailwind utility strings
- [ ] `products.module.css` deleted
- [ ] Mobile drawer uses bottom sheet (`translateY`) not right-panel
- [ ] Skeleton uses `ms-plp-skeleton` classes with pulse animation
- [ ] Empty state uses `ms-empty-state` classes
- [ ] TypeScript: `npx tsc --noEmit` passes clean
- [ ] Next.js build: clean
