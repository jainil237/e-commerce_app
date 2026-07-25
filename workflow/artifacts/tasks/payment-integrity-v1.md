---
slug: payment-integrity
version: 1
artifact: task
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [RI1, RI6, R2, R1, R5, R4, R3, RI3, RI2, RI4, RI5]
upstream:
  - workflow/artifacts/briefs/payment-integrity-v1.md
  - workflow/artifacts/plans/payment-integrity-v1.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  user_checkpoint: none
---

# Payment Integrity & Fraud Prevention — Task

## Active Phase

- Phase: **All Build phases complete (1-5).** Proceeding to Review, then Test, per user instruction — commit deferred until both pass.
- Manifest IDs owned by Build: RI1, RI6, R2, R1, R5, R4, R3, RI3 — all implemented and green.
- Per user instruction this turn: implement Phases 3, 4, 5 without committing after each; commit once after Review and Test both pass. See Process Note below.

## Plan Phases Overview

| Phase | Status | Manifest IDs |
|---|---|---|
| Phase 1 — Test harness and characterization baseline | complete | RI1, RI6 |
| Phase 2 — Fail-closed payment configuration | complete | R2 |
| Phase 3 — Shared confirmation service: binding and audit trail | complete | R1, R5 |
| Phase 4 — Money correctness | complete | R4 |
| Phase 5 — Webhook raw-body HMAC (isolated) | complete | R3, RI3 |
| Phase 6 — Contract, verification, ship readiness | complete | RI2, RI4, RI5 |
| Phase 3 — Shared confirmation service: binding and audit trail | pending | R1, R5 |
| Phase 4 — Money correctness | pending | R4 |
| Phase 5 — Webhook raw-body HMAC (isolated) | pending | R3, RI3 |
| Phase 6 — Contract, verification, and ship readiness | pending | RI2, RI4, RI5 |

## Branch / Repo Status

| Moment | Branch | Status | Notes |
|---|---|---|---|
| Before edits (Phase 1) | `payment-integrity` | `?? workflow/artifacts/briefs/payment-integrity-v1.md`, `?? workflow/artifacts/plans/payment-integrity-v1.md` | Both untracked files are this chain's own Think/Plan artifacts, written in prior phases this session. No other dirty state. Cut from `main` post-merge of `frontend-security-a11y` per plan branch strategy. |
| After Phase 1 | `payment-integrity` | Phase 1 files committed locally (`edc79ff`); working tree otherwise holds only this chain's own artifact files (`?? workflow/artifacts/{briefs,plans,tasks}/payment-integrity-v1.md`) | Commit matches declared Phase 1 scope exactly (`check-commit-coverage: ok`); per plan branch strategy Build commits locally only — not pushed, no PR opened |
| Before Phase 2 edits | `payment-integrity` | Clean except this chain's own artifact files (unstaged edits to `workflow/artifacts/tasks/payment-integrity-v1.md` for this phase's scoping) | Confirmed via `agentsmyth check --phase build --slug payment-integrity` → ok before touching any Phase 2 file |

## Scope

