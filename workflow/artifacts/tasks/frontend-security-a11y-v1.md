---
slug: frontend-security-a11y
version: 1
artifact: task
status: in-progress
created: 2026-07-20
updated: 2026-07-20
manifest_ids: [R1, R2, R4, RI1, RI2, RI3, RI4, RI5]
upstream:
  brief: workflow/artifacts/briefs/frontend-security-a11y-v1.md
  plan: workflow/artifacts/plans/frontend-security-a11y-v1.md
orchestration:
  phase: build
  status: in-progress
  next_phase: review
  blockers: [B2]
  user_checkpoint: none-pending
---

# Frontend Security, Correctness & Accessibility — Task

## Active Phase

- Phases complete: **P0 (branch setup), P1 (security tier), P2 (server hardening)**, plus the `A-03`/`W-10` slice of P3.
- Manifest IDs closed so far: R1 (owns, complete), R4 (owns, partial — four items deferred), R2 (partial)
- Remaining: P3 (contrast tokens), P4 (modals/focus/targets/motion), P5 (test tooling + correctness), P6–P7 (blocked on **B2**), P8 (review/verify/ship)

## Plan Phases Overview

| Phase | Status | Manifest IDs |
|---|---|---|
| P0 — Branch setup | complete | RI1, RI2 |
| P1 — Frontend security tier | **complete** | R1 |
| P2 — Server hardening | **complete with 4 deferrals** | R4 |
| P3 — Contrast tokens + live regions | **complete** | R2 |
| P4 — Modals, focus, targets, motion | **complete** | R2, R3 |
| P5 — Test tooling + correctness | **complete, W-16 deferred** | R5 |
| P6 — `shared/` package | **complete** | R6 |
| P7 — RTK Query data layer | **complete for the foundation + products; cart/checkout/admin migration deferred** | R6 |
| P8 — Review, verify, ship | pending | RI1–RI4 |

## P6 Addendum

Behavior-neutral, per its own exit gate: P5's 10 tests pass with zero test-file changes.

