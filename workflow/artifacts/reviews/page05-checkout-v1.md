---
slug: page05-checkout
version: 1
artifact: review
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page05-checkout-v1.md
  plan: workflow/artifacts/plans/page05-checkout-v1.md
  task: workflow/artifacts/tasks/page05-checkout-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: ship
  blockers: []
  user_checkpoint: none
  waiver: "Test phase waived — style-only migration (page01–04 series pattern). Functional coupon fix also merged; residual risk documented."
architecture_notes:
  role: Staff Reviewer
  scope_deviation: Two out-of-scope changes landed in Build — import source change and coupon logic refactor. Neither blocks ship; both are net improvements. Documented as residual risk.
  assumption_for_ship: PR must include coupon fix notes in description; reviewer should be aware it is not purely style-only.
---

# Review — Page 05: Checkout (`/checkout`)

## Findings

### P3 — Out-of-scope import source change

**Area:** `apps/web/src/app/checkout/page.tsx` — lines 8-11  
**Manifest ID:** none (not in brief/plan)  
**Problem:** Context hooks changed import source from `@/components/providers` (barrel re-export) to individual `@/contexts/*` files. Not specified in the brief.  
**Risk:** None functional — `providers.tsx` re-exports these hooks for backward compat; TypeScript is clean. This is strictly a style preference.  
**Fix recommendation:** No action required. The direct-context import is the preferred pattern per the codebase (`providers.tsx` notes re-export is for "backward compatibility"). Log as informational.

---

### P2 — Out-of-scope coupon logic refactor (post-build functional fix)

**Area:** `apps/web/src/app/checkout/page.tsx` — lines 78–133  
**Manifest ID:** none (brief explicitly says "Checkout logic untouched — Style-only migration")  
**Problem:** Build merged two separate `useEffect` calls (`fetchProducts` + `fetchAvailableCoupons`) into a single `loadCheckoutData` function. Additionally:
- `applyCoupon` now accepts an optional `codeOverride` parameter
- Chip click calls `applyCoupon(coupon.code)` (auto-apply) instead of `setCouponCode(coupon.code)` (fill-only)
- Coupon fetch uses `freshSubtotal` from the validate-checkout API response instead of `subtotal` from localStorage  

**Risk:** The change is a net improvement — it fixes a real user-reported bug (coupon chips never appeared when localStorage item prices were stale or zero). No regressions identified. TypeScript clean. The auto-apply UX change is a behaviour delta not covered by the brief.  
**Fix recommendation:** No rollback. Document explicitly in the PR description as a functional fix that went beyond style scope. No manual QA was done by the author — mark as residual risk.

---

## Requirement Coverage

| ID | Requirement | Coverage | Notes |
|---|---|---|---|
| R1 | Write `checkout.scss` | **covered** | File exists at `apps/web/src/app/checkout/checkout.scss` (~420 lines, 50+ BEM tokens). |
| R2 | Rewrite `page.tsx` — swap import, replace all `styles.*` | **covered** | `grep styles.` returns zero matches. `checkout.module.css` import removed. |
| R3 | Delete `checkout.module.css` | **covered** | File absent from filesystem; git status shows `deleted`. |
| RI1 | All transitions use `@include m.motion` | **covered** | Verified in SCSS: all `transition:` declarations are inside `@include m.motion { }` blocks. |
| RI2 | No `dark:` Tailwind prefixes | **covered** | `grep dark:` returns zero matches in both `.scss` and `page.tsx`. |
| RI3 | `FallbackImage` keeps `className="object-cover"` | **covered** | `FallbackImage className="object-cover"` preserved in order-review item. |

All 6 manifest IDs: **covered**.

---

## Architecture Notes

- **SCSS structural note — `.ms-checkout__main`:** The plan spec nested `&__main { ... }` inside `.ms-checkout { }`. The implementation declares it as a flat nested selector using `&__main` which compiles identically. No deviation in output.
- **Grid layout:** Plan spec `grid-template-columns: 2fr 1fr` matches the original `md:grid-cols-3` with `md:col-span-2` main column (same 2:1 ratio).
- **`__offers-label` margin:** Plan placed `margin-top: 0.5rem` on `__offers-list`. Implementation places `margin-bottom: 0.5rem` on `__offers-label`. Net whitespace between label and chips is identical.
- **Coupon chip behaviour delta:** Clicking a chip previously called `setCouponCode(code)` only (requiring a second "Apply" click). It now calls `applyCoupon(code)` which validates and applies in a single step. This is a deliberate UX improvement, not a revert candidate.

---

## Verification Reviewed

| Check | Method | Result |
|---|---|---|
| Zero `styles.*` references | `grep styles. apps/web/src/app/checkout/page.tsx` | 0 matches ✅ |
| Zero `checkout.module.css` references | `grep checkout.module.css` in checkout dir | 0 matches ✅ |
| Zero `dark:` prefixes | `grep dark:` in page.tsx and checkout.scss | 0 matches ✅ |
| TypeScript clean | `npx tsc --noEmit -p apps/web/tsconfig.json` | No errors ✅ |
| `checkout.module.css` absent | `git status apps/web/src/app/checkout/` | Listed as `deleted` ✅ |
| Coupon API returns data | `curl localhost:4000/api/v1/coupons/available?orderValue=1000` | WELCOME100 returned ✅ |
| Manual render QA | Not done — auth required for checkout page | ⚠️ Not run |

---

## Residual Risk

| Risk | Severity | Owner | Follow-up |
|---|---|---|---|
| No manual render QA — checkout requires auth + cart items; automated Playwright couldn't authenticate | Medium | User | Manually navigate to `/checkout` with ≥1 item and subtotal ≥ ₹500; confirm coupon chip appears and auto-applies |
| Coupon logic change untested at edge cases (exact threshold, expired coupon, already-applied coupon) | Low | User | Spot-check: apply WELCOME100, remove it, try invalid code — all should show correct toasts |
| Import source change (`providers` → direct context) unreviewed for other pages in the series | Low | None | Only affects `checkout/page.tsx`; `providers.tsx` re-export contract unchanged |

---

## Recommendation

**pass-with-risk**

Core BEM migration is complete and fully meets all 6 manifest requirements. Two out-of-scope changes landed in Build: an import source preference change (P3, no risk) and a coupon fetch refactor (P2, net improvement). Neither requires reverting. The remaining risk is the absence of manual QA — the checkout page needs a logged-in session with cart items to render.

**Test phase is waived** under the page01–04 series pattern established by the user. The coupon fix residual risk should be called out in the PR description rather than in a formal test artifact.

Ship may proceed.