- Phase 1 (complete): `server/vitest.config.ts` (new), `server/tests/**` (new), `server/package.json` (add `test` script + devDeps), `package-lock.json` (regenerated), `server/src/index.ts` (boot guard only — no route/behavior change).
- Phase 2 (complete) — in scope: `server/src/config/payments.ts` (new), `server/src/config/env.ts` (boot assertion call — `server/src/index.ts` turned out not to need a separate touch, see Changed Files), `server/src/routes/order.routes.ts` (mock-mode gates only, not R1's binding/amount logic), `server/src/services/rma.service.ts` (mock-mode gate only, not R4's GST logic), `server/tests/setup.ts` (default mock mechanism), `server/tests/security/payment-binding.test.ts` (flip/replace SEC-2/TD-2 assertions), `server/tests/security/payments-config.test.ts` (new).
- Out of scope this phase: R1 (order↔Razorpay binding, `verify-payment`'s signature/lookup logic beyond the mock gate), R3 (webhook raw body), R4 (discount clamp, coupon atomicity, GST), R5 (audit rows) — Phases 3–5 own those. SEC-1's replay-test file (`payment-binding.test.ts`) is touched only for its SEC-2/TD-2 tests; its SEC-1 tests are untouched until Phase 3.

## Changed Files

### Phase 5 (complete) — protected path, approved via brief Q1

- `server/src/index.ts` — mounts `express.raw({ type: 'application/json' })` scoped to `/api/v1/webhooks/razorpay` only, registered before the global `express.json()` — IDs: R3
- `server/src/routes/webhook.routes.ts` — **protected, approved** — new `verifyWebhookSignatureRaw()` (HMAC over the raw `Buffer`); `/razorpay` handler reads `req.body` as a `Buffer`, verifies against it, then `JSON.parse`s for the event payload. `verifyWebhookSignature()` (JSON-based) and the `/logistics` route are untouched — R3 is Razorpay-only per plan scope — IDs: R3, RI3
- `server/tests/characterization/webhook.test.ts` — unit tests for `verifyWebhookSignatureRaw`; HTTP-level tests hitting the real `/api/v1/webhooks/razorpay` route (byte-exact match confirms, tampered body rejects, unset secret fails closed); a non-webhook-route parsing guard; a logistics-path regression guard — IDs: R3

### Phase 4 (complete)

- `server/src/routes/order.routes.ts` — clamp `discount` so `total = subtotal + shippingCharge - discount` can never go negative — IDs: R4
- `server/src/services/rma.service.ts` — refund calculation stops adding GST on top of `orderItem.unitPrice` (already GST-inclusive at order-creation time); forward-only, no retro-adjustment of existing `Refund` rows (brief A2) — IDs: R4
- `server/src/routes/coupon.routes.ts` — **contract change** (public contract, RI2): `/validate` and `/available` stop accepting a client-supplied `orderValue`; both now accept `items: [{productId, quantity}]` and compute the subtotal server-side from real product prices, same approach as order creation. `/available` changes from `GET ?orderValue=` to `POST` with a body, since there is no persisted server-side cart to resolve from (Epic 2/E4 non-goal) — an items array is the smallest contract that lets the server compute a real number instead of trusting the client's. — IDs: R4
- `apps/web/src/app/checkout/page.tsx` — updates both coupon fetch call sites to match the new contract: sends `items` instead of `orderValue`; `/coupons/available` becomes a `POST`. Required by RI2 ("web and admin clients require no coordinated change to keep working" — this **is** the coordinated change, made in the same commit as the contract change, not left dangling) — IDs: R4
- `server/tests/characterization/money-correctness.test.ts` — new; discount clamping, `maxUsage`/`perUserLimit` coupon concurrency, GST-correct refund flip, coupon-endpoint contract tests — IDs: R4

### Phase 3 (complete)

- `server/src/services/payment-confirmation.service.ts` — new; `confirmPayment()` — the shared transactional confirmation path both entry points delegate to: R1's offline binding check (`razorpayOrderId` equality) always, R1's amount/status check via `razorpay.payments.fetch()` when not in mock mode (Q3 decision), idempotency no-op when already `PAID`, coupon-usage increment moved inside this transaction (structural prerequisite for Phase 4's atomicity test), `OrderAuditLog` row for the confirmation transition — IDs: R1, R5
- `server/src/routes/order.routes.ts` — `verify-payment` keeps its own local-HMAC signature check (Phase 5 territory, unchanged), then delegates the rest to `confirmPayment()` instead of updating the order/coupon/audit state itself — IDs: R1, R5
- `server/src/routes/webhook.routes.ts` — `payment.captured` delegates to `confirmPayment()` instead of its own inline update; `payment.failed` and `refund.created` each gain an `OrderAuditLog` row written in the same transaction as their status update (stock-restore loops in both left untouched — Epic 2/S-05 territory, explicit brief non-goal) — IDs: R5
- `server/tests/security/payment-binding.test.ts` — flip the SEC-1 `it.fails` assertion to plain `it` — IDs: R1
- `server/tests/security/payment-confirmation.test.ts` — new; amount-mismatch rejection, non-captured rejection, fetch-failure fail-closed, mock-mode confirmation, idempotency, R1 binding/ownership scoping, R5 entry-point-equivalence — IDs: R1, R5

### Phase 2 (complete)

- `server/src/config/payments.ts` — new; single `isPaymentsMockMode()` switch (explicit `PAYMENTS_MOCK=true` opt-in, hard-disabled under `NODE_ENV=production`) and `assertRequiredPaymentEnv()` (throws when required payment vars are missing in production) — IDs: R2
- `server/src/config/env.ts` — calls `assertRequiredPaymentEnv()` immediately after `dotenv.config()`, `process.exit(1)` on failure. **Plan named `server/src/index.ts` for this call; not needed** — `index.ts`'s first import is already `./config/env`, so the assertion fires at the earliest possible point without a separate call site. Recorded as a scope reduction, not an addition. — IDs: R2
- `server/src/routes/order.routes.ts` — replaced both inline placeholder-string mock checks (order creation, verify-payment) with `isPaymentsMockMode()` — IDs: R2
- `server/src/services/rma.service.ts` — replaced the inline mock check with `isPaymentsMockMode()`; removed the `'dummy_key'`/`'dummy_secret'` Razorpay-client fallback strings (now empty-string fallback, since the mock gate — not the client's config — is what prevents real calls) — IDs: R2
- `server/tests/setup.ts` — replaced the Phase-1 placeholder-key override with `PAYMENTS_MOCK=true` as the suite's default, since key shape no longer decides mock mode after this phase — IDs: R2
- `server/tests/security/payment-binding.test.ts` — rewrote the SEC-2/TD-2 describe block: flipped the `it.fails` assertion to plain `it`, replaced the now-false "unset key silently skips verification" characterization with three tests proving the new invariant (unset key, placeholder-shaped key, and explicit opt-in) — IDs: R2
- `server/tests/security/payments-config.test.ts` — new; direct unit tests of `isPaymentsMockMode()` and `assertRequiredPaymentEnv()` under production/non-production and complete/incomplete env — IDs: R2

### Phase 1 (complete)

- `server/package.json` — add `test`/`test:watch` scripts; add `vitest`, `supertest`, `@types/supertest` as devDependencies — IDs: RI1
- `package-lock.json` — regenerated by the installs above — IDs: RI1
- `server/vitest.config.ts` — new; `fileParallelism: false` (suite shares one MySQL test schema) — IDs: RI1
- `server/tests/setup.ts` — new; pins `DATABASE_URL`/`TEST_DATABASE_URL`, `PAYMENTS_MOCK`-relevant env, and JWT secrets before `src/` loads (required because `config/env.ts`'s `dotenv.config()` does not overwrite already-set vars) — IDs: RI1
- `server/tests/global-setup.ts` — new; drops and rebuilds the test schema per run via `prisma db push`, guarded to a `_test`-suffixed database name only — IDs: RI1
- `server/tests/helpers/test-db-url.ts` — new; derives the test DB URL from `TEST_DATABASE_URL` or `DATABASE_URL`, never logs it — IDs: RI1, RI4
- `server/tests/helpers/factories.ts` — new; FK-ordered `resetDb`, user/address/product/order factories, direct session-cookie minting (bypasses `authLimiter`'s 5-per-15-min cap rather than poisoning it) — IDs: RI1
- `server/tests/characterization/checkout.test.ts` — new; order creation, stock deduction (today's behavior, unmodified — Epic 2 territory, not touched), cancel, verify-payment happy path, coupon apply — IDs: RI1
- `server/tests/security/payment-binding.test.ts` — new; documents SEC-1 (no order↔razorpayOrderId binding) and SEC-2/TD-2 (env-shape mock gate) as failing-today characterization, with `it.fails` placeholders for the Phase 2/3 fixed state — IDs: RI1
- `server/tests/characterization/webhook.test.ts` — new; `verifyWebhookSignature` unit tests including the SEC-3 `JSON.stringify(body)` gap as characterization (not a fix) — IDs: RI1
- `server/tests/characterization/rma-refund.test.ts` — new; refund happy path, idempotency, state guard, audit row presence, TD-7 GST-over-refund as `it.fails` placeholder for Phase 4 — IDs: RI1
- `server/tests/regression/validation-error.test.ts` — new; RI6 — a validation failure on a payment endpoint returns 400 with field errors, not 500 — IDs: RI6
- `server/src/index.ts` — guard `startServer()` behind `process.env.NODE_ENV !== 'test'` so importing the app under test (via supertest) does not bind a port or block on `prisma.$connect()` — IDs: RI1

## Implementation Log

### Phase 3

24. Built `server/src/services/payment-confirmation.service.ts` — `confirmPayment()`: idempotency no-op on already-`PAID`; R1 layer 1 (offline `razorpayOrderId` equality, always); R1 layer 2 (non-mock only: `razorpay.payments.fetch()`, checks `status === 'captured'`, `order_id` match, `amount` match against `Math.round(order.total * 100)`); coupon-usage increment moved inside the same transaction (structural prerequisite for Phase 4); `OrderAuditLog` row with `fromState`/`toState`. `PaymentConfirmationError` carries `code`/`statusCode` so route handlers can translate it to the existing `createError` shape without the service knowing about Express.
25. Rewired `order.routes.ts`'s `verify-payment`: kept the existing local-HMAC signature check as-is (Phase 5 territory), replaced everything after it (order lookup, status update, coupon increment) with a single `confirmPayment()` call; invoice generation and confirmation email now gated on `!result.alreadyConfirmed` so a replay doesn't regenerate/resend either.
26. Rewired `webhook.routes.ts`'s `payment.captured` case to delegate to `confirmPayment()`; wrapped each `case` body in its own block (`{ }`) since multiple cases now declare local `const`s in the same `switch` scope. Added `OrderAuditLog` writes (inside a `prisma.$transaction([...])` alongside the status update) to `payment.failed` and `refund.created` — the stock-restore loops in both are untouched, per brief non-goal (Epic 2/S-05).
27. `npx tsc --noEmit` — clean on the first attempt after wiring both routes.
28. Rewrote the SEC-1 block in `payment-binding.test.ts`: flipped the `it.fails` to `it` (now passes — the replay is rejected at layer 1 before any network call), added an explicit "order stays PENDING after the rejected replay" assertion, and replaced the now-obsolete "today: replay succeeds" characterization with a "legitimate happy path" test. **That happy-path test itself doesn't reach `PAID`** — `withRealSignatureVerification` turns off `PAYMENTS_MOCK`, so R1's layer-2 fetch runs for real against Razorpay's actual API with a fake payment id, which correctly fails closed (502). Documented in the test itself rather than treated as a bug: proving a genuine non-mock confirmation needs a *mocked* Razorpay response, which is what the next test file does.
29. Built `server/tests/security/payment-confirmation.test.ts` — unit-level tests of `confirmPayment()` directly, with `vi.mock('razorpay')` (via `vi.hoisted` for the shared mock fn) so R1's amount/status logic can be tested against controlled fetch responses instead of a real account. Covers: successful non-mock confirmation, amount mismatch, non-captured status, fetch failure (all three failure cases assert the order stays `PENDING`), mock-mode confirmation (asserts the mock fetch is never called), idempotency (second call is a no-op, exactly one audit row), R1 order-binding at the unit level (mismatch, and cross-user ownership scoping on the client path), and the R5 entry-point-equivalence test comparing a client-sourced and webhook-sourced confirmation's audit-row `action`/`fromState`/`toState`.
30. First full run: 7/7 files, 39 passed, 1 todo (unchanged — still Phase 5's). `tsc --noEmit`: clean. Re-ran for determinism: identical.
31. Confirmed via `git status` that `vi.mock('razorpay')` in the new test file does not leak into other test files (vitest gives each test file its own module graph) — `checkout.test.ts`'s real order-creation/verify-payment HTTP flows still passed unmodified in the same run.

### Phase 4

32. Clamped `discount` in `order.routes.ts` to `Math.min(discount, subtotal + shippingCharge)` — covers both a `FLAT` coupon larger than the order and a misconfigured `PERCENTAGE` coupon above 100%, since neither the schema nor admin UI bounds `discountValue`.
33. Fixed the GST double-count in `rma.service.ts`: removed the `unitPrice.add(gstAmount)` step entirely — `unitPrice` is already GST-inclusive at order-creation time, so refunding it directly (times quantity) is exactly what was charged. Flipped the TD-7 `it.fails` in `rma-refund.test.ts` to plain `it`; deleted the now-obsolete "today: over-refunds" characterization rather than inverting it, since the bug it documented no longer has any behavior to characterize.
34. Changed `coupon.routes.ts`'s contract: both `/validate` and `/available` now take `items: [{productId, quantity}]` instead of a client-supplied `orderValue`/`?orderValue=`, and compute the subtotal server-side via a small shared `computeServerSubtotal()` helper (same pricing approach as order creation — real DB prices, unknown/inactive products silently skipped since this endpoint is preview-only). `/available` changed from `GET` to `POST` since there's no server-side cart to resolve from and a body is the natural place for an items array.
35. **Discovered mid-implementation, not in the plan's Repo Impact Map as a required change but explicitly anticipated as "conditional":** updated the one frontend caller, `apps/web/src/app/checkout/page.tsx`, in the same phase — both fetch calls now send `items` (already in scope from `useCart()`) instead of `orderValue`/`effectiveSubtotal`. Per RI2, a contract change ships with its coordinated client update in the same phase, not left dangling for a future chain to discover as broken.
36. **Found and fixed a gap while writing the concurrency test, not anticipated in the plan:** moving the coupon-usage increment into `confirmPayment`'s transaction (Phase 3) made the write atomic *with the payment-status update*, but did not itself prevent `usedCount` from exceeding `maxUsage` — two orders can both pass order-creation's maxUsage check before either increments (that creation-time race is pre-existing and out of this chain's scope), and the old unconditional `tx.coupon.update({ data: { usedCount: { increment: 1 } } })` would happily push the counter past its cap. Changed to a conditional `tx.coupon.updateMany({ where: { usedCount: { lt: maxUsage } }, ... })` and only upsert `CouponUsage` when it actually matched a row. Decision, recorded here because it's a judgment call: a payment that already succeeded is still confirmed even if the coupon quota was exhausted by a concurrent confirmation (declining to confirm money already collected would be worse) — what the guard protects is the *counter's* accuracy for every check after it, not a hard guarantee that no order ever ships with an over-quota discount in the rare race case.
37. Wrote `server/tests/characterization/money-correctness.test.ts`: discount-clamp tests (FLAT-too-large, PERCENTAGE-over-100), the coupon-concurrency test that surfaced finding #36 above, and three tests proving the new coupon-endpoint contract actually prices from the DB (a `TENOFF` coupon against a real 2-item cart, a `minOrderValue` gate that can't be satisfied by lying about `orderValue` since that field no longer exists, and `/available`'s filtering).
38. `npx tsc --noEmit` clean on both `server/tsconfig.json` and `apps/web/tsconfig.json`.
39. Ran `apps/web`'s existing Vitest suite (`npm run test --workspace=apps/web -- checkout`) to confirm the frontend contract change didn't break `checkout.test.tsx` — it mocks fetch by URL substring only, method-agnostic, so it passed without modification (5/5 tests). Ran the full `apps/web` suite afterward for completeness (5 files, 16 tests, all green).
40. First full server run: 8/8 files, 44 passed, 1 todo (unchanged — still Phase 5's). Re-ran for determinism: identical.

### Phase 5

41. Mounted `express.raw({ type: 'application/json' })` in `index.ts`, scoped to `/api/v1/webhooks/razorpay` and registered before the global `express.json()`. Body-parser precedence relies on Express's standard behavior (a matched parser marks the body consumed; later parsers no-op) — this is the same pattern Stripe/Razorpay-style raw-webhook verification uses everywhere, not a novel mechanism.
42. Added `verifyWebhookSignatureRaw(rawBody: Buffer, ...)` to `webhook.routes.ts`, alongside (not replacing) the existing JSON-based `verifyWebhookSignature`, which the `/logistics` route keeps using unchanged — R3 is Razorpay-only per plan scope. `/razorpay`'s handler now reads `req.body` as a `Buffer`, verifies against it, then `JSON.parse`s for the event payload.
43. `tsc --noEmit` clean on the first attempt.
44. Rewrote the R3 section of `webhook.test.ts`: unit tests for `verifyWebhookSignatureRaw` (including the same "pretty-printed vs. compact" scenario that proved the old function's flaw, now proving the new one is immune to it), and — since the plan itself says R3 can't be closed by a synthesized unit test alone — HTTP-level tests hitting the real `/api/v1/webhooks/razorpay` route through supertest: a signature computed over the exact bytes supertest puts on the wire succeeds; a tampered payload is rejected; an unset secret still fails closed; a non-webhook route still gets a normally-parsed body (guards against the raw mount being broader than intended); the logistics path's own (unchanged) verification still works.
45. **Found and fixed my own test bug, not an app defect:** the first version of the "non-webhook route still parses JSON" test asserted an exact `total: '250'`, which doesn't account for the shipping charge `Store.config.json` adds on top. Fixed to assert `total >= 250` — the point of that test is proving the body parsed as an object at all (a too-broad raw mount would hand `order.routes.ts` a `Buffer` and every field read would be `undefined`), not pinning an exact shipping-inclusive figure.
46. First full run: 8/8 files, **52 passed, 0 todo** — the previously-deferred R3 assertion is real and green for the first time in this chain. Re-ran for determinism: identical.
47. Ran `npm run build --workspace=server` (tsc build, not just `--noEmit`) — clean. Then the full monorepo `npm run build` (server + `apps/web` + `apps/admin`, all three) — all three completed successfully, including the frontend contract-change edit from Phase 4 typechecking and prerendering correctly.
48. `git status` confirms the cumulative diff across Phases 3–5 matches every phase's declared Changed Files, nothing extra: 9 modified files, 6 new files (3 product, 3 test — plus the 3 lifecycle artifacts).

### Phase 6 — Contract, verification, ship readiness (RI2, RI4, RI5)

49. **RI2 (public contract):** confirmed the `{ success, message, data }` response envelope is unchanged everywhere touched — `PaymentConfirmationError` translates to the existing `createError`/`errorHandler` shape rather than inventing a new one. The one intentional contract change (`coupon.routes.ts`) shipped with its coordinated client update in Phase 4 (finding #35), so no client is left broken.
50. **RI4 (no secrets):** `grep -rniE "rzp_(live|test)_[a-zA-Z0-9]{10,}|-----BEGIN"` across this chain's three artifacts and every changed/new source file — zero real-looking secret values. The only matches for `rzp_test_placeholder` are the literal placeholder token name itself (documentation and fixture data), not a credential.
51. **RI5 (branch/PR policy):** `git ls-remote --heads origin payment-integrity` returns nothing — branch not pushed. No PR opened. Per user instruction this turn, Phases 3-5 remain uncommitted pending Review and Test.
52a. **Found during self-review, before handoff to the Review phase:** the R4 coupon-atomicity fix (Phase 4, finding #36) only guarded `maxUsage`, not `perUserLimit` — my own brief's R4 acceptance criterion explicitly named both ("concurrent redemptions cannot exceed `maxUsage` or `perUserLimit`"). Added the same conditional-update guard shape for the per-user counter, with a `create` + catch-`P2002` fallback for the first-use race (Prisma's unique constraint on `(couponId, userId)` makes a losing concurrent create a safe no-op, not an error to surface). Added a matching concurrency test (`perUserLimit=1`, same user, two simultaneous confirmations). Full suite re-run: 8/8 files, 53 passed (up from 52), 0 todo. `tsc --noEmit` and full `npm run build` both re-verified clean after this change.

52b. **Found during self-review, second pass:** `webhook.routes.ts`'s `payment.captured` case wrapped `confirmPayment()` in a local `try/catch` that logged and `break`-ed on failure — which still fell through to the unconditional `res.json({ success: true })` after the `switch`. The comment above that catch literally said "a confirmation that can't be verified must not silently succeed," while the code did exactly that. Removed the inner try/catch so a `confirmPayment` failure propagates to the route's outer catch (→ 500), so Razorpay retries instead of believing a failed confirmation succeeded. Added a regression test that turns off `PAYMENTS_MOCK` for one webhook delivery (triggering a real, unreachable Razorpay fetch) and asserts both a non-200 response and that the order stays `PENDING`. Full suite re-run: 8/8 files, 54 passed (up from 53), 0 todo. `tsc --noEmit` and full `npm run build` both re-verified clean.

52. **Source-of-truth handoff (drafted here for Ship; not published — `source-of-truth.yaml` sets `update: false` on both Notion providers):** Epic 1 checklist items now satisfied by this chain: order↔Razorpay binding + amount check (R1), fail-closed mock mode (R2), webhook raw-body HMAC (R3), coupon atomicity + discount clamp + GST-correct refunds + coupon-preview server pricing (R4), audit rows on payment/failure/refund transitions (R5). One item was already satisfied before this chain started and should be ticked off independently: "every validation error returns 400, not 500" (landed via the `frontend-security-a11y` merge, not this chain). Deliberately still open, out of this chain's scope: Epic 2 (stock reservation / abandoned-checkout stock burn) and Epic 3 (cancel-without-refund) — Ship's notes must say this plainly.

1. Added `test`/`test:watch` scripts to `server/package.json`; installed `vitest`, `supertest`, `@types/supertest` as devDependencies (none present before this phase).
2. Guarded `server/src/index.ts`'s `void startServer()` behind `process.env.NODE_ENV !== 'test'`, and added `export default app` so supertest can import the app without binding a port or blocking on `prisma.$connect()`. (Encountered and fixed a duplicate `export default app` line introduced during editing — the file briefly had two, which esbuild correctly rejected; removed the duplicate.)
3. Built `tests/helpers/test-db-url.ts` — derives a `*_test`-suffixed DB URL from `DATABASE_URL`, with a hard assertion that the resolved name ends in `_test` (guards every destructive operation downstream).
4. Built `tests/global-setup.ts` — runs once in the main process, loads `server/.env` directly via `dotenv` (globalSetup never imports `src/config/env.ts`), then rebuilds the test schema via `prisma db push --force-reset --accept-data-loss` against the derived test URL. Uses `db push`, not `migrate deploy`, per plan assumption A4 (F1 migration drift).
5. Built `tests/setup.ts` (per-worker) — sets `NODE_ENV=test` and `DATABASE_URL` before any `src/` import (required: `config/env.ts`'s `dotenv.config()` does not overwrite already-set vars). **Discovered during this step:** `server/.env` carries a real-looking `RAZORPAY_KEY_ID` for local dev, not a placeholder — so "mock mode by default" required an explicit override here (`RAZORPAY_KEY_ID`/`SECRET` forced to placeholder-shaped values), not just leaving `.env`'s values alone as originally planned.
6. Built `tests/helpers/factories.ts` — FK-ordered `resetDb`, user/address/product factories, and `authCookies()` which mints the same JWT `/auth/login` would issue. Confirmed via test run that hitting `/auth/login` directly would have poisoned the suite (rate limiter is 5 req/15min outside `NODE_ENV=development`, shared in-memory store) — matches the pattern already proven in the prior `arb-remediation` chain.
7. Wrote `tests/characterization/checkout.test.ts` (order creation, stock deduction, insufficient stock, address ownership, verify-payment happy path, cancel + stock restore, coupon apply) — all against today's actual behavior.
8. Wrote `tests/security/payment-binding.test.ts` (SEC-1, SEC-2/TD-2). First run failed two ways: (a) `withRealSignatureVerification`'s `fn().finally(...)` — supertest's `Test` object is thenable but not a real `Promise`, has no `.finally`; fixed by wrapping in `Promise.resolve()`. (b) the "unset key" test deleted `RAZORPAY_KEY_ID` before order *creation*, but order creation's own mock-mode gate only checks equality/`startsWith` on the placeholder string — it does not treat "unset" as mock, unlike `verify-payment`'s gate — so creation itself attempted a real (and failing) Razorpay call. Fixed by creating the order under the default placeholder key, then unsetting the key only for the `verify-payment` call under test.
9. Wrote `tests/characterization/webhook.test.ts` — unit tests against the exported `verifyWebhookSignature`, including a characterization test proving a legitimately-signed payload is rejected when its raw bytes differ from Node's re-serialized form (the SEC-3 mechanism). Left the actual R3 fix's verification as `it.todo`, since the fixed function's input shape is not yet determined and the plan requires a captured real Razorpay event (manual QA), not a synthesized unit test, to close R3.
10. Wrote `tests/characterization/rma-refund.test.ts` (full RETURN flow: create → approve → receive → refund; idempotency; state guard; audit-row sequence; TD-7 GST characterization). First run failed on `OrderAuditLog.userId`'s FK constraint — RMA admin actions were passed a placeholder string `'admin-1'` instead of a real user id; fixed by creating a real `ADMIN`-role user via the factory. Second failure: the idempotency test's regex expected "already been completed" but `issueRefund`'s actual guard order throws "already been issued" first (`rma.refund.status === 'PAID'` is checked before the RMA-status guard); fixed the regex to match actual behavior, not assumed behavior.
11. Wrote `tests/regression/validation-error.test.ts` (RI6) — asserts the already-landed ZodError→400 fix so it cannot silently regress.
12. First full run (`npx vitest run --root server`) failed all order-creation-dependent tests with `ENOENT` on `store.config.json` — traced to `server/src/utils/config.ts:105` resolving `path.join(process.cwd(), '..', 'config', ...)`, which only resolves correctly when the process's cwd is `server/` (as `npm run dev --workspace=server` sets it). Running vitest directly from the repo root broke that assumption. This is a pre-existing, already-tracked cwd-relative config issue (assessment TD-11), not a defect introduced here — fixed the *invocation*, not the source: ran via `npm run test --workspace=server`, matching how the app is normally started.
13. Re-ran full suite twice for determinism (not a one-off pass): both runs green, `5 passed | 22 passed, 1 todo`.

### Phase 2

14. Built `server/src/config/payments.ts`: `isPaymentsMockMode()` (explicit `PAYMENTS_MOCK=true`, hard `false` under `NODE_ENV=production`) and `assertRequiredPaymentEnv()` (throws — doesn't `process.exit` itself, stays a pure testable function — when `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are missing under `NODE_ENV=production`).
15. Wired the boot assertion into `server/src/config/env.ts`, right after `dotenv.config()`, wrapped in try/catch printing the error and calling `process.exit(1)`. **Deviation from the plan's Repo Impact Map:** the plan named `server/src/index.ts` as also needing a call site; it doesn't — `index.ts`'s very first line is `import './config/env'`, so the assertion already fires at the earliest possible point in the boot sequence with no separate wiring. Scope reduction, recorded rather than silently taken.
16. Replaced the inline mock checks in `order.routes.ts` (both order-creation's Razorpay-order branch and `verify-payment`'s signature-skip branch) and `rma.service.ts` (refund's Razorpay-call branch) with `isPaymentsMockMode()`. Removed the `'dummy_key'`/`'dummy_secret'` fallback strings from the Razorpay client constructor in `rma.service.ts` (now empty-string fallback — the mock gate, not the client's own config, is what prevents real calls).
17. Updated `tests/setup.ts`: the Phase-1 override forced `RAZORPAY_KEY_ID` to a placeholder shape to get mock mode; that mechanism no longer exists after this phase, so the suite's default is now `PAYMENTS_MOCK=true` directly.
18. Rewrote the SEC-2/TD-2 half of `tests/security/payment-binding.test.ts`. The old "today: an unset RAZORPAY_KEY_ID silently skips signature verification" characterization is no longer true, so it was replaced (not just deleted) with three tests proving the new invariant holds regardless of `RAZORPAY_KEY_ID`'s value: absent, placeholder-shaped, and the explicit opt-in path. The `it.fails` placeholder flipped to plain `it`.
19. Added `tests/security/payments-config.test.ts` — direct unit tests of both exported functions (snapshot/restore env per test), covering the two exit-gate criteria an HTTP-level test can't reach cleanly: mock mode forced off under `NODE_ENV=production` even with the flag set, and the boot assertion throwing/not-throwing across production × complete/incomplete env.
20. First full run: 6/6 files, 29 passed, 1 todo (SEC-1's still-open `it.fails`, correctly untouched — Phase 3's job).
21. Ran `npx tsc --noEmit -p server/tsconfig.json` — clean. Ran `grep -rn "rzp_test_placeholder\|dummy_key" server/src` — zero matches (exit-gate criterion; the string still appears in `payment-binding.test.ts` as fixture data proving it's now ignored, which is expected and out of the `server/src` scope the gate specifies).
22. Manually verified the boot assertion outside the test framework too, not just via the unit test: ran `assertRequiredPaymentEnv()` directly under `NODE_ENV=production` with both vars deleted via `tsx -e`, confirmed it throws the expected message.
23. Re-ran the full suite a second time for determinism — identical result.

## Verification Items

| Manifest ID | Verification target | Expected result |
|---|---|---|
| RI1 | `npm run test --workspace=server` from a clean schema | Exits 0; ≥1 test per money path (order create, verify-payment, webhook confirm, coupon apply, RMA refund) |
| RI1 | `npx tsc --noEmit -p server/tsconfig.json` | Exits 0 |
| RI6 | Validation-error regression test | Payment-endpoint validation failure returns 400 with field errors, not 500 |

## Command Results

| Command | Area | Outcome | Notes |
|---|---|---|---|
| `npm install --workspace=server -D vitest supertest @types/supertest` | repo root | pass | 16 packages added; 19 pre-existing npm audit findings (up from 17 recorded in the prior chain's F3 — two more from these devDeps), not acted on, out of scope |
| `npx vitest run --root server` (first attempt) | repo root | **fail** | cwd mismatch — `process.cwd()` was repo root, not `server/`; `getStoreConfig()` resolved a nonexistent path one level too high. Not a code defect; wrong invocation. |
| `npm run test --workspace=server` | repo root | **pass** (after fixes in steps 5, 8, 10 above) | `Test Files 5 passed (5)`, `Tests 22 passed \| 1 todo (23)`, ~8s |
| `npm run test --workspace=server` (repeat run) | repo root | **pass** | Identical result — confirms determinism, not a lucky pass |
| `npx tsc --noEmit -p server/tsconfig.json` | repo root | **pass** | No output — zero errors |
| `git status --short --branch` (post-implementation) | repo root | pass | Diff is exactly the declared Phase 1 scope: `server/package.json`, `package-lock.json`, `server/src/index.ts` modified; `server/tests/`, `server/vitest.config.ts` new. No unrelated files touched. |
| `npm run test --workspace=server` (Phase 2, first run) | repo root | **pass** | `Test Files 6 passed (6)`, `Tests 29 passed \| 1 todo (30)` |
| `npx tsc --noEmit -p server/tsconfig.json` (Phase 2) | repo root | **pass** | No output — zero errors |
| `grep -rn "rzp_test_placeholder\|dummy_key" server/src` | repo root | **pass** | Zero matches (grep exit code 1 = no match). String remains only in `server/tests/security/payment-binding.test.ts` as fixture data, outside the gate's `server/src` scope. |
| `NODE_ENV=production npx tsx -e "...assertRequiredPaymentEnv()..."` with both vars deleted | `server/` | **pass** | Threw `Missing required payment environment variable(s) in production: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET` — confirmed outside the test framework, not just via the unit test |
| `npm run test --workspace=server` (Phase 2, repeat run) | repo root | **pass** | Identical result — determinism check |
| `git status --short` (post-Phase-2) | repo root | pass | Diff matches declared Phase 2 scope exactly: `env.ts`, `order.routes.ts`, `rma.service.ts`, `setup.ts`, `payment-binding.test.ts` modified; `payments.ts`, `payments-config.test.ts` new. `index.ts` NOT touched (see Implementation Log #15). |
| `git commit` (Phase 2) | repo root | pass | `b0fcaa6`; `check-commit-coverage: ok` — every changed file traced to this task artifact's Changed Files |
| `npm run test --workspace=server` (Phase 3, first run) | repo root | **pass** | `Test Files 7 passed (7)`, `Tests 39 passed \| 1 todo (40)` |
| `npx tsc --noEmit -p server/tsconfig.json` (Phase 3) | repo root | **pass** | Clean on first attempt |
| `npm run test --workspace=server` (Phase 3, repeat run) | repo root | **pass** | Identical result — determinism check |
| `git status --short` (post-Phase-3, not committed per user instruction) | repo root | pass | Diff matches declared Phase 3 scope exactly: `order.routes.ts`, `webhook.routes.ts`, `payment-binding.test.ts` modified; `payment-confirmation.service.ts`, `payment-confirmation.test.ts` new |
| `npm run test --workspace=server` (Phase 4, first run) | repo root | **pass** | `Test Files 8 passed (8)`, `Tests 44 passed \| 1 todo (45)` |
| `npx tsc --noEmit -p server/tsconfig.json` (Phase 4) | repo root | **pass** | Clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` (Phase 4) | repo root | **pass** | Clean — confirms the frontend contract-change edit typechecks |
| `npm run test --workspace=apps/web -- checkout` | repo root | **pass** | 5/5 tests, unmodified — proves the frontend fetch-call change didn't break existing coverage |
| `npm run test --workspace=apps/web` (full suite) | repo root | **pass** | 5 files, 16 tests |
| `npm run test --workspace=server` (Phase 4, repeat run) | repo root | **pass** | Identical result — determinism check |
| `git status --short` (post-Phase-4, not committed) | repo root | pass | Diff matches declared Phase 4 scope: `coupon.routes.ts`, `order.routes.ts` (cumulative w/ Phase 3), `webhook.routes.ts` (cumulative w/ Phase 3), `rma.service.ts`, `checkout/page.tsx`, `rma-refund.test.ts`, `payment-binding.test.ts` (cumulative) modified; `money-correctness.test.ts` new |
| `npm run test --workspace=server` (Phase 5, after fixing own test bug) | repo root | **pass** | `Test Files 8 passed (8)`, `Tests 52 passed (52)`, **0 todo** — first time in this chain |
| `npm run test --workspace=server` (Phase 5, repeat run) | repo root | **pass** | Identical — determinism check |
| `npx tsc --noEmit -p server/tsconfig.json` (Phase 5) | repo root | **pass** | Clean |
| `npm run build --workspace=server` | repo root | **pass** | Full `tsc` build (not just `--noEmit`), clean |
| `npm run build` (full monorepo: server + apps/web + apps/admin) | repo root | **pass** | All three build successfully; `apps/web` prerendered 21 routes including `/checkout` (the Phase 4 contract-change edit), `apps/admin` prerendered 12 routes |
| `git status --short` (post-Phase-5, not committed) | repo root | pass | Cumulative Phase 3-5 diff: 9 files modified, 3 new product files, 3 new test files — matches every phase's declared Changed Files with nothing extra |

## Dispatch Log

none

## Architecture Notes

- role: Senior Engineer
- decision: characterization tests assert today's behavior, defects included, each labelled with its finding ID and owning phase — following the pattern already proven in the prior `arb-remediation` chain's Phase 1, rather than inventing a new harness shape.
- decision: fixtures mint session cookies directly rather than calling `/auth/login`, to avoid `authLimiter`'s shared in-memory rate limit (5 req/15min outside `NODE_ENV=development`) poisoning the suite. Auth middleware coverage is preserved; login itself keeps one dedicated test.
- decision: test schema is dropped and rebuilt per run via `prisma db push` rather than `migrate deploy`, per plan assumption A4 (F1 migration drift — `CouponUsage` has no creating migration; `OrderItem`/`orderitem` case mismatch). Real fix is Epic 5 scope, not this chain.
- constraint: Phase 1 touches no payment/coupon/webhook/RMA logic — only test infrastructure and the `index.ts` boot guard, which is inert outside `NODE_ENV=test`.
- downstream: Phase 2 will flip the SEC-2/TD-2 `it.fails` assertions in `payment-binding.test.ts` to plain `it`. Phase 3 will flip the SEC-1 assertions in the same file. Phase 4 will flip the TD-7 assertion in `rma-refund.test.ts`. Phase 5 adds raw-body-specific tests to `webhook.test.ts` without removing the characterization of current behavior until R3 lands.
- decision (Phase 3): `confirmPayment()` throws a typed `PaymentConfirmationError` (message/code/statusCode) rather than importing `createError`/Express types directly — keeps the service testable in isolation (as `payment-confirmation.test.ts` does, with no HTTP layer involved) and lets each route translate it to whatever error shape that route already uses.
- finding (new, Phase 3): the SEC-1 "legitimate happy path" HTTP-level test cannot itself reach `PAID` — turning off `PAYMENTS_MOCK` to get real signature verification also turns on R1's layer-2 `razorpay.payments.fetch()` call, which then hits Razorpay's real API with a fake payment id and correctly fails closed. This is not a defect; it's why `payment-confirmation.test.ts` exists as a separate, `vi.mock('razorpay')`-backed file — proving a genuine non-mock confirmation requires controlling the fetch response, which an HTTP-level test through the real route can't do without a live Razorpay sandbox. Recorded so Review doesn't mistake the HTTP-level test's 502 assertion for an unfixed bug.
- constraint honored (Phase 3): stock-restore loops in `webhook.routes.ts`'s `payment.failed`/`refund.created` cases were left exactly as they were (non-transactional, Epic 2/S-05 territory) — only the audit-log write was added, in its own transaction with the status update.
- finding (new, not in brief/plan): `server/.env`'s `RAZORPAY_KEY_ID` is a real-looking dev value, not placeholder-shaped — a fresh checkout without this harness's explicit override would silently leave mock mode and hit the live Razorpay API. This is itself a small instance of the SEC-2/TD-2 pattern (env-shape-driven mock detection producing surprising behavior) and is exactly what R2's explicit `PAYMENTS_MOCK` flag replaces in Phase 2. No action taken beyond the test-harness override; flagging for Phase 2's awareness.
- finding (new, not in brief/plan): order creation's mock-mode gate (`order.routes.ts:185`) and verify-payment's mock-mode gate (`order.routes.ts:265-267`) are not the same check — creation only matches placeholder-shaped strings, verify-payment also treats an *unset* key as mock. Both are in scope for R2's single shared switch (plan Phase 2); recorded here as evidence the two gates already disagree today, which is part of what R2 is fixing.
- finding (new, not in brief/plan): `getStoreConfig()` (`server/src/utils/config.ts:105`) resolves `Store.config.json` via `path.join(process.cwd(), '..', 'config', ...)` — correct only when the process's cwd is `server/`, which `npm run dev --workspace=server` sets but a bare `npx vitest` from repo root does not. Same underlying pattern as TD-11's "cwd-relative/duplicate config" finding from the assessment. Not touched — out of this chain's scope — but the harness's test script must always be invoked as `npm run test --workspace=server` (or an equivalent that sets cwd to `server/`), never `npx vitest` from repo root, or order-creation tests will spuriously fail on an unrelated config-loading error.
- Phase 2 confirms the Phase-1 finding above (mismatched mock gates) precisely: order creation's gate and verify-payment's gate really did disagree before this phase, and both now delegate to the same `isPaymentsMockMode()`. No new disagreement found once unified.
- `rma.service.ts`'s own `PrismaClient` (documented `ponytail: DEBT` at the top of the file) does not import `../config/env` — so if any future code path imports `RmaService` without the main app (`index.ts`) having imported first, the boot assertion added in this phase would not have run yet for that path. Not a regression introduced here (the debt predates this chain) and out of scope to fix, but worth flagging: the boot assertion's guarantee is tied to `index.ts`'s import order, not to every module that touches Razorpay.

## Blockers

none

## Process Note (user-directed deviation from plan branch strategy)

2026-07-25 — user instruction: implement Phases 3, 4, and 5 sequentially without committing after each one (deviating from the plan's stated "Build commits locally only, per phase" strategy used for Phases 1–2, commits `edc79ff`/`b0fcaa6`). Commit only after all three phases are implemented **and** Review and Test have both passed. This task artifact still records each phase's Implementation Log, Command Results, and Phase Completion Log entry as it lands, exactly as before — only the `git commit` step is deferred. If Review or Test fails and requires a fix that changes Build's output, that fix is recorded here before the eventual commit, not folded in silently.

## Phase Completion Log

| Phase | Status | Completed | Notes |
|---|---|---|---|
| Phase 1 — Test harness and characterization baseline | **exit gate met** | 2026-07-25 | `npm run test --workspace=server`: 5/5 files, 22 passed, 1 todo (twice, for determinism); `npx tsc --noEmit -p server/tsconfig.json`: clean. Committed locally as `edc79ff`. Three findings recorded above for Phase 2's benefit; none block Phase 2. |
| Phase 2 — Fail-closed payment configuration | **exit gate met** | 2026-07-25 | `npm run test --workspace=server`: 6/6 files, 29 passed, 1 todo (twice, for determinism); `tsc --noEmit`: clean; `grep -rn "rzp_test_placeholder\|dummy_key" server/src`: zero matches; boot assertion manually verified outside the test framework. Committed locally as `b0fcaa6`, `check-commit-coverage: ok`. Two findings recorded for later phases; none block Phase 3. |
| Phase 3 — Shared confirmation service: binding and audit trail | **exit gate met** | 2026-07-25 | `npm run test --workspace=server`: 7/7 files, 39 passed, 1 todo (twice, for determinism); `tsc --noEmit`: clean. **Not committed yet** — per user instruction, holding Phases 3-5 uncommitted until Review and Test both pass. |
| Phase 4 — Money correctness | **exit gate met** | 2026-07-25 | `npm run test --workspace=server`: 8/8 files, 44 passed, 1 todo (twice, for determinism); `tsc --noEmit` clean on both server and web; web's own suite green (16/16). Contract change to `coupon.routes.ts` shipped with its frontend caller update in the same phase (finding #35). Coupon-concurrency guard added beyond what Phase 3 alone provided (finding #36). **Not committed yet.** |
| Phase 5 — Webhook raw-body HMAC (isolated) | **exit gate met** | 2026-07-25 | `npm run test --workspace=server`: 8/8 files, **52 passed, 0 todo** (twice, for determinism) — first fully-green run of this chain. `tsc --noEmit` clean. Full monorepo `npm run build` (server + web + admin) clean, satisfying the plan's explicit build-gate requirement for this phase. Protected-path edit to `webhook.routes.ts` made under the brief's recorded Q1 approval. **Not committed yet — all of Phases 3-5 now complete, proceeding to Review and Test per user instruction; commit follows both passing.** |
