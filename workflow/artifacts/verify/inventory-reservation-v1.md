---
slug: inventory-reservation
version: 1
artifact: verify
status: final
created: 2026-07-26
updated: 2026-07-26
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
  - workflow/artifacts/plans/inventory-reservation-v1.md
  - workflow/artifacts/tasks/inventory-reservation-v1.md
  - workflow/artifacts/reviews/inventory-reservation-v2.md
  - workflow/artifacts/reviews/inventory-reservation-v3.md
orchestration:
  phase: test
  status: ready-for-next-phase
  next_phase: ship
  blockers: []
  user_checkpoint: none
---

# Inventory Reservation — Verification

## Inputs

- Committed diff at `3859a8e` on `inventory-reservation` (deadlock fix reviewed in `inventory-reservation-v3.md`, `pass`).
- Prior full-chain review `inventory-reservation-v2.md` (`pass`), covering R1-R6/RI1-RI6 against the pre-deadlock-fix implementation.
- Live end-to-end run against a running `server` (port 4000, `PAYMENTS_MOCK=true`) and MySQL dev database, exercising the actual reservation → conversion path with real HTTP requests, not just the automated suite.

## Automated Checks

| Command | Outcome | Evidence |
|---|---|---|
| `cd server && npm run test` | 72/72 passed, 9/9 test files | Includes `checkout.test.ts` (concurrent-order regression guard), `inventory.service.test.ts`, `webhook.test.ts`, `payment-confirmation.test.ts` |
| `rtk tsc --noEmit -p server` | No errors | Type-checks the split `reserveStock`/`createReservations` signatures |
| `npx prisma migrate status` | 0 pending | No schema drift; `schema.prisma` untouched by this chain (protected path, RI3) |
| Manual curl-based concurrency test (see Manual QA) | Confirmed correct behavior | Real MySQL, real transaction, no mocked Prisma client |

## Manifest Coverage

| Manifest ID | How Verified | Evidence | Result | Notes |
|---|---|---|---|---|
| R1 | command + manual | `checkout.test.ts` P0 guard; live concurrent-order curl test below | pass | Re-verified after the deadlock-fix split (review v3); no deadlock, exactly one reservation created, loser correctly rejected |
| R2 | command (inherited from v2) | `inventory-reservation-v2.md` R2 row | pass | Untouched by this chain's diff; re-confirmed no new `Product.stock` mutation site introduced (`reserveStock`/`createReservations` split touches locking/insert only, not availability computation) |
| R3 | command + manual | `inventory-reservation-v2.md` R3 row; live payment confirmation below | pass | Manual run: reservation `ACTIVE → CONVERTED`, `Product.stock` decremented 1→0 only at `verify-payment`, not at order creation |
| R4 | command (inherited from v2) | `inventory-reservation-v2.md` R4 row | pass | Untouched by this chain's diff |
| R5 | command (inherited from v2) | `inventory-reservation-v2.md` R5 row | pass | Untouched by this chain's diff |
| R6 | manual (inherited from v2) | `inventory-reservation-v2.md` R6 row | pass | Untouched by this chain's diff |
| RI1 | command | 72/72 tests passing against the current committed diff | pass | Re-ran fresh this pass, not trusted from review |
| RI2 | command | `git diff main..HEAD -- apps/web apps/admin` empty | pass | Confirmed directly: no UI files in this chain's history, including the v3 deadlock-fix commit |
| RI3 | command (inherited from v2) | `inventory-reservation-v2.md` RI3 row; `npx prisma migrate status` clean this pass | pass | No new migration in the v3 delta |
| RI4 | manual | Reviewed diff and both artifacts (v3 review, this verify) for credentials/secrets | pass | None present |
| RI5 | command | `git log --oneline -5` shows local commits only, no push performed | pass | |
| RI6 | manual | Live concurrent-order test below is a direct, fresh regression guard for the oversell/double-reservation race, run against real MySQL rather than the test suite's mocked/in-process transaction handling | pass | Strengthens RI1's coverage — this is real network + real DB, not just Vitest |

