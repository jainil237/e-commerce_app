---
slug: page06-wishlist
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page06-wishlist-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Plan — Page 06: Wishlist (`/wishlist`)

## Objective

Migrate `apps/web/src/app/wishlist/page.tsx` (233 lines, zero CSS modules) from 100% inline Tailwind utility strings to a co-located BEM SCSS file (`wishlist.scss`). No file deletions — this page never had a CSS module.

---

## Phase 1 — Write `src/app/wishlist/wishlist.scss`

`@use` paths: `../../styles/mixins` and `../../styles/variables`.

### Full BEM spec

```scss
@use '../../styles/mixins' as m;
@use '../../styles/variables' as v;

// ─── Page shell ────────────────────────────────────────────
.ms-wishlist {
  min-height: 100vh;
  background: var(--surface-1);

  &__container {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: 2rem 1rem;
    @include m.md { padding: 2rem 1.5rem; }
    @include m.lg { padding: 2rem 2rem; }
  }

  // Shared wrapper for loading and gate (unauthenticated) states
  &__spinner-wrap {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: 4rem 1rem;
    text-align: center;
    @include m.md { padding: 4rem 1.5rem; }
    @include m.lg { padding: 4rem 2rem; }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  &__title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.025em;
    @include m.md { font-size: 1.875rem; }
  }

  &__count {
    color: var(--text-secondary);
    margin-top: 0.25rem;
    font-weight: 500;
  }
}

// ─── Gate card (unauthenticated) ──────────────────────────
.ms-wishlist-gate {
  background: var(--surface-0);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border-subtle);
  padding: 3rem;
  max-width: 28rem;
  margin: 0 auto;
  text-align: center;

  &__icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1rem;
    color: var(--text-tertiary);
  }

  &__title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  &__text {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
  }
}

// ─── Empty state card ─────────────────────────────────────
.ms-wishlist-empty {
  background: var(--surface-0);
  border-radius: var(--radius-2xl);
  border: 1px dashed var(--border-subtle);
  padding: 3rem;
  text-align: center;

  &__icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1rem;
    color: var(--text-tertiary);
  }

  &__title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  &__text {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
  }
}

// ─── Product grid ──────────────────────────────────────────
.ms-wishlist-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  @include m.sm { grid-template-columns: repeat(2, 1fr); }
  @include m.lg { grid-template-columns: repeat(3, 1fr); }
  @include m.xl { grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
}

// ─── Product card ──────────────────────────────────────────
.ms-wishlist-card {
  background: var(--surface-0);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  @include m.motion {
    transition: box-shadow v.$duration-slow ease, transform v.$duration-slow ease;
  }

  &:hover {
    box-shadow: var(--shadow-xl);
    transform: translateY(-4px);
  }

  &__image-wrap {
    position: relative;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: var(--surface-2);

    img {
      @include m.motion { transition: transform 0.7s ease; }
    }
  }

  &:hover &__image-wrap img {
    transform: scale(1.05);
  }

  &__discount {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
  }

  &__oos-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__oos-badge {
    background: rgba(255, 255, 255, 0.9);
    color: #111;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-full);
    font-weight: 600;
    font-size: 0.875rem;
  }

  &__body {
    padding: 1.25rem;
  }

  &__category {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  &__name {
    font-weight: 600;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 0.25rem;
    @include m.motion { transition: color v.$duration-fast ease; }
  }

  &:hover &__name {
    color: var(--brand-primary);
  }

  &__price-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  &__price {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  &__mrp {
    font-size: 0.875rem;
    text-decoration: line-through;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  &__actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-base);
  }

  &__remove {
    color: var(--error);
    padding-left: 0.75rem;
    padding-right: 0.75rem;
    @include m.motion { transition: background v.$duration-fast ease, color v.$duration-fast ease; }
    &:hover {
      background: color-mix(in srgb, var(--error) 10%, transparent);
    }
  }
}
```

---

## Phase 2 — Rewrite `src/app/wishlist/page.tsx`

**Import add** (no old import to remove):
```ts
import './wishlist.scss'
```

### Inline Tailwind → BEM mapping (28 strings → 2 retained per RI3)

