---
slug: page01-homepage
version: 1
status: draft
created: 2026-06-22
---

# Think Brief — Page 01: Homepage (`/`)

## Summary

The homepage structure and layout are implemented (Phase 1). However three shared primitive components — **Button**, **Badge**, and the search **Input** — still render Tailwind via CSS Modules (`@apply`). The Notion spec requires these to emit `ms-btn`, `ms-badge`, and `ms-field`/`ms-input` BEM classes. Until these atoms are migrated, the homepage (hero CTA, ProductCard discount badge, Topbar search) cannot be fully BEM-clean.

This brief scopes the remaining work to complete Page 01 to spec.

---

## Requirements

### R1 — Button atom → `.ms-btn`
`Button.tsx` uses `Button.module.css` with `@apply` Tailwind directives. Must be replaced with plain `.ms-btn` BEM SCSS co-located at `src/components/atoms/Button/button.scss`.

BEM modifiers needed for homepage:
- `ms-btn--primary-brand` (Add to Cart, hero CTA secondary)
- `ms-btn--secondary` (hero "Shop Collection")
- `ms-btn--ghost` (topbar icon buttons)
- `ms-btn--icon` (icon-only circle)
- `ms-btn--sm` / `ms-btn--md` / `ms-btn--lg`
- `ms-btn--full` (full-width)
- `__spinner` element (isLoading state)

### R2 — Badge atom → `.ms-badge`
`Badge.tsx` uses `Badge.module.css` with `@apply`. Must be replaced with `.ms-badge` BEM SCSS at `src/components/atoms/Badge/badge.scss`.

Modifiers needed for homepage/ProductCard:
- `ms-badge--success`, `ms-badge--warning`, `ms-badge--error`, `ms-badge--info`
- `ms-badge--primary`, `ms-badge--secondary`, `ms-badge--outline`, `ms-badge--neutral`
- `ms-badge--sm`, `ms-badge--md`

### R3 — Search input in Topbar → `.ms-field` + `.ms-input`
The search `<input>` in `Topbar.tsx` (desktop + mobile) currently has no BEM class — it renders as a bare `<input placeholder="Search products…">`. Notion spec requires `.ms-field` wrapper + `.ms-input.ms-input--has-left` (for the search icon). A shared `input.scss` co-located at `src/styles/input.scss` (shared, used by Topbar + future checkout/auth forms).

### R4 — `ms-btn--full` on hero CTA
`page.tsx` hero uses `<Button size="lg" variant="secondary" rightIcon={...}>Shop Collection</Button>`. Once Button is migrated (R1), this will automatically emit correct classes. No JSX change needed.

### R5 — Topbar action buttons → `.ms-btn--ghost.ms-btn--icon`
Currently `ms-topbar__action-btn` is a standalone BEM element styled in `topbar.scss`. After R1, these should use `ms-btn ms-btn--ghost ms-btn--icon ms-btn--sm` and drop the custom `__action-btn` element rules from `topbar.scss` to avoid duplication.

---

## Impacted Files

| File | Change |
|------|--------|
| `src/components/atoms/Button/Button.tsx` | Remove CSS Module import; emit `ms-btn` class string |
| `src/components/atoms/Button/button.scss` | New — full BEM spec |
| `src/components/atoms/Button/Button.module.css` | Delete |
| `src/components/atoms/Badge/Badge.tsx` | Remove CSS Module import; emit `ms-badge` class string |
| `src/components/atoms/Badge/badge.scss` | New — full BEM spec |
| `src/components/atoms/Badge/Badge.module.css` | Delete |
| `src/styles/input.scss` | New — `.ms-field`, `.ms-input`, `.ms-select-field`, `.ms-select` |
| `src/components/organisms/Topbar/Topbar.tsx` | Add `ms-field`/`ms-input` to search inputs; swap `__action-btn` → `ms-btn` |
| `src/components/organisms/Topbar/topbar.scss` | Remove `__action-btn` rules (replaced by `ms-btn`) |

---

## Out of Scope

- No other pages touched in this task (PLP, PDP, Cart, etc.)
- `input.scss` is written as a shared file (`src/styles/`) because it will be reused by checkout, auth, and account forms — but only the Topbar search is wired up here
- Admin app atoms — deferred to Admin page brief

---

## Risks / Notes

- `Button` and `Badge` are used across many pages — the class-name change is purely additive (same props API, different output classes). No prop changes.
- `Button.module.css` uses `@apply` — confirmed Tailwind is still active in the project via `globals.css`. After deletion, Tailwind applies zero styles; all visual output comes from the new SCSS.
- `Topbar.tsx` search currently has no visible input border/styling beyond the outer `__search` container rules in `topbar.scss`. Adding `ms-field`/`ms-input` classes will apply the shared input spec.
