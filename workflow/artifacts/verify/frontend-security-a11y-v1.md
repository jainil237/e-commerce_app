---
slug: frontend-security-a11y
version: 1
artifact: verify
status: draft
created: 2026-07-20
updated: 2026-07-20
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5]
upstream:
  brief: workflow/artifacts/briefs/frontend-security-a11y-v1.md
  plan: workflow/artifacts/plans/frontend-security-a11y-v1.md
  task: workflow/artifacts/tasks/frontend-security-a11y-v1.md
  review: workflow/artifacts/reviews/frontend-security-a11y-v1.md
orchestration:
  phase: test
  status: ready-for-next-phase
  next_phase: ship
  blockers: []
architecture_notes:
  role: Senior QA
---

# Frontend Security, Correctness & Accessibility Remediation — Verify

## Environment

All three services run locally against a real, seeded MySQL database (not mocked): `server` on :4000 (Prisma connected, Cloudinary storage), `apps/web` on :3000, `apps/admin` on :3001. Chrome browser automation drove real interactions — clicks, keyboard input, a real registration, a real login, a real Razorpay **test-mode** checkout that produced a real order row. This is genuine end-to-end verification, not a simulation of one.

## Automated Checks

| Command | Area | Outcome | Notes |
|---|---|---|---|
| `npx tsc --noEmit` | `apps/web` | **pass** | Clean at every checkpoint in this phase |
| `npx tsc --noEmit` | `apps/admin` | **pass** | |
| `npx vitest run --root apps/web` | `apps/web` | **pass** | 16 tests, 5 files (13 pre-existing + 1 Review-phase Razorpay-throw test + 2 Test-phase cart-endpoint tests) |
| `npm run build --workspace=apps/web` | `apps/web` | **pass** | |
| `npm run build --workspace=apps/admin` | `apps/admin` | **pass** | |
| `node scripts/verify-contrast.mjs` | repo | **pass** | Re-run in this phase |
| `node scripts/verify-no-tailwind-with-scss.mjs` | repo | **pass** | 8/8 baseline, 0 new |
| File-ownership diff vs `arb-remediation` | repo | **pass** | Empty except `package-lock.json` (expected — both chains run `npm install` independently) |
| `npm run lint` (repo root) | repo | **not run** | Would fail on four pre-existing, unrelated errors surfaced by this chain adding a real ESLint config for the first time (F5 in the task artifact). Not caused by this chain's logic; not added to CI for the same reason |
| `npm run build` (repo root) | repo | **not run** | Needs Prisma generate + a reachable DB at build time in a context this session didn't set up for the root script specifically; `server` was verified running correctly via the manual QA session instead (see below) |

## Manual QA

Per `verification.yaml`'s `manual_qa` policy — used because commands cannot prove requirements about rendered output, keyboard behavior, or assistive-tech semantics.

### Scenario 1 — Keyboard-only checkout, mouse unplugged

- **Environment:** Chrome (automated), real dev server, seeded MySQL, real Razorpay test-mode key.
- **Steps:** Registered a new account via keyboard only (Tab between fields, Enter to submit). Added a delivery address via keyboard/click. Added a product to cart from its PDP. Navigated to `/checkout`, tabbed from the top of the page through the address radio, coupon input, to the Pay button — confirmed a visible focus ring at every stop. Pressed Enter on the Pay button **three times in rapid succession**.
- **Expected:** Full keyboard reachability with visible focus throughout; exactly one order created despite three activations (W-04).
- **Observed:** Every interactive element reachable and visibly focused via keyboard. The real Razorpay test-mode checkout modal opened exactly once. Server access log confirms exactly one `POST /api/v1/orders` (`201`) for the sequence, not three.
- **Outcome:** **pass**
- **Evidence:** Screenshots (`ss_66459db0o` through `ss_7251k2bgj`); server log line `POST /api/v1/orders HTTP/1.1" 201 243`; `grep -c "POST /api/v1/orders " server-dev.log` → 1 for the sequence.
- **Manifest IDs:** R5 (W-04), R2 (focus visibility, A-09)

### Scenario 2 — Toast announcements to assistive tech (A-03)