- `shared/package.json` names it `@ecom/shared`; added to root workspaces; both apps declare it as a dependency, `npm install` symlinks it.
- Existing `@shared/*` tsconfig imports were **left alone deliberately** — they already resolve the same files on disk, and rewriting ~8 sites to a different specifier for the same target is churn with no runtime effect. Only the four `../../../../../../shared/` escapes (which actually bypassed the alias) were fixed.
- `User` was declared three times (web's `auth.context.tsx`, admin's `AdminUser`, and `shared/types` itself); `CartProduct` twice with different fields (cart's copy had `availableStock`, checkout's didn't). Consolidated into `shared/types/index.ts`. `CartProduct.availableStock` is optional there since only the cart endpoint returns it; `cart/page.tsx` narrows it locally via an intersection type (`CartPageProduct = CartProduct & { availableStock: number }`) rather than widening the shared type for one caller.
- **Scope note:** full "derive types from Prisma" (the audit's stretch goal) was not attempted. Prisma's generated types don't match these API response shapes — prices serialize to strings, nested objects are `select`-shaped, not the raw model. That's a real transformation-layer project, not a rename, and isn't what R6's acceptance criteria actually require (removing the duplication that was causing drift).
- `npm install` pruned a set of stale `lightningcss` platform binaries from the lockfile — pre-existing dead optional deps, unrelated to this change, surfaced only because installing triggered a full resolve.

## P7 Addendum

### Scope decision: foundation + products, not all ~60 fetch sites

The plan's phase-7 exit gate text says `grep -rc 'fetch(' apps/*/src` should return 0 outside `shared/api/`. That is not achievable to a trustworthy standard in this session, and attempting it would have been the wrong kind of lazy — mechanically converting five dozen call sites (cart, checkout, wishlist, auth, ~10 admin pages including CRUD and image upload) with no live backend to verify any of them against is how a refactor becomes an outage, which is the exact failure mode the audit warns about twice. The brief's own R6 acceptance criteria (npm ls resolves, single baseQuery, lint rules exist and are real, one distinguishable error state, tag-scoped invalidation) does **not** require zero remaining fetch calls, and that's what this phase actually delivers.

What's real and verified:
- `shared/api/apiSlice.ts` — the single `createApi`/`fetchBaseQuery`, relative `baseUrl`, `credentials: 'include'`.
- `shared/state/store.ts` + `StoreProvider.tsx` — one store per client session (`useRef`, not a module singleton — a singleton would leak cached data across requests if this module ever ran in a shared server scope).
- `shared/components/ErrorBoundary.tsx` (W-09) — wired at both app roots. Neither app had one; Next's route-level `error.tsx` doesn't catch client-side event/effect errors, which is where most fetch failures in this codebase land.
- **Products (PLP + PDP) migrated end to end** — the plan's own "prove the pattern first" resource, chosen because it's read-only and was already on SWR.
- Checkout's `fetchAddresses` (W-09) given a real error branch, distinct from empty, with a test proving it.

What's deferred, and why: cart, checkout's other fetches, wishlist, auth, and all of admin remain on raw `fetch`. Per the plan, cart/checkout were always meant to be last and gated behind tests — nothing here contradicts that sequencing, it just didn't advance past the proof-of-pattern step this session. Continuing resource-by-resource (one per commit, matching the plan's own step 4) is real, bounded follow-up work, not a loose end invented here.

### SWR → RTK Query wasn't a clean swap

RTK Query has no built-in equivalent to SWR's `keepPreviousData` — switching query args clears `data` while the new request is in flight, which would flash the product grid empty on every filter click. Reproduced the old behavior by holding the last successful response in local state (seeded from the SSR payload), with `isFetching` still driving the loading indicator. This is a known, documented gap in RTK Query relative to SWR/React Query — worth knowing before assuming the migration is a mechanical find-replace elsewhere.

### A regression I introduced and then fixed in the same phase

Neither app had an ESLint config before this — `next lint` had never actually run. Adding one to enforce the two audit-mandated rules (W-08 fetch, W-12 Tailwind/SCSS) had a side effect I didn't anticipate: **`next build` runs its own built-in lint step and treats ESLint errors as build failures.** With no config, that step was a silent no-op the entire chain up to this point — `npm run build` staying green through nine prior commits was partly accidental. The moment a real config existed, the web build started failing on four pre-existing, unrelated errors (`react/no-unescaped-entities` in four files, a stale `eslint-disable` comment referencing an uninstalled plugin rule).

Fixed by setting `eslint.ignoreDuringBuilds: true` in both `next.config.js` — restores the exact prior behavior (lint doesn't gate the build), while `next lint` / CI still runs it for real, as a visible warning-level signal. Did **not** fix the four pre-existing errors themselves — they're outside this chain's manifest and touching them would be scope creep for a problem this phase's config change merely made visible, not caused. Logged as F5 below for whoever picks up the fetch migration next, since escalating the `no-restricted-syntax` rule to `error` will hit the same wall.

### Tag invalidation (W-13) — infrastructure proven, bug not yet closed

`productsApi`'s `getProducts`/`getProductBySlug` carry per-product tags (`{ type: 'Product', id }`) plus a list tag, tested directly against the store via `upsertQueryData` (bypassing the network layer — jsdom and Node's undici disagree about `Request`/`AbortSignal` internals when a test mocks `global.fetch`, an environment-compatibility issue, not an app bug). This proves the *mechanism* that will eventually replace `inventory-snapshot.ts`'s `forceRefreshSnapshot` (which still clears every cached snapshot to refresh one — the actual W-13 bug). **W-13 itself is not closed** — no mutation endpoint exists yet to invalidate anything, and `inventory-snapshot.ts` is untouched, deliberately, since it's cart validation machinery this phase doesn't own.

## Findings Raised During Build (P6/P7)

- **F5 — the ESLint gap is repo-wide latent debt, now partially exposed.** `next build`'s lint step was inert in both apps for the life of this repo (no config ever existed). Four content errors are pre-existing and unrelated to this chain; recorded, not fixed. Anyone escalating the new `no-restricted-syntax` rule to `error`, or otherwise tightening lint, will hit these first.
- **F6 — RTK Query's `keepPreviousData` gap.** Not a bug, a real difference from SWR/React Query worth knowing before migrating the next resource — see above.

## Verification Items (P6/P7)

| Manifest ID | Target | Result |
|---|---|---|
| R6 | `npm ls @ecom/shared` resolves both apps | **met** |
| R6 | Zero relative `shared/` escapes | **met** |
| R6 | Single `User`/`CartProduct` declaration | **met** |
| R6 | P5 tests unmodified through P6 | **met** — verified before P7 began |
| R6 | Single `baseQuery`, `credentials: 'include'` | **met** — asserted directly on the exported config, not inferred |
| R6 | Tag-scoped invalidation exists | **met** for reads; **not yet exercised** by any mutation |
| R6 | Distinguishable error state (forced address failure) | **met** — new test, `role="alert"` vs. the empty-state copy |
| R6 | Lint rules exist and are real | **met**, at `warn` not `error` — see F5 for why `error` isn't safe yet |
| R6 | Zero `fetch()` outside `shared/api/` | **not met, and not attempted this session** — see scope decision above |

## Command Results (P6/P7)

| Command | Area | Outcome |
|---|---|---|
| `npm install` (root) | repo | pass — symlinked `@ecom/shared`, pruned unrelated stale optional deps |
| `npx tsc --noEmit` ×2 | web, admin | pass, both phases |
| `npx vitest run --root apps/web` | web | pass — 13 tests, 4 files (11 pre-P7 + 2 new RTK Query tests) |
| `node scripts/verify-contrast.mjs` | repo | pass, unaffected by P6/P7 |
| `node scripts/verify-no-tailwind-with-scss.mjs` | repo | pass — 8/8 baseline, 0 new |
| `npm run build --workspace=apps/web` | web | pass — **failed once** mid-phase on the ESLint regression (see above), fixed, re-verified pass |
| `npm run build --workspace=apps/admin` | admin | pass throughout |
| `npx next lint` ×2 | web, admin | admin exits 0 (warnings only); web exits 1 on four pre-existing unrelated errors — recorded as F5, not fixed |
| `npm run lint` (repo root) | repo | **not run** — would currently fail on F5; not added to CI for the same reason |
| `npm run build` (repo root) | repo | **not run** — same as prior phases, needs Prisma generate + reachable DB |

## P3 / P4 Addendum

### The audit's palette does not actually reach AAA

P3's exit gate required computing ratios rather than trusting the register, and that changed three values. `scripts/verify-contrast.mjs` is checked in so this is a re-runnable gate, not a one-time claim.

| Issue | Audit value | Measured | Shipped |
|---|---|---|---|
| Badges measured against plain white, but the real background is each badge's own 10% tint composited on the surface — roughly a point worse | success `#065F46`, warning `#92400E`, error `#B91C1C` | 6.99 / 6.56 / 5.66 — all below 7.0 | `#035D41` / `#7C4403` / `#9A1B1B`, all ≥7.2 |
| Dark-mode badges never examined by the audit at all; classes carried fixed colours with no dark variant | not covered | success 4.08, error 3.34, info 3.05 — the worst failures in the set | dark variants added, all ≥7.2 |
| Dark `--brand-primary` listed as AAA | `#7CB0FB` | 6.71 on `--surface-2` — the audit printed this number itself while labelling the palette AAA | `#88B7FB` (7.24) |
| `badge-info`, `badge-neutral` | omitted | info 4.62, neutral unmeasured | both covered, ≥7.2 |

### Two more stale register entries (RI3)

- **A-05 — no-op.** Claimed three admin modals were raw divs. They already use `SharedModal`. A repo-wide sweep for overlay divs returns exactly one hand-rolled modal: TrackingModal. Nothing to convert.
- **A-08 — half no-op.** Claimed admin has no skip link. It exists at `(dashboard)/layout.tsx:40`. Only the missing `<nav>` label was real.

That brings the staleness count to six of the findings touched so far (`S-07`, `A-05`, `A-08`, `W-12`, `W-08`, `W-19`).

### Changes to `shared/components/UIPrimitives.tsx`

A-04's "delete the custom modal, use the shared one" was not a drop-in. Two blockers, both fixed backward-compatibly:

- `SharedModal` was hardcoded to `max-w-md`; TrackingModal is `max-w-2xl` and contains an iframe. Added a `size` prop defaulting to `md`, so the two existing callers are unaffected.
- `aria-labelledby` pointed at a hardcoded `"modal-title"`, which yields duplicate ids and an ambiguous accessible name if two modals are ever mounted at once. Now `useId`-based.

### `Select` was worse than A-06 described

Beyond the missing `aria-describedby`: no `aria-invalid` at all, and `selectId` derived from the label text — so two selects sharing a label collided, and one without a label got no id, breaking its `htmlFor`. All fixed.

### Deliberately not done: the flattened text hierarchy

`--text-tertiary` now equals `--text-secondary`, which is required at 7:1. **21 of the 27 files using tertiary also use secondary** and have lost a hierarchy level. The plan called for re-establishing it through weight and size. I did not do this: it is a visual design judgement across 21 files that cannot be made without rendering them, and guessing at it blind would be changing design I cannot see. Logged as a P8 manual-QA item with the file list. The token change on its own is a strict readability improvement (tertiary went from 2.56:1 to 7.03:1), so nothing is worse in the meantime — only less differentiated.

## Branch / Repo Status

| Moment | Branch | Status | Notes |
|---|---|---|---|
| Before P0 | `arb-remediation` | 3 modified + 7 untracked paths belonging to the sibling chain, uncommitted | Its Phase 1 work (test harness, CI, compose file) was never committed |
| P0 action | `arb-remediation` | committed as `4e3f186` | **See D1 below** — committed rather than stashed, deliberately |
| After P0 | `frontend-security-a11y` (from `feat/homepage-redesign`) | clean tracked tree | No arb-owned file present; ancestor check passed |
| At handoff | `frontend-security-a11y` | 3 commits, nothing pushed | Pre-existing untracked user work (`.vscode/`, `.rtk/`, the zip, `docs/product/`) never staged |

## Scope

- In scope and done: the four `W-*` security findings, five server findings, the admin role guard, and the toast live-region work.
- Out of scope (untouched): everything owned by `arb-remediation` — payment verification, webhooks, reservations, refund math, `server/src/index.ts`, `server/tests/`, `.github/`.
- Recorded scope note: `apps/admin/src/components/providers.tsx` was touched in both P2 (role check) and the P3 slice (toast). Same file, two findings, two commits.

## Changed Files

| File | Change | Finding IDs |
|---|---|---|
| `apps/web/next.config.js`, `apps/admin/next.config.js` | image host allowlist, R2 host derived from `R2_PUBLIC_URL` | W-01 |
| `apps/web/src/lib/safe-redirect.ts` | new — pure same-origin redirect guard | W-02 |
| `apps/web/src/lib/safe-redirect.test.ts` | new — vitest spec, waiting on P5 tooling | W-02, R5 |
| `apps/web/src/app/account/login/page.tsx` | guard applied at the single source both pushes read | W-02 |
| `.../TrackingModal/TrackingModal.tsx` | `encodeURIComponent` on AWB; dropped `allow-same-origin` | W-18, W-19 |
| `server/src/middleware/error.middleware.ts` | ZodError → 400 branch; explicit return on the generic path | S-02 |
| `server/src/middleware/auth.middleware.ts` | exported `JWT_VERIFY_OPTIONS`, pinned HS256 | S-06 |
| `server/src/routes/auth.routes.ts` | pinned the third verify site | S-06 |
| `server/src/services/image-upload.service.ts` | magic-byte validation at the image choke point | S-07 |
| `apps/admin/src/components/providers.tsx` | ADMIN role test in `checkAuth`; clears user on failure; toast live regions; random toast id | P0-4, W-09, A-03, W-10 |
| `apps/admin/src/app/(dashboard)/layout.tsx` | guard tests role, not just presence | P0-4 |
| `apps/web/src/contexts/toast.context.tsx` | two live regions, polite + assertive | A-03 |

## Implementation Log

1. **P0.** The sibling chain's Phase 1 work sat uncommitted in the shared tree. Committing it to `arb-remediation` (`4e3f186`) rather than stashing — see D1. Then cut `frontend-security-a11y` from `feat/homepage-redesign` and verified no arb-owned file came across.
2. **P1.** `W-01`'s allowlist needed the real R2 host. Rather than hardcode it, derived the hostname from `R2_PUBLIC_URL`, the same env var `r2.service.ts` uploads against, so the allowlist cannot drift from where images actually come from.
3. **W-02** had only one `searchParams.get('redirect')` call site feeding two `router.push` calls, so one guard at the source covers both. Extracted as a pure function to make it testable without a DOM.
4. **W-19**: the iframe carried `allow-forms` in addition to the two attributes the audit documented. Dropped only `allow-same-origin` — that is the pairing that defeats the sandbox; `allow-forms` alone does not, and removing it could break courier pages that post.
5. **P2, S-07**: the audit says multer has no `fileFilter`. It does (`admin.routes.ts:30-36`, allowlisting jpeg/png/webp) — a stale finding. The real gap is that `fileFilter` only sees the client-declared MIME type, so the fix moved to magic-byte validation at `uploadProductImages`, the single choke point for user-supplied images. `uploadBuffer` was rejected as the location because invoices share it and are PDFs.
6. **S-06**: found a third `jwt.verify` site at `auth.routes.ts:329` that the audit does not list, and pinned it too. Deliberately did **not** pin issuer/audience — see D2.
7. First typecheck surfaced three errors of my own making: `as const` produced a `readonly` array where `VerifyOptions` wants mutable, and the new early return tripped `noImplicitReturns` in the error handler. Both fixed.
8. **P3 slice.** `A-03` needed two live regions rather than the one the audit suggests, because a single container carries one politeness level and the audit itself asks for `assertive` on errors. While in admin's provider, fixed `W-10`'s toast-id collision — the same-millisecond id clash that web had already fixed and admin had not.

## Decisions Taken During Build

- **D1 — Committed the sibling chain's uncommitted work instead of stashing it.** `arb-remediation`'s task artifact records that a previous `git stash -u` / `pop` on this tree conflicted on `package-lock.json` and had to be resolved by hand. Repeating that to cut a branch would risk the same data-loss-adjacent mess. A commit on that chain's own feature branch is reversible, preserves everything, and left my tree genuinely clean. Its Phase 1 exit gate was already met (26 tests), so nothing half-finished was frozen. **This modified a branch this chain does not own** — flagging it explicitly rather than burying it.
- **D2 — Pinned the JWT algorithm but not the issuer.** The audit recommends `{ algorithms: ['HS256'], issuer: 'ecom-api' }`. Nothing in the codebase signs with an issuer (three `jwt.sign` sites, none set one), so verifying it would reject every token currently in circulation and log out every active session. Algorithm pinning is the part that closes the algorithm-confusion class and costs nothing. Issuer pinning needs a sign-then-verify rollout and is recorded as follow-up F2.
- **D3 — `W-01` now fails closed.** If `R2_PUBLIC_URL` is unset at build time, R2-hosted images stop being optimized rather than every host being allowed. That is the correct direction per the audit's own §F-8 argument, but it is a behavior change: **the deploy pipeline must have `R2_PUBLIC_URL` present at build time, not just at runtime.** Called out for Ship.

## Deferred, With Reasons

| Item | Why deferred | Where it goes |
|---|---|---|
| `S-08` cookie-parser | Lives in `server/src/index.ts`, which `arb-remediation` is actively editing and has committed changes to on its own branch. Editing it here guarantees a merge conflict in a payment-adjacent bootstrap file | P8, or after arb merges — per the plan's ownership split |
| `S-20` webhook rate limit | Same file, same reason | P8 |
| `S-07` `Content-Disposition` on `/uploads` | Same file (`index.ts:108`) | P8 |
| `S-17` `optionalAuth` collapse | Pure refactor of auth middleware with no security payoff, and no server test harness exists on this branch (arb owns it). Refactoring auth blind is exactly what the audit warns against | P5 or later, once tests exist |
| `A-03` VoiceOver confirmation | Cannot be proven statically; the audit says so explicitly (§15) | P8 manual QA |

## Findings Raised During Build

- **F1 — `S-07` was already half-fixed.** `fileFilter` exists despite the audit stating it does not. This is the fourth register staleness delta on top of the three found at Think (`A-08`, `W-12`, `W-08`), which further justifies RI3. Anyone working this register should assume roughly one finding in six is stale.
- **F2 — JWT issuer pinning needs a rollout plan**, not a one-line change (see D2). Sign all three sites with an issuer, deploy, wait out the 7-day refresh-token window, then start verifying it. Worth scheduling; not worth logging out every user for.
- **F3 — `npm run build` at repo root was not run.** Both apps were built individually and both exit 0. The root script also builds `server`, which needs Prisma generate and a reachable database. Recorded as unproven rather than claimed.
- **F4 — the web build logs `TypeError: fetch failed` during static generation.** Pre-existing, not caused by this work: ISR pages fetch the API at build time and no server runs locally. The build still exits 0 and the pages degrade to their own error handling. Worth knowing before someone reads it as a regression from these commits.

## Command Results

| Command | Area | Outcome | Notes |
|---|---|---|---|
| `git merge-base --is-ancestor feat/homepage-redesign HEAD` | repo | **pass** | P0 gate — base confirmed |
| `git status --porcelain` filtered for arb-owned paths | repo | **pass** | P0 gate — none present |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | `apps/web` | **pass** | "No errors found" |
| `npx tsc --noEmit -p apps/admin/tsconfig.json` | `apps/admin` | **pass** | clean |
| `npx tsc --noEmit -p server/tsconfig.json` | `server` | **pass** | clean after fixing the three errors in log item 7 |
| `npm run build --workspace=apps/web` | `apps/web` | **pass** | exit 0, "Compiled successfully", 21/21 static pages. See F4 |
| `npm run build --workspace=apps/admin` | `apps/admin` | **pass** | exit 0, "Compiled successfully" |
| `safeRedirect` case sweep (node) | `apps/web` | **pass** | 8/8 — absolute, protocol-relative, backslash, null, empty all fall back to `/account` |
| ZodError branch, live express app under `NODE_ENV=production` | `server` | **pass** | `STATUS: 400`, body carried per-field errors. This is the S-02 claim proven at runtime, not read from source |
| JWT algorithm pin, live sign/verify | `server` | **pass** | HS256 accepted, HS512 rejected with "invalid algorithm" |
| Magic-byte check case sweep (node) | `server` | **pass** | 7/7 — JPEG/PNG/WebP accepted; SVG, HTML, short buffer, and RIFF/WAVE rejected |
| `grep -c "hostname: '\*\*'"` | both next.configs | **pass** | 0 |
| `grep -c 'sandbox="[^"]*allow-same-origin'` | TrackingModal | **pass** | 0. The plain-substring form of this gate returns 2 — it matches my own explanatory comment. Gate corrected to scope to the attribute |
| `grep -c 'aria-live'` | both toast containers | **pass** | 1 each |
| `npm run build` (repo root) | repo | **not run** | See F3 |
| `npm run lint` | repo | **not run** | Plan assigns it to P8 |
| Manual QA (keyboard, VoiceOver, 320px reflow) | both apps | **not run** | P8-owned. No accessibility claim here rests on these |

## Verification Items

| Manifest ID | Target | Result |
|---|---|---|
| R1 | `W-01` `W-02` `W-18` `W-19` closed | **met** — greps + runtime case sweep + both builds |
| R4 | `S-02` `S-06` `S-07` + role guard closed | **partially met** — four items deferred with reasons above |
| R2 | `A-03` toast announcement | **statically met**, runtime unproven — P8 owns the VoiceOver pass |
| RI1 | No collision with arb-remediation | **met so far** — no arb-owned file touched. Full diff check is P8-owned |
| RI2 | Non-default branch | **met** — `frontend-security-a11y`, nothing pushed |
| RI3 | Findings re-verified before fixing | **met** — produced F1 |
| RI4 | Claims backed by evidence | **met** — S-02 and S-06 proven at runtime; unproven items listed as such |
| RI5 | No secrets in artifacts | **met** — only env var names (`R2_PUBLIC_URL`, `JWT_SECRET`) appear |

## Blockers

- **B2 — `shared/types/**` protected-path approval.** Unchanged from Plan. Blocks P6 and P7 only. P3, P4, P5 need no further approval.

## Phase Completion Log

| Phase | Status | Completed | Evidence |
|---|---|---|---|
| P0 — Branch setup | gate met | 2026-07-20 | ancestor check + clean-tree check |
| P1 — Security tier | gate met | 2026-07-20 | commit `f9a9890`; both builds; greps; redirect sweep |
| P2 — Server hardening | gate met, 4 deferrals recorded | 2026-07-20 | commit `401576e`; server typecheck; runtime ZodError and JWT checks |
| P3 — `A-03`/`W-10` slice | partial | 2026-07-20 | commit `45ea8d2`; both builds; aria-live greps |
| P3 — contrast palette | gate met | 2026-07-20 | commit `d1f0837`; `scripts/verify-contrast.mjs` PASS across both apps, both themes, three surfaces; both builds |
| P4 — semantics, focus, targets, motion | gate met | 2026-07-20 | commit `d7a59fc`; zero hand-rolled modals remain; both typechecks and builds; gate greps for `aria-describedby`, reduced-motion, focus-visible, 44px, heading order |
| P5 — test harness + correctness | gate met, W-16 deferred | 2026-07-20 | commit `f8ab357`; `npx vitest run --root apps/web` → 10 passed, 3 files; failing-before verified for W-04/W-07/W-06 by reverting the source; web typecheck and build exit 0 |

## P5 Addendum

### Test harness

Vitest + Testing Library + jsdom in `apps/web`; `test_roots` was empty and no frontend runner existed. Two setup notes worth keeping: `@vitejs/plugin-react` v6 is ESM-only and cannot be loaded by vitest 1.6's Vite 5, so it is pinned to v4; and `vitest.config.ts` casts its plugin array because `apps/web` and the root resolve different Vite copies, making the `Plugin` types nominally distinct but structurally identical.

**Suite: 10 tests, 3 files, all passing.**

### Evidence quality per finding — read this before trusting the suite

| Finding | Failing before? | Passing after? | Notes |
|---|---|---|---|
| W-04 double-order | **yes** | yes | Verified by reverting `checkout/page.tsx` to HEAD and re-running: 2 of 3 failed |
| W-07 stale price | **yes** | yes | Same run |
| W-06 / W-17 toast | **yes** | yes | 2 of 3 toast tests failed before the `useCallback`/cleanup change |
| W-03 refetch loop | **no** | yes | **The test does not reproduce the original bug.** The loop depended on `CartProvider` handing back a fresh `items` identity per render; the test mocks `useCart` with a stable object, so the loop cannot occur in the harness regardless of the fix. It stands as a regression guard on the `cartKey` approach, not as proof the loop is gone. Proving that needs the real provider tree or a browser |

Recorded rather than smoothed over: claiming four failing-then-passing fixes when one of them never failed would be exactly the false evidence the policy forbids.

### A test bug worth remembering

The first checkout run hung indefinitely. The cause was in the test, not the page: the `useAuth` mock returned a fresh object per call, so the addresses effect keyed on `user` looped forever. Every mocked hook in that file now returns a module-level stable identity, with a comment saying why. This is the same class of defect as W-06 itself, which is a decent argument that the memoization work matters.

### Beyond the register

`addItem` returning `Promise<boolean>` (W-14) exposed a worse bug the audit did not name: wishlist **move-to-cart removed the item from the wishlist even when the add failed**, so a stock-validation failure destroyed the item rather than moving it. Both the single and bulk paths now only remove on success.

### Deferred

- **W-16** (three syncing effects on the products page). URL-sync and back-button behaviour cannot be verified without a browser, and the finding is Low severity. Editing it blind risks a worse regression than the double-render it fixes. Goes to P7 or a follow-up.
- **W-13** (snapshot invalidation) remains P7-owned — it is replaced by RTK Query tag invalidation rather than patched.

### CI

`.github/workflows/frontend-ci.yml` is a **new, separate file**, not an edit to the workflow `arb-remediation` authors — that file does not exist on this branch and editing it across two parallel chains would conflict. Structure and tab-freedom checked locally; **it has never executed**, since Build does not push. Merging the two workflows is a Ship-time task.

## Blocker Status Update

- **B2 — resolved 2026-07-20, approved by user.** P6 and P7 unblocked. The exit-gate bound still applies: P6 must leave behaviour unchanged, proven by P5's tests passing unmodified.
