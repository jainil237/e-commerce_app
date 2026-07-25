---
slug: oversell-race-fix
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  parent_brief: workflow/artifacts/briefs/mvp-gap-analysis-v2-acceptance-criteria.md
  parent_story: "STORY 1.2 · Fix the overselling race (lines 148-163)"
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  task_class: standard
---

# Brief — Fix the overselling race (Story 1.2)

Slice-scoped Think artifact carved out of the program-level `mvp-gap-analysis` brief, which covers
20 stories across 6 waves and is too broad to plan as one unit. Scope here is Wave 0, Story 1.2 only.

## Problem

Concurrent checkouts can oversell stock and drive `Product.stock` negative, accepting orders that
cannot be fulfilled. Ranked #1 in the parent brief's recommended order of work: silent data
corruption on the money path.

## Evidence (static, file:line)

`server/src/routes/order.routes.ts`
- `:53` products read **outside** the transaction
- `:69` transaction opens
- `:71-73` `SELECT … FOR UPDATE` row locks, ids sorted at `:68`
- `:78` `product.stock < item.quantity` — compares the **pre-lock** copy
- `:83-86` decrement

Locks serialise writes; they do not refresh the compared value. Both concurrent requests see
`stock: 1`, both pass, both decrement.

`server/prisma/schema.prisma:60` — `model Product { stock Int @default(0) }`: no non-negativity
constraint, so nothing stops the invariant being violated by this or any future path.

## Requirements

| ID | Requirement | Source |
|---|---|---|
| R1 | Reproduce the race and prove the reproduction fails against current code | AC "must fail against the current code before the fix lands" |
| R2 | Validation and decrement become atomic; exactly one of N concurrent orders succeeds; stock never negative | AC-1, AC-2 |
| R3 | A DB-level `stock >= 0` constraint (or equivalent) enforces the invariant independently of app code | AC-3 |
| RI1 | Existing single-order checkout behaviour, response shape, and `INSUFFICIENT_STOCK` error code unchanged | AC-4 |
| RI2 | No destructive DB action; migration must not fail on pre-existing data | Repo constraint |

## Assumptions

- MySQL 8.0.16+ (CHECK constraint support) — **to be verified in Build, not assumed**; if false, R3
  is unmet and requires a waiver rather than a claimed pass.
- Dev DB is an acceptable target for a data-mutating concurrency script.

## Known adjacent defect — deliberately out of scope

The decrement transaction closes at `:88`; Razorpay (`:192`) and `order.create` (`:203`) run after
it. A failure in either leaks decremented stock with no order and no restore. Real defect, outside
Story 1.2's AC, changes checkout's transaction boundary — recorded for a follow-up brief.

## Non-goals

Story 1.1 / 1.3 / V1-11, the `StockReservation` soft-lock (V1-2) and its documentation drift,
and any test-framework introduction (Story 6.5).
