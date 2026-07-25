---
slug: oversell-race-fix
version: 1
artifact: task
status: complete
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/oversell-race-fix-v1.md
  plan: workflow/artifacts/plans/oversell-race-fix-v1.md
orchestration:
  phase: build
  status: complete
  next_phase: review
  blockers: []
---

# Build Task — Fix the overselling race (Story 1.2)

## Completed Work

### Phase 1 (R1) — Reproduction script
`server/scripts/oversell-race-check.ts`: spawns an isolated server instance (mock Razorpay,
port 4999), seeds a fixture product at `stock = 1`, fires N concurrent
`POST /api/v1/orders`, asserts exactly one success and non-negative final stock, tears fixtures
down.

**Ran against unmodified code first** — required gate before touching the fix:
`successes=10 insufficient_stock=0 other=0 final_stock=-9` at N=10. Confirms the race exactly as
analysed in the brief.

### Phase 2 (R2) — Atomic guarded decrement
`server/src/routes/order.routes.ts:67-83`: replaced the sorted `SELECT … FOR UPDATE` loop +
compare-then-decrement with a single guarded `tx.product.updateMany({ where: { id, stock: {
gte: quantity } }, data: { stock: { decrement: quantity } } })` per item, items processed in
`productId` order (same deadlock-avoidance ordering the old raw-lock loop used).
`result.count === 0` → `INSUFFICIENT_STOCK`, same error code and shape as before (RI1).

### Phase 3 (R3) — DB-level invariant
`server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql`:
`ALTER TABLE Product ADD CONSTRAINT Product_stock_non_negative CHECK (stock >= 0)`.
`schema.prisma` deliberately unchanged — Prisma neither expresses nor introspects CHECK
constraints (per plan).

Pre-flight (RI2), run before writing the migration: `SELECT COUNT(*) FROM Product WHERE stock <
0` → `0`; `SELECT VERSION()` → `9.6.0` (constraint requires MySQL 8.0.16+; satisfied).

## Evidence

| Check | Result |
|---|---|
| Race reproduced pre-fix (N=10) | `successes=10`, `final_stock=-9` — confirmed broken |
| Race fixed post-fix (N=10) | `successes=1`, `insufficient_stock=9`, `final_stock=0` |
| Repeated ×3 more (N=10) | Stable — 1 success, `final_stock=0` each run |
| Higher concurrency (N=15) | `successes=1`, `insufficient_stock=14`, `final_stock=0` |
| `npx prisma migrate deploy` | `2 migration(s) deployed` (RMA migration from prior branch + this one); `migrate status` → "Database schema is up to date!" |
| Constraint enforcement | Direct `UPDATE Product SET stock = -1` on a fixture row → rejected by MySQL (verified, then reverted via fixture cleanup) |
| `npm run build --workspace=server` | Passes, no tsc errors |
| `npm run lint --workspace=server` | No `lint` script exists (V1-10, pre-existing repo-wide gap) — recorded, not silently skipped |

## Changed Files

- `server/src/routes/order.routes.ts` — atomic guarded stock decrement (R2)
- `server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql` — CHECK constraint (R3)
- `server/scripts/oversell-race-check.ts` — concurrency reproduction + regression guard (R1)

## Out of scope (unchanged, per plan)

- Stock-leak-on-post-tx-failure (Razorpay/order.create run after the decrement tx closes) —
  flagged for a follow-up brief, not fixed here.
- `StockReservation` dead code / documentation drift (V1-2) — unchanged.
- Stories 1.1, 1.3, V1-11 — separate lifecycles.
