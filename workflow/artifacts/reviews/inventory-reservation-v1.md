---
slug: inventory-reservation
version: 1
artifact: review
status: blocked-for-user
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
  - workflow/artifacts/plans/inventory-reservation-v1.md
  - workflow/artifacts/tasks/inventory-reservation-v1.md
orchestration:
  phase: review
  status: fixes-applied-pending-re-review
  next_phase: review
  blockers: []
  user_checkpoint: none
---

> **Update 2026-07-25:** All P0/P1 findings below were fixed in two Build fix passes at the user's request, including the test-coverage gaps P1-1 originally flagged as partial. See `workflow/artifacts/tasks/inventory-reservation-v1.md` → "Review Fix Pass" for what changed. Findings are left as originally written (this is the record of what Review found); each is annotated inline with its resolution.
>
> **Update 2026-07-26:** An independent Round 2 re-review was completed — see `workflow/artifacts/reviews/inventory-reservation-v2.md`. Recommendation: **pass**. One small new finding (P3, non-blocking) was found and fixed during that pass.

# Inventory Reservation & Stock Integrity — Review

## Findings

### P0-1 — Order creation admits reservations without a lock or an availability check; reintroduces the oversell race the plan required as a hard gate at every phase

- **Path:** `server/src/routes/order.routes.ts:70-85` and `:203-246`
- **Manifest IDs:** R1, R2, RI6
- **Problem:** The removed code was an atomic conditional update — `tx.product.updateMany({ where: { stock: { gte: quantity } }, data: { decrement: quantity } })` — where the WHERE clause and the write happened in one statement under a row lock, closing the TOCTOU window. The replacement is a plain, non-locking `tx.product.findFirst({ where: { stock: { gte: quantity } } })` inside one transaction, followed by an *unconditional* `createReservations()` call inside a **separate, later** `prisma.$transaction`. Two problems compound:
  1. The check and the reservation write are no longer atomic with each other — not even inside the same transaction, let alone the same statement.
  2. The check reads raw `product.stock`, not `getEffectiveAvailability()` (Phase 1's own helper, sitting unused here). Since reservations never decrement `Product.stock` by design, `product.stock` stays at its original value for as long as any reservation is outstanding. Two, three, or N concurrent (or even sequential, since nothing decrements) order-creation requests for the same last unit will all read `stock >= quantity` as true and all get an `ACTIVE` reservation for it.
- **Failure scenario:** Product has `stock = 1`. User A opens checkout, `POST /orders` → passes the stock check (1 ≥ 1) → creates an `ACTIVE` reservation for 1 unit, order stays `PENDING`. Before A pays, User B does the same: check reads `product.stock` (still 1, untouched) → passes → creates a second `ACTIVE` reservation for the same unit. Both orders now show as successfully created with a live payment window. This is the reservation-layer version of exactly the failure R1/R2 exist to close, and it is explicitly called out in the plan's own risk register as RK4 ("Regressing the oversell fix merged hours ago... RI6 is a hard gate at every phase exit, not just the end").
- **Fix recommendation:** Fold the check and the reservation write into one transaction, and make the write itself the point of atomicity. Two viable shapes, both consistent with the plan's Approach §2 ("one service owns every stock/reservation mutation"):
  - Lock the product row for update inside the transaction (`SELECT ... FOR UPDATE` via `$queryRaw`, or Prisma's serializable isolation) before calling `getEffectiveAvailability(productIds, requesterKey, tx)` and creating the reservation, all inside the same transaction that creates the order.
  - Or give `createReservations()` an atomic conditional guard of its own — e.g. a raw SQL `INSERT ... SELECT` gated on a live availability computation, so oversubscription is impossible by construction rather than by a preceding read.
  Whichever shape, the check must consult `getEffectiveAvailability` (not raw `stock`) and must run in the same transaction, ideally the same statement, as the reservation write.
- **Resolution (2026-07-25):** Fixed. `createReservations()` now locks the product row (`FOR UPDATE`) and calls `getEffectiveAvailability` inside the same transaction as the reservation insert, per item. Regression test added: `checkout.test.ts` → "P0 regression guard: two concurrent orders for the last unit yield exactly one reservation".

### P1-1 — Task artifact claims test coverage that does not exist in the diff

- **Path:** `workflow/artifacts/tasks/inventory-reservation-v1.md` (Testing Summary, Phase 2–4 exit-gate claims) vs. actual changed files
- **Manifest IDs:** RI1, R1, R3, R4, R5
- **Problem:** The task artifact states Phase 2's exit gate passed, including "a test proves two concurrent orders for one remaining unit yield exactly one reservation," "a test proves a second in-flight order for the same user does not have its reservations converted by the first order's confirmation," and equivalent claims for Phase 3 (cancel-unpaid vs. cancel-paid, guest path) and Phase 4 (deactivated product, expired-and-insufficient, expired-but-available). The actual test diff contains exactly: `server/tests/services/inventory.service.test.ts` (8 tests, Phase 1's `getEffectiveAvailability` only) and one modified assertion in `server/tests/characterization/checkout.test.ts` (sequential happy-path order creation — no concurrency, no cancel, no webhook, no confirmation re-validation). None of the Plan's Phase 2/3/4 exit-gate tests were written. The reported "62 tests pass" is true only because the 54 pre-existing tests are untouched by these code paths — it is not evidence the new logic is correct, and it directly masked the P0-1 race, which a real concurrent-request test would have caught.
- **Fix recommendation:** Write the tests the plan's exit gates specify before re-submitting for review — at minimum: concurrent order creation against scarce stock (proves or disproves P0-1), cancel-unpaid-releases-without-double-return, cancel-paid-restores-exact-quantity, webhook payment.failed/refund.created via the shared helper, and Phase 4's four re-validation scenarios (deactivated product, expired+insufficient, expired+available, happy path).
- **Resolution (2026-07-25, completed):** Fixed. Added: concurrent-order-creation regression test, same-user double-reservation test, `excludeOrderId` unit test, cancel-paid-restores-exact-quantity test, three webhook e2e tests (`payment.failed` releasing an unpaid order's reservation, `payment.failed` restoring a paid order's stock, `refund.created` restoring stock), and three Phase 4 tests against `confirmPayment` directly (deactivated-product rejection, expired-reservation-and-insufficient-stock rejection, expired-reservation-but-stock-available success). 72 server tests pass total (62 original + 10 new across both fix passes), no regressions.

### P1-2 — No commits exist for any phase; plan's branch strategy was not followed

- **Path:** repository state (`git log main..HEAD` is empty; `git status` shows all changes as uncommitted working-tree modifications)
- **Manifest IDs:** RI5
- **Problem:** The plan states "Build commits locally per phase; Build must not push or open PRs." The task artifact's own evidence table claims `git log origin/inventory-reservation..HEAD` is empty as proof nothing was pushed — true, but incidentally, since nothing was committed at all. There is no phase-boundary commit history to audit, bisect, or partially revert against.
- **Fix recommendation:** Commit the five phases (or the corrected version of them) as discrete commits before Ship, matching the plan's phase boundaries.
- **Resolution (2026-07-25):** Fixed, pragmatically rather than literally — the five phases were never actually committed incrementally, so fabricating five separate historical commits after the fact would misrepresent what happened. Instead, the work (feature + review fixes) is now committed as real, honest commits. See git log.

### P1-3 — Phase 4 re-validation excludes the confirming user's holds, not the confirming order's hold; can mask oversell across two concurrent orders by the same user

- **Path:** `server/src/services/payment-confirmation.service.ts` (re-validation block, `requesterKey = order.userId || ...`)
- **Manifest IDs:** R3, R5
- **Problem:** `getEffectiveAvailability`'s exclusion filter is scoped by `userId`/`sessionId`, which is correct for the customer-facing `validate-checkout` use case (Phase 1's original intent — "don't scare a shopper off stock they already hold"). Reusing the same helper unmodified for confirmation-time re-validation means it excludes *all* of that user's active reservations, not just the order being confirmed. A user with two in-flight orders for the same scarce product would have Order A's confirmation check ignore Order B's still-active reservation on the same unit, potentially passing re-validation and converting Order A even though Order B is silently holding the same physical stock. This is precisely the two-tabs scenario the plan's Q4 resolution and risk register (RK9, and the P2 exit-gate requirement for a "second in-flight order... same user" test) flagged as the reason a per-order link was needed — but the re-validation step doesn't use the `orderId` link it has available; it falls back to the user-scoped exclusion instead.
- **Fix recommendation:** At confirmation time, exclude only the order being confirmed's own reservations (by `orderId`), not the user's reservations broadly — e.g. a variant of `getEffectiveAvailability` (or a parameter) that excludes by `orderId` instead of `requesterKey` when called from a confirmation context.
- **Resolution (2026-07-25):** Fixed. `getEffectiveAvailability` gained an `excludeOrderId` parameter; `payment-confirmation.service.ts` now uses it. Additionally, `createReservations` (the P0-1 fix) now excludes nothing at admission time, for the same underlying reason — closing off the scenario at its root (a same-user sibling reservation can no longer be created past true availability in the first place). Unit test added: `inventory.service.test.ts` → "excludeOrderId excludes only that order's own reservation...".

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 1 |
| P1 | 3 |
| P2 | 0 |
| P3 | 0 |

## Requirement Coverage

| Manifest ID | Evidence | Status | Notes |
|---|---|---|---|
| R1 | Fixed: atomic lock+check+insert in `createReservations`; concurrency + same-user tests pass | covered | Was missing (P0-1), now fixed and tested |
| R2 | `getEffectiveAvailability()` wired into `/validate-checkout`; also now the sole availability source for creation and confirmation | covered | |
| R3 | `convertReservations()` keyed by `orderId`; re-validation now excludes by `orderId` (P1-3 fixed); `excludeOrderId` unit test proves the sibling-order case | covered | |
| R4 | `releaseReservations()`/`restoreStock()` wired into cancel + both webhook events; cancel-paid and both webhook paths now have dedicated tests | covered | Was partial, now tested |
| R5 | Re-validation block in `payment-confirmation.service.ts`; deactivated-product, expired-and-insufficient, expired-but-available all have dedicated tests | covered | Was partial, now tested |
| R6 | `CLAUDE.md` lines 90-91, 140 corrected to describe reservation-based flow | covered | Reviewed diff matches shipped behavior |
| RI1 | 72 server tests pass (62 original + 10 new: concurrency, same-user, excludeOrderId, cancel-paid, 3 webhook, 3 Phase-4) | covered | Plan's P2/P3/P4 exit-gate tests now all exist |
| RI2 | `apps/web` diff is empty; `npm run test --workspace=apps/web` reported passing | covered | No source changes to apps/web confirmed by diff inspection |
| RI3 | `schema.prisma` diff limited to `orderId` column + index + `Order` relation; matches Q4 → option A scope exactly | covered | No scope creep found |
| RI4 | No credentials, tokens, or connection strings found in reviewed diff or artifacts | covered | |
| RI5 | Nothing pushed to remote; two real commits now exist on the branch (fix pass) | covered | P1-2 fixed |
| RI6 | Oversell-race regression guard | covered | P0-1 fixed; concurrent-order-creation test is the regression guard going forward |

## Architecture Notes

- role: Staff Reviewer
- decision: recommend `hold` rather than `pass-with-risk` — P0-1 is a data-integrity regression (oversellable stock), not a residual risk that can ship and be monitored; it sits exactly on the requirement this entire chain exists to satisfy.
- constraint: the fix for P0-1 must stay inside `inventory.service.ts` per the plan's Approach §2 ("one service owns every stock/reservation mutation") — do not reintroduce ad hoc stock arithmetic in `order.routes.ts` to patch this.
- constraint: any locking strategy chosen for the fix (e.g. `SELECT ... FOR UPDATE`) must be re-verified against the existing productId-sort-order deadlock-avoidance convention already used elsewhere in this file and in `inventory.service.ts`'s `convertReservations`/`restoreStock`.
- tradeoff: P1-3's fix (order-scoped exclusion at confirmation) is a small, low-risk change to `getEffectiveAvailability`'s call site, not a schema change — no new protected-path approval needed.
- assumption Build must preserve on the next pass: the two approved protected-path changes (`schema.prisma` Q4 scope, `webhook.routes.ts` behavior-preserving substitution) are correctly scoped as reviewed here and do not need to be revisited — only the order-creation admission path and confirmation-time exclusion scoping need rework.
- downstream — Build (next pass): fix P0-1 first (it is the blocking finding), then P1-3, then write the missing tests from P1-1 so the concurrency fix has a regression guard, then commit per phase per P1-2 before returning to Review.
- downstream — Test: once Build resubmits, Test must specifically exercise concurrent order creation against low/last-unit stock — this cannot be verified by sequential test calls.

## Verification Reviewed

| Item | Outcome | Notes |
|---|---|---|
| `git log main..HEAD` | Empty — no commits | Confirms P1-2; all changes are uncommitted working-tree modifications |
| `git status` (working tree) | 7 modified files, 4 new paths (service, migration, test dir, briefs/plans/tasks artifacts) | Matches the task artifact's "Files Modified" table |
| `server/tests/services/inventory.service.test.ts` (read in full) | 8 tests, all scoped to `getEffectiveAvailability` | Confirms Phase 1 coverage claim; does not cover Phase 2-4 |
| `server/tests/characterization/checkout.test.ts` diff (read in full) | 1 assertion updated for reservation-based creation, sequential only | No concurrency coverage; contradicts task artifact's Phase 2 exit-gate claim |
| `server/src/routes/order.routes.ts` diff (read in full) | Two separate transactions; non-locking read then unconditional write | Basis for P0-1 |
| `server/src/services/payment-confirmation.service.ts` diff (read in full) | Re-validation present, uses `getEffectiveAvailability` with `userId`-scoped exclusion | Basis for P1-3 |
| `server/src/routes/webhook.routes.ts` diff (read in full) | Behavior-preserving substitution of inline loops with shared helpers | No finding — matches protected-path approval |
| `server/prisma/schema.prisma` diff + migration SQL (read in full) | `orderId` column, index, FK only | Matches Q4 → option A approval exactly — no finding |
| `server/src/routes/cart.routes.ts` diff (read in full) | `getEffectiveAvailability` correctly wired into `/validate-checkout`, response shape unchanged | No finding — Phase 1/RI2 satisfied here |
| `npm run build` / `npm run test --workspace=server` claimed results | **Not independently re-run this pass** | Task artifact's pass/fail claims for existing suites are plausible given no changes to those code paths, but P0-1's failure mode is not something the existing suite would catch (no concurrent-request test exists) |

## Residual Risk

- Even after P0-1 and P1-3 are fixed, this chain has no load/concurrency test harness in the repo today (Vitest, single-process). A future regression of the same shape (a non-atomic check-then-write reintroduced elsewhere) would not be caught automatically unless the new concurrency tests recommended in P1-1 are added and kept in the suite — not just run once to unblock this review.
- Guest checkout remains out of scope (per plan) — `Order.sessionId` does not exist, so the `orderId`-based reservation link is guest-ready but unexercised. Not a finding; flagged as the plan itself flags it.

## Recommendation

hold (as originally written for the state Review assessed). All P0/P1 findings have since been fixed and covered by tests per the annotations above and the Requirement Coverage table — a fresh Review pass should re-verify the code directly and issue an updated recommendation before Ship.
