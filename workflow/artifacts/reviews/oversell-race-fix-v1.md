---
slug: oversell-race-fix
version: 1
artifact: review
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/oversell-race-fix-v1.md
  plan: workflow/artifacts/plans/oversell-race-fix-v1.md
  task: workflow/artifacts/tasks/oversell-race-fix-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Fix the overselling race — Review

## Findings

### F1 — CHECK constraint changes untouched RMA-approval behaviour (P2, non-blocking)

`server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql` adds
`CHECK (stock >= 0)` at the table level, so it applies to **every** write to `Product.stock`, not
only the `order.routes.ts` path this story fixes.

`server/src/services/rma.service.ts:183` (`approveRmaRequest`, REPLACEMENT branch) decrements
stock with no floor guard:
```ts
await tx.product.update({
  where: { id: orderItem.productId },
  data: { stock: { decrement: item.quantity } },
})
```
If an admin approves a replacement for more units than are currently in stock, this write now
**fails at the DB** instead of silently driving stock negative (the prior, latent behaviour).
The failure is caught generically in `admin.rma.controller.ts:50` (`catch (error: any) => res
.status(400).json({ message: error.message })`), so nothing crashes — but `error.message` will be
a raw Prisma/MySQL constraint-violation string, not a clear admin-facing message.

**Net assessment:** this is a data-integrity improvement (loud rejection beats silent corruption)
and not a regression introduced by faulty logic — but it is an out-of-plan behaviour change in a
file Story 1.2 never touched, and the resulting error message is not fit for an admin UI.
**Not blocking** this PR: fixing it means editing `rma.service.ts`, which is outside this story's
approved scope (see plan's Out of Scope section) and deserves its own review. Recommend a
follow-up story: catch the constraint violation (or pre-check stock) in
`approveRmaRequest`'s REPLACEMENT branch and surface `INSUFFICIENT_STOCK`-style messaging.

No other `Product.stock` write sites are affected: `webhook.routes.ts:118,136` and
`admin.routes.ts:646` only `increment`; `rma.service.ts:286` only `increment`.

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 0 |
| P2 | 1 |
| P3 | 0 |

## Requirement Coverage

| Manifest ID | Evidence | Status | Notes |
|---|---|---|---|
| R1 | `server/scripts/oversell-race-check.ts`; task artifact evidence table | covered | Race reproduced pre-fix (10 concurrent → 10 successes, stock=-9) before any fix code was written, per plan's hard gate |
| R2 | `server/src/routes/order.routes.ts:67-83` — guarded `updateMany(where: {stock: {gte: qty}})` inside `$transaction`, replacing stale-read compare-then-decrement | covered | Verified: N=10 ×4 runs and N=15 all show exactly 1 success, final stock 0, no negative stock |
| R3 | `server/prisma/migrations/20260725000000_add_product_stock_check/migration.sql` | covered | Applied via `prisma migrate deploy`; direct `UPDATE Product SET stock=-1` verified rejected by MySQL. Pre-flight (0 violating rows, MySQL 9.6.0) run and recorded before the migration was authored, per RI2 |
| RI1 | Diff of `order.routes.ts` (see below) | covered | `INSUFFICIENT_STOCK` code unchanged, response shape unchanged, no signature change to the route. Bonus: fix also closes a same-order duplicate-line-item oversell that the old stale-read logic had (two line items for one product, same stale `product.stock` compared twice) — not called out in the plan but a strict improvement, no regression |
| RI2 | Task artifact evidence table; `_preflight_check.ts` run recorded (not committed — throwaway) | covered | `SELECT COUNT(*) FROM Product WHERE stock < 0` → 0, `SELECT VERSION()` → 9.6.0, both before `ALTER` ran |

## Architecture Notes

- role: Staff Reviewer
- decision: approach (guarded `updateMany` over re-read-then-compare) matches the plan and is the
  smaller diff of the two options the AC allowed; correctly removes the now-redundant raw
  `FOR UPDATE` loop rather than leaving it as dead code alongside the new guard.
- constraint: `schema.prisma` correctly left unmodified — Prisma has no CHECK-constraint
  representation; putting it in raw migration SQL only was the right call, not a shortcut.
- tradeoff: the reproduction script spawns a whole server process (mock Razorpay, isolated port)
  rather than calling the route handler in-process. Heavier than a unit test, but it's the only
  way to exercise the actual Express + Prisma + MySQL concurrency behaviour under test — an
  in-process call would only prove the JS logic is right, not that MySQL's lock semantics back it.
- risk_identified: F1 above — CHECK constraint's blast radius includes `rma.service.ts`, out of
  plan scope, not fixed here, tracked as a recommended follow-up.
- downstream: this fix does not touch `StockReservation` (V1-2, still dead code) or the
  post-transaction stock-leak on Razorpay/order-create failure (flagged out of scope in the plan)
  — both remain open items for separate lifecycles.

## Verification Reviewed

| Item | Outcome | Notes |
|---|---|---|
| Reproduction fails pre-fix | PASS (as required) | N=10: successes=10, final_stock=-9 |
| Reproduction passes post-fix | PASS | N=10 ×4 runs, N=15 ×1: successes=1, final_stock=0 each time |
| `prisma migrate deploy` | PASS | Applied cleanly; `migrate status` confirms schema up to date |
| CHECK constraint enforcement | PASS | Direct negative `UPDATE` on a fixture row rejected by MySQL |
| `npm run build --workspace=server` | PASS | No tsc errors |
| `npm run lint --workspace=server` | N/A | No `lint` script in this workspace (V1-10, pre-existing repo-wide gap) — recorded as a known gap, not claimed as passing |
| Diff review (this pass) | PASS | No unrelated changes; `git diff --stat` shows only the 3 code files claimed in Changed Files plus lifecycle artifacts |

## Residual Risk

**F1 (see Findings)** — CHECK constraint's effect on `rma.service.ts`'s unguarded replacement
decrement. Owner: follow-up story. Not a blocker: strictly improves data integrity over the prior
silent-corruption behaviour; only the error message quality is degraded, and only in an
admin-only, already-authenticated flow.

**Concurrency script is data-mutating and network-bound.** It spawns a real server process and
creates/deletes real rows in the dev DB. Safe for local/dev use as run in this review; not wired
into CI (Story 6.5, test/lint baseline, is a separate open item in the parent brief).

**MySQL version dependency.** The CHECK constraint requires MySQL 8.0.16+; verified 9.6.0 locally.
If a deploy target runs older MySQL or MariaDB, the migration will fail loudly at `migrate deploy`
time (not silently ignored) — acceptable, but worth confirming against the actual production DB
version before shipping.

## Recommendation

**pass**

Core fix (R1, R2, R3, RI1, RI2) is correct, verified with reproducible before/after evidence, and
stays within its approved scope. One P2, non-blocking finding recorded (F1) with a clear
follow-up recommendation rather than silently expanding this PR's scope to fix it. Ready to
proceed to Test phase.
