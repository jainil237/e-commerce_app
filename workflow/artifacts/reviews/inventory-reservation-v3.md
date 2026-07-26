---
slug: inventory-reservation
version: 3
artifact: review
status: final
created: 2026-07-26
updated: 2026-07-26
manifest_ids: [R1]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
  - workflow/artifacts/plans/inventory-reservation-v1.md
  - workflow/artifacts/tasks/inventory-reservation-v1.md
  - workflow/artifacts/reviews/inventory-reservation-v2.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Inventory Reservation — Review v3

## Scope

Review v2 (`ready-for-next-phase`, recommendation `pass`) approved the design where `createReservations()` locked (`SELECT ... FOR UPDATE`), validated, and inserted each reservation row in one function, called from inside `prisma.$transaction` after `tx.order.create`. This v3 review covers an uncommitted delta on top of that approved state, in `server/src/routes/order.routes.ts` and `server/src/services/inventory.service.ts`, not yet seen by any prior review.

The delta splits that single function into two:
- `reserveStock(orderItems, tx)` — locks each `Product` row and validates availability only. Called **before** `tx.order.create`.
- `createReservations(orderId, orderItems, userId, tx)` — inserts the `StockReservation` rows only, no locking or validation. Called **after** `tx.order.create`, once `orderId` exists.

Stated reason: `Order.items` create implies an FK-driven shared lock on `Product` at `tx.order.create` time. Under the old ordering (`order.create` → lock+validate+insert), two concurrent transactions for the same product could each pick up the shared lock via their `OrderItem` insert first, then both block trying to upgrade to the exclusive `FOR UPDATE` inside the old `createReservations` — a MySQL 1213 deadlock. Moving the exclusive lock acquisition before `order.create` means only one lock type is ever contested per transaction.

## Findings

none

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |

## Requirement Coverage

| Manifest ID | Evidence | Status | Notes |
|---|---|---|---|
| R1 | `inventory.service.ts:104-172` (`reserveStock` + `createReservations`), `order.routes.ts:206-253` (call sites, transaction ordering) | covered | Same requirement v2 already marked `covered`; this delta changes only the internal locking order, not the requirement's external contract (reserve at creation, don't decrement). All other manifest IDs (R2-R6, RI1-RI6) are untouched by this diff — out of scope for this review, still `covered` per v2. |

## Architecture Notes

- role: Staff Reviewer
- decision: treat this as a scoped re-review of R1's implementation only. The diff does not touch `convertReservations`, `restoreStock`, `releaseReservations`, availability computation, or any route other than `order.routes.ts`'s creation path — so R2-R6/RI1-RI6 coverage from v2 stands unchanged and is not re-verified here.
- decision: confirmed the lock-then-create ordering is correct by inspection — `reserveStock` runs first in `prisma.$transaction`, taking `FOR UPDATE` on each `Product` row (sorted by `productId`, consistent with `convertReservations`/`restoreStock`'s existing deadlock-avoidance convention) before `tx.order.create` can acquire any FK-implied shared lock. `createReservations` runs after `order.create`, using the real `orderId`, and does no locking of its own — correct, since `reserveStock` already holds the exclusive lock for the remainder of the transaction.
- constraint: `getEffectiveAvailability` call inside `reserveStock` (line 128) correctly passes `requesterKey: undefined` — excludes nothing, matching the "new claim on stock" contract documented in both the function's own comment and the pre-check comment in `order.routes.ts:75-78`. This is the same exclusion-consistency defect that v1's review caught and 76d65fa fixed (now `76d65fa` is the committed ancestor); the split preserves the fix.
- constraint: `Promise.all` in `createReservations` (line 158-171) is safe here — no locking or read-then-write race, purely inserting a batch of already-validated `StockReservation` rows tied to a single `orderId`.
- tradeoff: none new. The split is a pure internal refactor for correctness (deadlock elimination); no requirement, contract, or response shape changed. `order.routes.ts`'s public API surface, response body, and error codes are unchanged.
- assumption Test must verify: the concurrent-order test (`checkout.test.ts` "P0 regression guard: two concurrent orders for the last unit yield exactly one reservation") exercises this exact lock-ordering path and passes, but a two-*distinct*-product concurrent scenario (verifying the sorted-lock-order convention actually prevents cross-product deadlocks, not just same-product contention) is not present in the current suite — flagged as residual risk, not a finding, since the existing single-product concurrency test already covers the specific deadlock this diff fixes.
- downstream — Test: full suite (72/72) and `tsc --noEmit` already run clean against this exact diff (evidence below); Test phase should still execute its own explicit pass per the lifecycle gate rather than rely on this review's ad hoc run.
- downstream — Ship: no contract, schema, or dependency change — this diff carries no additional deploy risk beyond what v2 already assessed.

## Verification Reviewed

| Item | Outcome | Notes |
|---|---|---|
| `cd server && npm run test` | 72/72 passed, 9/9 test files | Includes `checkout.test.ts` (9 tests, concurrent-reservation regression guard) and `inventory.service.test.ts` (9 tests) against the current uncommitted diff |
| `rtk tsc --noEmit -p server` | No errors | Type-checks the split `reserveStock`/`createReservations` signatures and both call sites |
| `rtk npm run lint --workspace=server` | No script | `server` workspace has no `lint` script defined (pre-existing; not introduced by this diff) |
| Manual read of `inventory.service.ts` (full file) and `order.routes.ts:1-270` | Reviewed | Confirmed lock-before-create ordering, sorted-lock convention, exclusion-consistency, no other call sites reference the old single-function signature |

## Residual Risk

- No automated test exercises a concurrent order spanning two *different* products to confirm the sorted-lock-acquisition convention prevents cross-product deadlocks (only same-product contention is covered). Low likelihood given the convention is already proven for `convertReservations`/`restoreStock`, but not directly evidenced for `reserveStock`. Carry to Test phase as an optional addition, not a blocker.
- `StockReservation` rows for expired-but-unswept reservations remain a known, previously-accepted housekeeping gap (Q1 in the brief) — unaffected by this diff, restated here only because it's adjacent to the code touched.

## Recommendation

pass
