---
slug: page01-homepage
version: 1
status: ready-for-next-phase
created: 2026-06-22
brief: .workflow/artifacts/briefs/page01-homepage-v1.md
branch: feat/homepage-redesign
---

# Plan — Page 01: Homepage (`/`) — Atom Migration

## Objective

Migrate `Button` and `Badge` atoms from Tailwind CSS Modules to co-located SCSS BEM. Add shared `input.scss` and wire the Topbar search to `ms-field`/`ms-input`. No layout changes — homepage structure is already complete from Phase 1.

---

## Phase 1 — Button atom

### 1a. Write `button.scss`
Location: `src/components/atoms/Button/button.scss`
Uses: `@use '../../../styles/mixins' as m` and `@use '../../../styles/variables' as v`

```
.ms-btn
  base: inline-flex, items-center, justify-center, gap 0.5rem
        font-size 0.875rem, font-weight 600
        border-radius var(--radius-lg)   ← was rounded-xl = 12px
        border: 1px solid transparent
        cursor: pointer
        transition: all v.$duration-base ease  (inside m.motion)
        active: transform scale(0.98)          (inside m.motion)
        disabled: opacity 0.5, pointer-events none
        focus-visible: @include m.focus-ring

  __spinner
        animation: spin 0.8s linear infinite   (inside m.motion)
        width: 1rem, height: 1rem

  ── Sizes ──
  --sm    height 2.25rem  padding 0 1rem       font-size 0.875rem
  --md    height 2.75rem  padding 0 1.5rem     font-size 0.875rem
  --lg    height 3.5rem   padding 0 2rem       font-size 1rem

  ── Variants ──
  --primary        bg var(--text-primary)    color var(--surface-0)   hover: brightness(1.1)
  --primary-brand  bg var(--brand-primary)   color #fff               hover: opacity 0.9
                   box-shadow: var(--shadow-sm)
  --secondary      bg var(--surface-0)       color var(--text-primary) border: 1px solid var(--border-base)
                   hover: bg var(--surface-2)  box-shadow: var(--shadow-sm)
  --outline        bg transparent            color var(--text-secondary) border: 1px solid var(--border-base)
                   hover: bg var(--surface-2), color var(--text-primary)
  --ghost          bg transparent            color var(--text-secondary) border: none
                   hover: bg var(--surface-2), color var(--text-primary)
  --danger         bg #EF4444               color #fff
                   hover: bg #DC2626

  ── Layout modifiers ──
  --full     width: 100%
  --icon     width = height (square), padding 0, border-radius var(--radius-full)
             sizes: --sm 2.25rem · --md 2.75rem · --lg 3.5rem
```

### 1b. Rewrite `Button.tsx`
- Remove `import styles from './Button.module.css'`
- Add `import './button.scss'`
- Build class string from `ms-btn ms-btn--{variant} ms-btn--{size}` + optional `ms-btn--full`, `ms-btn--icon`
- `__spinner` → `className="ms-btn__spinner"`
- Preserve all props: `variant`, `size`, `isLoading`, `leftIcon`, `rightIcon`, `disabled`, `className` (consumer can still append extra classes)
- No `full` or `icon` props exist today — add them to `ButtonProps` interface

### 1c. Delete `Button.module.css`

---

## Phase 2 — Badge atom

### 2a. Write `badge.scss`
Location: `src/components/atoms/Badge/badge.scss`

```
.ms-badge
  base: inline-flex, align-items center
        border-radius var(--radius-full)
        font-weight 600, letter-spacing 0.03em
        white-space: nowrap

  ── Sizes ──
  --sm   padding 0 0.5rem        font-size 0.625rem   height auto
  --md   padding 0.125rem 0.625rem  font-size 0.75rem

  ── Variants ──
  --primary    bg var(--brand-primary)  color #fff
  --secondary  bg var(--surface-2)  color var(--text-secondary)  border 1px solid var(--border-subtle)
  --outline    bg transparent  color var(--text-primary)  border 1px solid var(--border-base)
  --neutral    bg var(--surface-2)  color var(--text-tertiary)
  --success    bg var(--surface-2)  color var(--success)   border 1px solid rgba(success, 0.2)
  --warning    bg var(--surface-2)  color var(--warning)   border 1px solid rgba(warning, 0.2)
  --error      bg var(--surface-2)  color var(--error)     border 1px solid rgba(error,   0.2)
  --info       bg var(--surface-2)  color var(--info)      border 1px solid rgba(info,    0.2)
```

