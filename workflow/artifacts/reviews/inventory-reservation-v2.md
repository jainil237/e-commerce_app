---
slug: inventory-reservation
version: 2
artifact: review
status: ready-for-next-phase
created: 2026-07-26
updated: 2026-07-26
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
  - workflow/artifacts/plans/inventory-reservation-v1.md
  - workflow/artifacts/tasks/inventory-reservation-v1.md
  - workflow/artifacts/reviews/inventory-reservation-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Inventory Reservation & Stock Integrity — Review (Round 2, independent re-verification)

This is a fresh, independent review of the current diff — not a re-reading of the v1 review's own annotations. Every finding below was reached by re-reading the actual code and re-running verification, without trusting the v1 artifact's claims of what was fixed.

## Findings

### P3-1 — Order-creation pre-check used the wrong exclusion key, wasting a Razorpay call in a fixable case

- **Path:** `server/src/routes/order.routes.ts` (pre-check block, ~line 75)
- **Manifest IDs:** R1 (non-blocking on it)
- **Problem:** The best-effort pre-check (added in the P0-1 fix to fail fast before the Razorpay API call) called `getEffectiveAvailability(productIds, req.user!.id)` — excluding the requester's *own* active reservations, the same semantics correct for `/validate-checkout` but wrong here. A user attempting a second order for a product they already fully reserved would pass this pre-check (their own hold invisible to them), trigger an unnecessary Razorpay order-creation call, and only then be rejected by the authoritative atomic check inside `createReservations` (which correctly excludes nothing). Not a correctness bug — the authoritative gate still catches it — but it defeats the pre-check's own stated purpose (avoid needless Razorpay calls) in exactly the scenario the P0-1/P1-3 fixes were about.
- **Resolution (applied during this review, 2026-07-26):** Fixed — pre-check now calls `getEffectiveAvailability(productIds, undefined)`, matching the authoritative check's exclusion semantics. Verified: `npm run test --workspace=server` still 72/72, `tsc --noEmit` clean, `npm run build` clean.

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 1 (fixed during this review) |

## Requirement Coverage

| Manifest ID | Evidence | Status | Notes |
|---|---|---|---|
| R1 | `createReservations()` locks the product row (`SELECT ... FOR UPDATE`) and checks `getEffectiveAvailability` inside the same transaction as the insert, per item, before writing (`inventory.service.ts:104-149`); `order.routes.ts`'s reservation call sits inside the same `$transaction` as `order.create` | covered | Re-read in full this pass; concurrency test (`checkout.test.ts` "P0 regression guard") and same-user test both pass |
| R2 | `getEffectiveAvailability()` is now the single availability source for `/validate-checkout`, order creation, and confirmation re-validation | covered | Verified no other file in `server/src` mutates `Product.stock` (`grep -rn "\.stock\b" server/src` shows only reads and admin catalog-stock-setting, both out of scope) |
| R3 | `convertReservations()` keyed by `orderId`; single decrement point; re-validation excludes only the confirming order's own reservation via `excludeOrderId`, not every reservation the user holds | covered | `excludeOrderId` unit test directly proves the sibling-order case that was P1-3 |
| R4 | `releaseReservations()`/`restoreStock()` wired into cancel (both payment states) and both webhook events (`payment.failed`, `refund.created`) | covered | All four paths now have a dedicated test: cancel-unpaid (pre-existing), cancel-paid (new), webhook payment.failed unpaid→release (new), webhook payment.failed paid→restore (new), webhook refund.created→restore (new) |
| R5 | Re-validation in `payment-confirmation.service.ts`: product-active check, then availability check, both before `convertReservations` | covered | Three dedicated tests: deactivated product, expired-and-insufficient, expired-but-available. Happy path covered by pre-existing mock-mode test |
| R6 | `CLAUDE.md` lines 90-91, 140 describe the reservation-based flow accurately | covered | Re-read against shipped code; matches |
| RI1 | 72 server tests pass (62 original + 10 across two fix rounds), covering every phase's exit-gate scenario from the plan | covered | Independently re-ran the full suite this pass, not just trusted the reported count |
| RI2 | `apps/web` has zero source changes across the whole chain; `git diff main..HEAD -- apps/web` is empty | covered | Confirmed directly, not inferred |
| RI3 | `schema.prisma` diff limited to `orderId String?` + `@@index([orderId])` + `Order.stockReservations` relation; migration is nullable column + index + FK only | covered | Re-read the migration SQL directly this pass — no backfill, no destructive statement |
| RI4 | No credentials, tokens, keys, or connection strings in the diff or any artifact | covered | |
| RI5 | Two real commits exist on `inventory-reservation`; `git log origin/inventory-reservation..HEAD` — branch has no upstream yet, so nothing has been pushed by construction | covered | |
| RI6 | Oversell-race regression guard — concurrent order-creation test is a real, currently-passing regression guard | covered | Re-ran it directly this pass rather than trusting the prior pass's report |