| Location | Current inline Tailwind | BEM class |
|---|---|---|
| Loading outer div | `min-h-screen bg-[var(--surface-1)]` | `ms-wishlist` |
| Loading inner div | `max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center` | `ms-wishlist__spinner-wrap` |
| Gate outer div | `min-h-screen bg-[var(--surface-1)]` | `ms-wishlist` |
| Gate inner div | `max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center` | `ms-wishlist__spinner-wrap` |
| Gate card div | `bg-[var(--surface-0)] rounded-3xl border border-[var(--border-subtle)] p-12 max-w-md mx-auto` | `ms-wishlist-gate` |
| Gate Heart icon | `w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4` | `ms-wishlist-gate__icon` |
| Gate h1 | `text-2xl font-bold mb-2 text-[var(--text-primary)]` | `ms-wishlist-gate__title` |
| Gate p | `text-[var(--text-secondary)] mb-6` | `ms-wishlist-gate__text` |
| Main outer div | `min-h-screen bg-[var(--surface-1)]` | `ms-wishlist` |
| Main inner div | `max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8` | `ms-wishlist__container` |
| Header row div | `flex items-center justify-between mb-8` | `ms-wishlist__header` |
| h1 title | `text-2xl md:text-3xl font-bold text-[var(--text-primary)] tracking-tight` | `ms-wishlist__title` |
| Count p | `text-[var(--text-secondary)] mt-1 font-medium` | `ms-wishlist__count` |
| Empty state div | `bg-[var(--surface-0)] rounded-3xl border border-[var(--border-subtle)] border-dashed p-12 text-center` | `ms-wishlist-empty` |
| Empty Heart icon | `w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4` | `ms-wishlist-empty__icon` |
| Empty h2 | `text-lg font-semibold mb-2 text-[var(--text-primary)]` | `ms-wishlist-empty__title` |
| Empty p | `text-[var(--text-secondary)] mb-6` | `ms-wishlist-empty__text` |
| Grid div | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6` | `ms-wishlist-grid` |
| Card div | `bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group` | `ms-wishlist-card` |
| Image wrap div | `relative aspect-[4/3] overflow-hidden bg-[var(--surface-2)]` | `ms-wishlist-card__image-wrap` |
| FallbackImage: `transition-transform duration-700 group-hover:scale-105` | **remove** — handled by `__image-wrap img` SCSS + card hover | keep `object-cover` (RI3) |
| Discount badge wrapper div | `absolute top-3 left-3` | `ms-wishlist-card__discount` |
| OOS overlay div | `absolute inset-0 bg-black/40 flex items-center justify-center` | `ms-wishlist-card__oos-overlay` |
| OOS badge span | `bg-white/90 text-gray-900 px-4 py-2 rounded-full font-semibold text-sm` | `ms-wishlist-card__oos-badge` |
| Card body div | `p-5` | `ms-wishlist-card__body` |
| Category p | `text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase` | `ms-wishlist-card__category` |
| Name h3 | `font-semibold text-[var(--text-primary)] line-clamp-2 mt-1 group-hover:text-[var(--brand-primary)] transition-colors` | `ms-wishlist-card__name` |
| Price row div | `flex items-center gap-2 mt-3` | `ms-wishlist-card__price-row` |
| Price span | `text-lg font-bold text-[var(--text-primary)] tabular-nums` | `ms-wishlist-card__price` |
| MRP span | `text-sm line-through text-[var(--text-tertiary)] tabular-nums` | `ms-wishlist-card__mrp` |
| Actions div | `flex gap-2 mt-4 pt-3 border-t border-[var(--border-base)]` | `ms-wishlist-card__actions` |
| Move-to-cart Button `className` | `flex-1` | **stays** — structural atom override (RI3) |
| Remove Button `className` | `text-red-500 hover:bg-red-50 dark:hover:bg-red-950 px-3` | `ms-wishlist-card__remove` |

**`group` keyword removal:** The card root `group` class can be removed once all `group-hover:*` descendants are replaced by SCSS descendant selectors (`:hover` on `.ms-wishlist-card`).

---

## Impacted Files

| File | Change |
|---|---|
| `apps/web/src/app/wishlist/wishlist.scss` | **Create** |
| `apps/web/src/app/wishlist/page.tsx` | Add scss import; replace all inline Tailwind strings with BEM classes |

---

## Risks / Notes

- **No CSS module deletion:** Unlike pages 01–05, this page never had a `.module.css`. The only file change is add `wishlist.scss` + rewrite `page.tsx`.
- **Image scale via SCSS descendant:** `group-hover:scale-105` on `FallbackImage` is removed. SCSS uses `.ms-wishlist-card:hover .ms-wishlist-card__image-wrap img { transform: scale(1.05) }`. Next.js `fill` images render with a wrapping `<span>` + `<img>`; the `img` selector still matches as a descendant. Verify visually.
- **`rounded-3xl` → `var(--radius-2xl)`:** Tailwind `rounded-3xl` = 1.5rem; project token `--radius-2xl` = 1.5rem. Pixel-identical.
- **`rounded-2xl` → `var(--radius-xl)`:** Tailwind `rounded-2xl` = 1rem; project token `--radius-xl` = 1rem. Pixel-identical.
- **Heart icon color:** `text-gray-300 dark:text-gray-600` on Heart in both gate and empty states replaced with `color: var(--text-tertiary)`. This is semantically correct — tertiary text colour already adapts to dark mode.
- **Remove button `dark:` elimination:** `dark:hover:bg-red-950` removed; SCSS uses `color-mix(in srgb, var(--error) 10%, transparent)` for the hover tint, which auto-adapts.
- **`container-max` token confirmed:** `--container-max: 80rem` matches Tailwind `max-w-7xl`.
- **`$duration-slow`:** Card lift uses `v.$duration-slow` (0.3s) matching original Tailwind `duration-300`. Image scale uses `0.7s` hardcoded (no token at 700ms).
- **`clsx` not needed:** Wishlist has no conditional BEM class (no selected/active states to toggle). No new import required.
- **`group` class removal:** The `group` Tailwind utility on the card root is removed entirely once SCSS descendant selectors handle all group-hover effects.
