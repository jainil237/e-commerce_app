---
slug: oversell-race-fix
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/mvp-gap-analysis-v2-acceptance-criteria.md
  brief_predecessor: workflow/artifacts/briefs/mvp-gap-analysis-v1.md
  story: "STORY 1.2 · Fix the overselling race (v2 lines 148-163; v1 finding #1)"
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: awaiting-plan-approval
  task_class: standard
---

# Plan — Fix the overselling race (Story 1.2)

## Objective

Make stock validation and decrement atomic in order creation, so that N concurrent orders against
`stock = 1` yield exactly one success and never negative stock. Backend-only. **Standard.**

## Root cause (verified in code, not inferred)

`server/src/routes/order.routes.ts`:

- `:53` — `prisma.product.findMany(...)` reads products **outside** any transaction.
- `:69` — `prisma.$transaction(...)` opens.
- `:71-73` — `SELECT id FROM Product WHERE id = ? FOR UPDATE`, ids sorted (`:68`) for deadlock avoidance.
- `:78` — `if (product.stock < item.quantity)` compares against the **pre-lock copy** from `:53`.
- `:83-86` — `decrement`.

The row locks serialise the writes but do not refresh the value being compared. Two concurrent
requests for the last unit both hold `stock: 1` in memory, both pass `:78`, both decrement → `-1`,
both orders accepted.

`RI1` — the outer read at `:53` cannot simply be deleted: `:101-114` reuses `products` for
`price`, `gstPercent`, and `name`, and `:63` uses it for the availability check. The fix must keep
the outer read for pricing metadata and stop trusting it for stock.

## Approach — conditional atomic update (AC-2, second option)

Replace the compare-then-decrement with a guarded `updateMany` inside the existing transaction:

```ts
await tx.product.updateMany({
  where: { id: item.productId, stock: { gte: item.quantity } },
  data:  { stock: { decrement: item.quantity } },
})
// count === 0  →  throw createError(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK')
```

The `where` predicate is evaluated by MySQL under the row lock it takes itself, so the read and the
write are one atomic statement — there is no window between them. Chosen over "re-read inside the
tx" (AC-2 option 1) because it is a strictly smaller diff, removes the need for the raw
`FOR UPDATE` loop entirely, and has no read-then-write window at all.

Deadlock safety is preserved by iterating `validatedData.items` **sorted by `productId`**, which
takes locks in the same global order the current `:68` sort does. The raw `FOR UPDATE` loop
(`:71-73`) is then deleted as dead weight.

The product `name` for the error message still comes from the outer `products` array — no extra query.

## Phases

### Phase 1 — Reproduce (R1) — must fail before any fix lands
Add `server/scripts/oversell-race-check.ts`, modelled on the existing
`server/scripts/check-webhook-signature.ts` (repo already uses `scripts/` + `tsx` for one-off
checks; no test framework is installed in `server`, and installing one belongs to Story 6.5).

The script: seeds a product at `stock = 1`, authenticates, fires N concurrent
`POST /api/v1/orders`, then asserts `successes === 1` and final `stock === 0`.

**Exit gate:** script run against unmodified code **fails** (reports >1 success and/or negative
stock). Evidence — captured output — goes in the verify artifact. If it does not fail, the race is
not reproducible as analysed and this plan is wrong; stop and revise rather than "fixing" it anyway.

### Phase 2 — Fix (R2)
`order.routes.ts:67-88` only. Delete the sorted `FOR UPDATE` loop, replace the
compare-then-decrement with the guarded `updateMany`, iterate items sorted by `productId`.
No signature, response-shape, or error-code change (`INSUFFICIENT_STOCK` retained → AC-4).

**Exit gate:** Phase 1 script now reports exactly 1 success, `stock = 0`; `npm run build` passes.

### Phase 3 — Defence in depth (R3, AC-3)
New migration `server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql`:

```sql
ALTER TABLE `Product` ADD CONSTRAINT `Product_stock_non_negative` CHECK (`stock` >= 0);
```

**`server/prisma/schema.prisma` is deliberately NOT edited** — Prisma cannot express CHECK
constraints and does not introspect them, so a raw-SQL migration is the only route and it produces
no schema drift. This keeps the change off the protected-path list.

**Pre-flight (RI2):** `SELECT COUNT(*) FROM Product WHERE stock < 0` must return 0 first — the
`ALTER` fails on existing violating rows. If the dev DB already holds negative stock (plausible,
given the bug), those rows must be corrected and that correction reported, not quietly patched.

**Exit gate:** migration applies; a direct `UPDATE Product SET stock = -1` is rejected by the DB.

## Impacted files

| File | Change |
|---|---|
| `server/src/routes/order.routes.ts` | Atomic guarded decrement; delete raw `FOR UPDATE` loop (`:67-88`) |
| `server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql` | Create — CHECK constraint |
| `server/scripts/oversell-race-check.ts` | Create — concurrency reproduction + verification |
| `server/prisma/schema.prisma` | **No change** (see Phase 3) |

## Approvals required before Build

| Item | Why | Status |
|---|---|---|
| Checkout logic (`order.routes.ts` POST `/`) | `.claude/CLAUDE.md`: no checkout/payment change without explicit approval | Granted at story selection — reconfirm at Build gate |
| DB migration (CHECK constraint) | Repo constraint on DB commands | Non-destructive `ALTER`; needs approval to run `db:migrate` |

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | MySQL CHECK requires **8.0.16+**; silently ignored on older MySQL and on MariaDB pre-10.2 | Assert server version in Phase 3 before relying on it. If unsupported, AC-3 is unmet — record a waiver rather than claiming the constraint exists |
| 2 | Phase 1 script needs a running server + seeded DB; it mutates real data | Run against dev DB only; create and clean up its own product/user |
| 3 | Concurrency bugs can pass a low-N run by luck | Use N ≥ 10 and repeat; a single green run is not evidence |
| 4 | `updateMany` returns `count` — a Prisma/driver change altering that contract would silently disable the guard | Phase 1 script is the regression guard; keep it committed |

## Out of scope (named, not silently dropped)

- **Stock leak on post-transaction failure.** The decrement tx closes at `:88`, but Razorpay
  (`:192`) and `order.create` (`:203`) run **after** it. A failure in either leaves stock
  decremented with no order and no restore path. This is a real, separate defect adjacent to
  Story 1.2, not covered by its AC. **Recommend a follow-up brief** — do not fold it in here, it
  changes checkout's transaction boundary and deserves its own review.
- Story 1.1 (cancellation refund), 1.3 (OTP), V1-11 (migration baseline) — separate lifecycles.
- `StockReservation` soft-lock (V1-2) — still dead code; unchanged by this plan. The
  `CLAUDE.md` claim that checkout uses it remains false after this fix and is documentation drift
  to correct under V1-2, not here.

## Verification plan

| Check | Command | Gate |
|---|---|---|
| Race reproduced pre-fix | `npx tsx server/scripts/oversell-race-check.ts` | Must FAIL before Phase 2 |
| Race fixed post-fix | same | 1 success, `stock = 0` |
| Repeat runs | same, ×3, N=10 | Stable |
| Build | `npm run build` | Exit 0 |
| Lint | `npm run lint` | Known broken repo-wide (V1-10) — record as skipped-with-reason, do not claim it passed |
| DB invariant | `UPDATE Product SET stock = -1 WHERE id = <test>` | Rejected |

## Branch

Current branch `frontend-security-a11y` holds 14 commits of unrelated frontend work. Cut
`fix/oversell-race` from `main` (which is current with `origin/main`) so this ships independently.
Default-branch policy: no direct commits to `main`.