## Architecture Notes

- role: Staff Reviewer
- decision: recommend `pass` — every P0/P1 from the v1 review is independently verified fixed by re-reading the code (not the artifact's own claims), and the one new finding (P3-1) was small enough to fix inline within this review rather than round-trip back to Build for a one-line change.
- constraint: verified no other code path in `server/src` writes `Product.stock` outside `inventory.service.ts` — the single-owner invariant from the plan's Approach §2 holds by inspection, not just by convention.
- residual risk carried forward (not a blocker): `POST /api/v1/cart/snapshot` (`cart.routes.ts`, labeled "Frontend Inventory Source of Truth") returns raw `product.stock` as `availableQty`, not `getEffectiveAvailability`'s effective figure. It is read-only and does not affect the authoritative order-creation gate, so it cannot cause an oversell — but if the frontend uses it for a "N left" display, that number can read higher than what a subsequent order attempt will actually honor. This endpoint was not in the approved plan's Repo Impact Map (only `/validate-checkout` was), so fixing it here would be undocumented scope creep against a plan that named its exact touch points. Flagging for a future chain rather than fixing silently.
- assumption Test must verify: the plan's per-phase exit-gate assertions are now all backed by real tests (RI1) — Test's job is to confirm the suite is stable under repeated runs and check for any flakiness in the concurrency test (`Promise.all` against a real Vitest/Prisma test DB), not to write new coverage.
- downstream — Ship: the migration (`orderId` column + index + FK, nullable, no backfill) still needs to run in each target environment before this ships; rollback is a plain column/FK drop with no data loss, as the v1 plan already stated. Ship should also carry the Notion handoff the plan's Source-of-Truth Strategy section describes (Epic 2 checkboxes closed by R1-R6).

## Verification Reviewed

| Item | Outcome | Notes |
|---|---|---|
| `npx tsc --noEmit -p server/tsconfig.json` | Clean | Ran directly this pass |
| `npm run test --workspace=server` | 72/72 pass, 9 test files | Ran directly this pass, both before and after the P3-1 fix |
| `npm run build` | All 3 workspaces compile | Ran directly this pass, after the P3-1 fix |
| `grep -rn "\.stock\b" server/src --include="*.ts"` (excluding `inventory.service.ts`) | Only reads (`cart.routes.ts` display fields, `/snapshot`) and admin catalog stock-setting (`admin.routes.ts`) | Confirms the single-stock-owner invariant; surfaced the `/snapshot` residual risk above |
| `git diff main..HEAD -- apps/web` | Empty | Confirms RI2 directly, not by trusting the task artifact |
| `git log --oneline main..HEAD` | 2 commits (`feat(server): reserve stock...`, `test(server): cover webhook release/restore...`) | Confirms RI5 — real commits exist, matching what the task artifact claims |
| `server/src/services/inventory.service.ts` (read in full) | Locking, exclusion, and conversion logic all consistent with the plan's Approach and the v1 review's fix descriptions | No discrepancy found between claimed and actual fix |
| `server/src/routes/order.routes.ts` (read in full) | Reservation creation correctly inside the order-creation transaction; pre-check had the P3-1 issue, now fixed | |

## Residual Risk

- `POST /api/v1/cart/snapshot` returns raw stock, not effective availability (see Architecture Notes). Non-blocking; recommend a follow-up chain if the frontend surfaces this number to shoppers as a live count.
- No load/concurrency test harness beyond Vitest's single-process `Promise.all` simulation exists in this repo. That is sufficient to catch the specific P0-1 regression shape (a non-atomic check-then-write) but would not catch every possible concurrency bug under real multi-process load.

## Recommendation

pass