## Manual QA

| Scenario | Environment | Steps | Expected | Observed | Outcome |
|---|---|---|---|---|---|
| Concurrent order creation for last unit (R1, RI6) | Local server (port 4000), MySQL dev DB, `PAYMENTS_MOCK=true`, two fresh registered users each with an address, one product seeded with `stock: 1` | Fired two `POST /api/v1/orders` requests concurrently (same process, `curl ... & curl ... & wait`) for the same product/quantity, from two different authenticated users | Exactly one order succeeds with a reservation created; the other receives `INSUFFICIENT_STOCK`; no MySQL deadlock (error 1213) in server logs | Order A succeeded (`ORD-1785058388275-YR63O`, one `ACTIVE` `StockReservation` row); Order B received `400 INSUFFICIENT_STOCK` from `reserveStock` (`inventory.service.ts:132`); `grep -i "deadlock\|1213" server.log` returned no matches | pass |
| Reservation conversion at payment confirmation (R3) | Same session, immediately after the above | `POST /api/v1/orders/verify-payment` for the winning order with a mock payment ID (signature check skipped under `PAYMENTS_MOCK=true`) | `StockReservation.status` transitions `ACTIVE → CONVERTED`; `Product.stock` decrements from 1 to 0; order `status: CONFIRMED`, `paymentStatus: PAID` | Verified via direct Prisma query post-request: reservation `status: "CONVERTED"`, `Product.stock: 0`; API response `{"status":"CONFIRMED","paymentStatus":"PAID"}` | pass |
| Storefront checkout UI walkthrough | apps/web (port 3000) | Not run — see Skipped Checks | n/a | n/a | skipped |

Test data (2 users, 1 order, 1 product) created for this run was deleted from the dev database after verification (`stockReservation`, `orderItem`, `orderAuditLog`, `order`, `product` rows for the test IDs only).

## Generated Output Evidence

not applicable

## Findings

none

## Skipped Checks

| Check | Why Skipped | Risk | Owner | Blocks Ship |
|---|---|---|---|---|
| Live Chrome walkthrough of the storefront checkout flow | Claude's Chrome browser extension was not connected in this environment (no live-browser access this session); user confirmed proceeding without it | Low — this chain has zero `apps/web`/`apps/admin` diff (RI2, confirmed above), so there is no UI code path this fix could regress. The manual curl-based end-to-end test already exercises the exact `POST /api/v1/orders` and `POST /api/v1/orders/verify-payment` contracts the checkout page calls, with the same request/response shape | user | no |

## Architecture Notes

- role: Senior QA
- decision: ran a live, real-database, real-HTTP verification in addition to the automated suite specifically for R1/RI6 — the deadlock this chain fixes only manifests under actual MySQL row-locking contention across two real transactions; Vitest's existing concurrency test already proves this, but an independent out-of-suite reproduction (fresh users, fresh product, real server process) removes any doubt that the fix depends on test-harness-specific transaction timing.
- constraint: `PAYMENTS_MOCK=true` was set only as a process environment variable for this verification session (`server/.env` untouched) — required to exercise order creation and verify-payment without live Razorpay credentials; per `payments.ts`, this flag is hard-disabled when `NODE_ENV=production`, so it carries no deploy risk.
- constraint: no UI code exists in this diff to verify (RI2) — the skipped Chrome check has no code surface to have caught a regression in.
- downstream — Ship: no contract, schema, dependency, or UI change in this chain's final state; Ship's stated deploy note (no infra change, no new env var, reservation rows never physically swept) from the brief still holds.
- downstream — Reflect: the two carried-forward follow-ups (duplicate `Store.config.json`/`config/store.config.json`, and a physical sweeper for stale `ACTIVE` rows) remain open, unaffected by this verification pass.

## Sign-Off

- Verifier: Claude (agentsmyth Test phase, Senior QA role)
- Date: 2026-07-26
- Recommendation: ship