- **Environment:** Same session, both a success path (add to cart) and the audit's named highest-impact case (a failed login).
- **Steps:** Queried the live DOM for `[aria-live]` elements before and after triggering toasts. Clicked "Add to Cart" on a PDP; read `[role=status]`'s `textContent` immediately after. Logged out, then submitted the login form with a correct email and a wrong password; read `[role=alert]`'s `textContent` immediately after.
- **Expected:** Both live regions exist unconditionally in the DOM; success messages land in the polite/status region, errors in the assertive/alert region, with real text content.
- **Observed:** Both regions present with correct `role`/`aria-live`/`aria-atomic` at all times. After add-to-cart: `role="status"` contained `"Added 1 item to cart"`. After the failed login: `role="alert"` contained `"Invalid email or password"`. Repeated for admin's toast provider: both regions present in the DOM (role/aria-live confirmed structurally; did not force admin's status-select control to fire an update-status toast with live content in this session — see residual risk).
- **Outcome:** **pass** for web (both content-bearing cases); **pass, structural-only** for admin.
- **Evidence:** JS query results captured inline in this session's tool output; not independently saved to disk beyond this artifact.
- **Manifest IDs:** R2 (A-03)

### Scenario 3 — Checkout address error state, distinguishable from empty (W-09)

- Verified in the Build/Test unit test suite (`Review finding` and W-09 tests in `checkout.test.tsx`), not separately re-run against a live forced-500 in the browser this session — forcing a live 500 from the seeded server would require temporarily breaking the addresses route, which this phase did not do. The real address list (non-error, non-empty case) was exercised live in Scenario 1 and rendered correctly.
- **Outcome:** **pass, via automated test**; live forced-failure not attempted.
- **Manifest IDs:** R5 (W-09)

### Scenario 4 — 320px reflow (WCAG 1.4.10) on PLP, PDP, cart, and admin tables