### 2b. Rewrite `Badge.tsx`
- Remove CSS Module import; add `import './badge.scss'`
- Emit `ms-badge ms-badge--{variant} ms-badge--{size}`
- Props API unchanged

### 2c. Delete `Badge.module.css`

---

## Phase 3 — Shared input SCSS

### 3a. Write `src/styles/input.scss`

```
.ms-field
  position relative
  display flex
  flex-direction column
  gap 0.375rem

  &__label
    font-size 0.875rem, font-weight 500, color var(--text-primary)

  &__icon--left, &__icon--right
    position absolute  top 50%  transform translateY(-50%)
    color var(--text-tertiary)  pointer-events none
    left/right: 0.875rem

  &__help
    font-size 0.75rem  color var(--text-secondary)

  &__help--error
    color var(--error)

.ms-input
  width 100%
  height 2.75rem
  border 1px solid var(--border-base)
  border-radius var(--radius-lg)
  background var(--surface-0)
  color var(--text-primary)
  font-size 0.875rem
  padding 0 0.875rem
  outline none
  transition border-color v.$duration-fast ease  (inside m.motion)

  &::placeholder   color var(--text-tertiary)
  &:hover          border-color var(--border-base) (brightened)
  &:focus          border-color var(--brand-primary)  box-shadow var(--ring-brand)
  &--error         border-color var(--error)
                   &:focus → ring in error color
  &--has-left      padding-left 2.75rem
  &--has-right     padding-right 2.75rem
```

---

## Phase 4 — Topbar search wiring

### 4a. Update `Topbar.tsx`
Desktop search (`ms-topbar__search`):
```jsx
<div className="ms-field">
  <span className="ms-field__icon--left"><Search width={16} height={16} /></span>
  <input className="ms-input ms-input--has-left" ... />
</div>
```
Mobile search (`ms-topbar__mobile-search`): same pattern.

Remove inline `style` on icon if any.

### 4b. Update `topbar.scss`
- Remove ad-hoc input styles from `&__search` (border, bg, padding) — now handled by `ms-input`
- Keep `&__search` as positional wrapper only (flex, max-width, position relative)
- Add `@use '../../styles/input'` at top (no namespace needed — just importing for side effects isn't supported in Sass `@use`; instead, `input.scss` is imported via the component's own import chain. The `ms-input` class will be available globally since `Button.tsx`/`Badge.tsx`/`Topbar.tsx` each import their own SCSS which Next.js bundles together.)

> **Note**: `input.scss` doesn't need to be `@use`'d in `topbar.scss`. Topbar.tsx will `import '../../../styles/input.scss'` directly (same pattern as other components).

### 4c. Add import to `Topbar.tsx`
```ts
import '@/styles/input.scss'
```

---

## Phase 5 — Topbar action buttons cleanup

After Phase 1, swap `ms-topbar__action-btn` usages in `Topbar.tsx` to `ms-btn ms-btn--ghost ms-btn--icon ms-btn--sm`. Remove `&__action-btn` rules from `topbar.scss`.

---

## File Change Summary

| File | Action |
|------|--------|
| `src/components/atoms/Button/button.scss` | Create |
| `src/components/atoms/Button/Button.tsx` | Rewrite (drop module, emit ms-btn) |
| `src/components/atoms/Button/Button.module.css` | Delete |
| `src/components/atoms/Badge/badge.scss` | Create |
| `src/components/atoms/Badge/Badge.tsx` | Rewrite (drop module, emit ms-badge) |
| `src/components/atoms/Badge/Badge.module.css` | Delete |
| `src/styles/input.scss` | Create |
| `src/components/organisms/Topbar/Topbar.tsx` | Add input.scss import; wrap search in ms-field/ms-input; swap action-btn → ms-btn |
| `src/components/organisms/Topbar/topbar.scss` | Remove __action-btn block; remove ad-hoc input styles from __search |

---

## Verification Checklist (for Build phase)

- [ ] `Button` renders `ms-btn ms-btn--primary-brand` in DOM — no `styles.button` hash class
- [ ] `Badge` renders `ms-badge ms-badge--success ms-badge--sm` in ProductCard
- [ ] Topbar search input has `ms-input ms-input--has-left` class
- [ ] No `@apply` remaining in Button or Badge files
- [ ] `Button.module.css` and `Badge.module.css` deleted
- [ ] TypeScript: `npx tsc --noEmit` passes clean
- [ ] `full` and `icon` props available on `Button` without breaking existing callers (they default to false/undefined, so backward compatible)