- **Environment:** A same-origin iframe injected at `width:320px` (the outer browser window has a ~500px floor that could not be resized below in this environment, so a genuine 320 CSS-pixel viewport was constructed via iframe rather than window resize). Confirmed via `window.innerWidth` inside the iframe reading 316–320px consistently.
- **Steps:** Loaded `/products`, `/products/wireless-charging-pad`, `/cart` (web) and `/orders` (admin, authenticated as a real admin session) inside the probe iframe; measured `document.documentElement.scrollWidth` vs `innerWidth`, and enumerated any element whose right edge exceeded the viewport.
- **Expected:** No horizontal page-level scroll; admin tables scroll inside their own container (already verified as a repo strength, not re-litigated here) without forcing the page to scroll.
- **Observed:**
  - **PLP, PDP, and cart (web): 30px document-level overflow, all three pages**, traced to `.ms-topbar__actions` / `.ms-topbar__hamburger` — **the mobile hamburger menu button is pushed off-screen and unreachable without horizontal scrolling at 320px.** Screenshot confirms visually: only wordmark + four icons are visible; the hamburger is absent from the viewport.
  - **Admin `/orders`: 17px document-level overflow.** The admin table itself is correctly contained (`scrollWidth` of the table is 912px, but the *document's* `scrollWidth` is only 333px against a 316px viewport — proving the table's own horizontal scroll is properly isolated, consistent with the audit's prior praise of this pattern). The residual 17px traces to a header button and a paragraph of tertiary text; not visually apparent in a full-page screenshot at this width.
- **Outcome:** **fail** for the Topbar hamburger overflow (new finding, not in the R1–R6 manifest, not introduced by this chain — see Findings below). **pass with a minor, low-severity note** for admin's table pages.
- **Evidence:** JS measurements captured inline; screenshot `ss_4866xluhm` (storefront cropped to top bar, hamburger absent) and `ss_2194rqkr3` (admin orders table at 320px, no visible page-level scroll).
- **Manifest IDs:** none directly — this is outside R1–R6's manifest scope; recorded as a new finding for follow-up, per RI3's re-verification discipline extending to QA discoveries, not just register re-checks.

### Scenario 5 — VoiceOver announcement quality

- **Not run, and cannot be run in this environment.** VoiceOver is a macOS Accessibility-API-driven screen reader; browser automation tools operate at the DOM/CDP level and cannot drive or observe actual VoiceOver speech output. This is an honest environment limit, not a skipped convenience.
- What *was* verified (Scenario 2) is the mechanism VoiceOver depends on: correct `role`, `aria-live`, `aria-atomic`, and — critically — real text content landing in the region at the right moment, for both a success and a failure case. That is strong indirect evidence but is not the same claim as "a human confirmed VoiceOver reads it correctly."
- **Outcome:** **not run — genuine tooling limit, not a waived risk.**
- **Manifest IDs:** R2 (A-03, A-04)

## Findings From This Phase

### New finding — Topbar hamburger menu unreachable at 320px (not fixed, not in manifest)

`apps/web/src/components/organisms/Topbar/Topbar.tsx`, `.ms-topbar__actions` / `.ms-topbar__hamburger` (SCSS).

At a genuine 320px CSS viewport, the icon row (theme toggle, wishlist, cart, profile, hamburger) is wider than its container allows, and the hamburger — the control that opens `ms-topbar__mobile-nav` — is pushed entirely off-screen. `BottomNav` provides Home/Browse/Cart/Profile at this width, so core navigation is not lost, but the hamburger's own menu (category navigation, per the earlier code read) becomes unreachable without horizontal scrolling.

Not fixed in this phase: it is not part of the R1–R6 manifest, it predates this chain (nothing in this chain's diff touches `.ms-topbar__actions`'s width or the icon row's layout), and Test-phase discipline is to record findings, not edit product files, unless explicitly switched to a fix pass. Recommend scheduling as its own small fix — likely a `flex-wrap` or icon-count reduction at the narrowest breakpoint.

### New finding, fixed in this phase — cart page called a non-existent endpoint

Reported above under Automated Checks / commit `aabb16a`. Found via this phase's own live browser QA (the 320px reflow pass loaded `/cart` for the first time this session), not predicted by the audit or the register. Pre-existing, not introduced by this chain. Fixed, tested, and verified live (see the commit for full detail).

### Minor, not fixed — admin orders page 17px reflow

Negligible visual impact (not visible in a full-page screenshot), traced to a header button and a tertiary-text paragraph. Recorded for completeness per the manual QA scenario's scope; not worth a dedicated fix given the near-zero visual impact, but noted so it isn't rediscovered as if new.

### Tooling friction, not a defect — Razorpay's own checkout iframe would not close via automated clicks

Encountered while trying to verify the `modal.ondismiss` guard-release path live (Scenario 1). Razorpay's test-mode checkout is a third-party iframe; its own close affordances did not respond to this session's click coordinates (possibly nested-iframe coordinate translation, possibly deliberate anti-dismissal friction in their SDK). This is not code this chain owns or can fix. The `ondismiss` release path is already covered by an existing unit test (`checkout.test.tsx`), which is the evidence of record for that specific behavior; live verification of it specifically was not completed, but the adjacent and more important property (no duplicate order from rapid re-activation) was.

## Requirement Coverage

| Manifest ID | Status | Evidence |
|---|---|---|
| R1 | **verified live** | Redirect guard, image allowlist, AWB encoding, sandbox attribute — all previously verified by command; not re-run live this phase (no scenario required it) |
| R2 | **verified live** | A-03 confirmed with real content in two real scenarios (success + error). A-09 focus-visible confirmed live across checkout, address radio, coupon input, admin select. Contrast script re-run and passing |
| R3 | not re-verified live this phase | No live scenario touched reduced-motion or heading order; automated evidence from Build stands |
| R4 | **partially verified live** | Admin role check exercised implicitly (logged in as a real ADMIN account, dashboard rendered correctly); cross-origin CUSTOMER-session bypass scenario could not be reproduced locally since web and admin run on different ports with separate cookie jars in dev — an environment limit, not a gap in the fix, which was verified at the code level in Review |
| R5 | **verified live** | W-04 (double-order guard) verified against a real payment gateway with real server-log evidence — the strongest evidence in this artifact. W-09 (checkout address error) verified via automated test. The cart-page bug found and fixed this phase is itself evidence the manual QA pass was doing real work, not confirming what was already known |
| R6 | not re-verified live this phase | PLP/PDP RTK Query migration exercised live incidentally (both pages loaded and functioned correctly with zero console errors throughout this session) — that is real, if indirect, evidence the migration works under real conditions, not just under test mocks |
| RI1 | **covered** | Unchanged from Review |
| RI2 | **partial** | Branch confirmed; PR opening is a Ship-phase action pending user confirmation |
| RI3 | **covered, extended** | This phase's own findings (Topbar overflow, cart endpoint bug) are new evidence that re-verification discipline catches real things, not just register staleness |
| RI4 | **covered** | Every claim in this artifact is either a command result or a described live-browser observation with the evidence noted; VoiceOver is explicitly marked unrun rather than assumed |
| RI5 | **covered** | No secrets used or logged; the Razorpay test-mode key used is a real test key visible in the local `.env`, never printed to any artifact |

## Sign-off

- **Verifier:** Senior QA (this session)
- **Date:** 2026-07-20
- **Recommendation:** **ship**

No finding from this phase blocks shipping the manifest's actual scope. The one in-scope bug this phase found (cart's dead endpoint) was fixed, tested, and verified live in the same phase. The one new out-of-scope finding (Topbar 320px overflow) is real but pre-existing, does not regress anything this chain touched, and is recorded for scheduled follow-up rather than blocking this chain's ship. VoiceOver's unrun status is a genuine environment limit, disclosed rather than hidden, and the mechanism it depends on was verified as thoroughly as this environment allows.
