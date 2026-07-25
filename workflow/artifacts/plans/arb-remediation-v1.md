---
slug: arb-remediation
version: 1
artifact: plan
status: draft
created: 2026-07-19
updated: 2026-07-19
manifest_ids: [R1, R2, R3, R4, R5, R6, R7, RI1, RI2, RI3, RI4, RI5]
upstream:
  brief: workflow/artifacts/briefs/arb-remediation-v1.md
orchestration:
  phase: plan
  status: blocked-for-user
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# ARB Assessment Remediation — Plan

## Summary

Six-phase execution of the approved brief. The safety net (R5) lands first so every money-path change afterwards is proven by a failing-then-passing test. Payment binding (R1) follows as the highest-severity fix, then the service layer (R7) that R3's unified confirmation path is built into, then reservations (R2), then pricing/refund correctness (R4, R6). Shipped as four stacked PRs so a regression in one workstream does not block the others.

## Inputs

- Approved brief: `workflow/artifacts/briefs/arb-remediation-v1.md` (Q1–Q3 answered, Q4 resolved during planning — see Open Questions).
- Findings source: `docs/product/architecture-review-board-assessment-2026-07-19.md`.
- `workflow/config/verification.yaml` — configured commands: `npm run build` (required), `npm run lint`, `npm run db:migrate`.
- `workflow/config/repo-profile.yaml` — protected paths, public contracts (`server/src/routes/**`), `test_roots: []` (no test infrastructure exists).
- `workflow/config/release.yaml` — PR gate required, CI provider `none`, deployment target `vercel` for `apps/web`.
- Repo inspection: `git remote -v` → `github.com/jainil237/e-commerce_app` (confirms GitHub Actions viability, brief assumption A4).
- Repo inspection: `apps/web/src/app/checkout/page.tsx:189-205` — client sends Razorpay's own `razorpay_order_id` to `verify-payment`.

## Requirement Coverage

| Manifest ID | Covered by phases | Notes |
|---|---|---|
| R1 Payment hardening | P1 (tests), **P2 (owns)** | Binding + amount + fail-closed + raw-body HMAC |
| R2 Reservations | P1, **P4 (owns)** | Depends on P3 InventoryService |
| R3 Unified confirmation | P1, **P3 (owns)** | Built as OrderService, not a standalone helper |
| R4 Discount clamp | P1, **P5 (owns)** | Lands with CouponService |
| R5 Test + CI foundation | **P1 (owns)**, P6 | CI workflow file added P1; green-on-PR evidence at P6 |
| R6 Refund correctness | P1, **P5 (owns)** | New RMAs only (Q3 decision) |
| R7 Service layer | **P3 (owns)**, P4, P5 | Pool consolidation included |
| RI1 Protected-path discipline | P2, P4 | Approvals recorded in brief; migration conditional |
| RI2 Branch policy | **P6 (owns)** | Non-default branch + PRs |
| RI3 Behavior preservation | P3, P4, P5, **P6 (owns)** | Review-phase diff scope check |
| RI4 Evidence policy | all phases, **P6 (owns)** | Every gate cites command output |
| RI5 No secrets in artifacts | all phases | Env var names only |

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `server/vitest.config.ts`, `server/tests/**` | create | R5 | New; `test_roots` is empty today |
| `server/package.json` | modify | R5 | Add `test` script + vitest/supertest devDeps |
| `docker-compose.test.yml` | create | R5 | Disposable MySQL for integration tests |
| `.github/workflows/ci.yml` | create | R5 | lint → tsc → test on PR |
| `server/src/routes/order.routes.ts` | modify | R1, R3, R4 | Binding, amount check, delegate to services |
| `server/src/routes/webhook.routes.ts` | modify | R1, R3 | **PROTECTED** — approved in brief Q2. Raw-body HMAC + shared confirmation |
| `server/src/index.ts` | modify | R1 | `express.raw()` mount for webhook path only; boot-time payment config guard |
| `server/src/services/order.service.ts` | create | R3, R7 | Owns confirm/cancel + audit writes |
| `server/src/services/coupon.service.ts` | create | R4, R7 | Atomic check+increment, clamping |
| `server/src/services/inventory.service.ts` | create | R2, R7 | Reserve/convert/release; availability reads |
| `server/src/services/rma.service.ts` | modify | R6, R7 | Refund math; drop private PrismaClient |
| `server/src/controllers/rma.controller.ts`, `admin.rma.controller.ts` | modify | R7 | Drop private PrismaClient (pool debt) |
| `server/src/routes/cart.routes.ts` | modify | R2 | Availability = stock − active reservations |
| `server/src/jobs/reservation-expiry.ts` | create | R2 | Expiry sweep; in-process scheduler |
| `server/prisma/schema.prisma` | **conditional** | R2 | **PROTECTED** — only if P4 proves model insufficient; migration pre-approved |
| `CLAUDE.md` | modify | RI3 | Correct the reservation/cart drift the assessment documented |

## Source-of-Truth Strategy

Source of truth for findings is `docs/product/architecture-review-board-assessment-2026-07-19.md` (read-only in this chain). No external tracker is configured, so no ticket sync is attempted. `CLAUDE.md` is the update target for documentation drift corrected by this work (reservations become real in P4 — the doc becomes true rather than being edited to match a lie).

## Approach

Build the safety net before touching money. Each phase leaves the tree green and shippable on its own. The service layer is introduced at P3 rather than last, because R3's unified confirmation path *is* the first service — building a standalone helper first and refactoring it into a service later would mean writing the same code twice. Reservations (P4) then have a natural home in `InventoryService` instead of being wired into route handlers that are about to be gutted.

## Phases

### Phase 1 — Safety net

- Manifest IDs: R5 (owns), RI4
- Touches: `server/vitest.config.ts`, `server/tests/**`, `server/package.json`, `docker-compose.test.yml`, `.github/workflows/ci.yml`
- Work: vitest + supertest harness against a disposable MySQL container; seed/reset helper; characterization tests capturing *current* behavior of order create, verify-payment, webhook confirm, coupon apply, RMA refund; CI workflow running lint, `tsc`, and tests on PR.
- Exit gate: `npm run test --workspace=server` exits 0 with ≥1 test per money path listed above, and `.github/workflows/ci.yml` exists and is syntactically valid (`gh workflow view` or `actionlint`).

### Phase 2 — Payment binding and fail-closed verification

- Manifest IDs: R1 (owns), RI1
- Touches: `server/src/routes/order.routes.ts`, `server/src/routes/webhook.routes.ts` (protected, approved), `server/src/index.ts`
- Work: reject when submitted `razorpayOrderId !== order.razorpayOrderId`; verify captured amount against `order.total`; replace implicit mock mode with explicit `PAYMENTS_MOCK` env flag that refuses to activate when `NODE_ENV=production`; mount `express.raw()` for `/api/v1/webhooks/razorpay` and compute HMAC over the raw buffer.
- Exit gate: a test asserting cross-order signature replay returns non-2xx and leaves the target order `PENDING` passes; a test asserting boot fails in production without real keys and without `PAYMENTS_MOCK` passes; an HMAC test using a known raw-body/secret/signature triple passes.

### Phase 3 — Order and coupon service layer, unified confirmation

- Manifest IDs: R3 (owns), R7 (owns), RI3
- Touches: `server/src/services/order.service.ts`, `coupon.service.ts` (new); `order.routes.ts`, `webhook.routes.ts`; RMA service + both RMA controllers
- Work: single `OrderService.confirmPayment(...)` — idempotent, transactional, writes `OrderAuditLog`, increments coupon usage atomically — called by both `verify-payment` and the webhook `payment.captured` branch; `OrderService.cancel(...)` likewise; consolidate all `PrismaClient` construction onto `utils/prisma`.
- Exit gate: a test asserting coupon `usedCount` increments identically via the verify-payment path and the webhook path passes; a test asserting an `OrderAuditLog` row exists after confirm and after cancel passes; `grep -rc "new PrismaClient" server/src` returns 1.

### Phase 4 — Stock reservations

- Manifest IDs: R2 (owns), R7, RI1
- Touches: `inventory.service.ts`, `jobs/reservation-expiry.ts` (new); `order.routes.ts`, `cart.routes.ts`; `schema.prisma` **only if** the existing model proves insufficient
- Work: order creation reserves instead of decrementing; confirmation converts reservation → decrement; expiry job releases reservations and cancels stale `PENDING` orders with an audit row; `snapshot`/`validate-checkout` report `stock − active reservations`. First action of this phase is to evaluate the existing `StockReservation` model against these needs and record the verdict (brief assumption A3).
- Exit gate: a test asserting an expired reservation restores availability and moves the order to `CANCELLED` with an audit row passes; a concurrency test issuing N simultaneous checkouts for stock N-1 shows exactly one failure and no negative stock.

### Phase 5 — Pricing and refund correctness

- Manifest IDs: R4 (owns), R6 (owns), R7
- Touches: `coupon.service.ts`, `order.routes.ts`, `rma.service.ts`
- Work: clamp `discount ≤ subtotal + shippingCharge`; move order totals to `Prisma.Decimal`; derive RMA refund from the item's GST-inclusive contribution to the paid total, applied to RMAs created after this change only (Q3).
- Exit gate: a test with a FLAT coupon exceeding cart value asserts total ≥ 0 and discount capped; a test asserts a full single-item return refunds exactly that item's contribution to `order.total`; a test asserts an RMA row created before the cutoff retains its original refund amount.

### Phase 6 — Review, verify, ship

- Manifest IDs: R5, RI2 (owns), RI3 (owns), RI4 (owns)
- Touches: `CLAUDE.md`; PR metadata
- Work: correct the documented reservation/cart drift in `CLAUDE.md`; run the full configured verification set; open stacked PRs using the user's PR template.
- Exit gate: `npm run build` exits 0; `npm run lint` exits 0 or failures are recorded as accepted risk; full test suite green in CI on the PR; PR URLs recorded in the ship artifact.

## Dependency Order

P1 → P2 → P3 → P4 → P5 → P6. P1 gates everything (no money-path change merges untested). P3 must precede P4 and P5 because both build on `InventoryService`/`CouponService` seams. P2 precedes P3 so the highest-severity fix is shippable independently of the refactor. P6 is terminal.

## Branch Strategy

Base branch `arb-remediation` cut from `main` (current branch `feat/homepage-redesign` is unrelated and must not be built on). One child branch per phase, each PR'd into `arb-remediation`, which PRs into `main`. No commits to `main`. Untracked pre-existing work (`.claude/`, `docs/product/`, `workflow/artifacts/briefs/mvp-*`) is preserved and not staged (repo-profile `dirty_state_policy: record-and-preserve`).

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|
| Binding check rejects legitimate in-flight payments | Low | High | Verified at plan time that the client forwards Razorpay's own `razorpay_order_id` (`checkout/page.tsx:198`); ship behind `PAYMENT_BINDING_ENFORCE` env flag defaulting on | user | R1 |
| Raw-body change breaks the webhook entirely | Medium | High | `express.raw()` scoped to the Razorpay webhook path only; known-triple HMAC test in P2 gate; other routes keep `express.json()` | user | R1 |
| Reservation semantics regress cart/checkout UX | Medium | Medium | Availability change confined to `InventoryService`; manual QA of add-to-cart → checkout → abandon → re-check in P6 | user | R2 |
| Service extraction changes behavior silently | Medium | Medium | P1 characterization tests written against current behavior must still pass after P3 | user | R3, R7 |
| Decimal migration shifts historical totals | Low | Medium | Applies to new orders only; no backfill; existing rows untouched | user | R4 |
| Disposable-MySQL CI proves flaky | Medium | Low | Service container with health gate; retry once; fall back to a documented local-only suite with recorded risk | user | R5 |
| No CI provider configured today (`release.yaml` `provider: none`) | Certain | Low | P1 adds the workflow; `release.yaml` updated to `provider: github-actions` in P6 | user | R5 |

## Verification Plan

| Manifest ID | Evidence | Owner phase | Notes |
|---|---|---|---|
| R1 | command — replay, boot-guard, and HMAC-triple tests | P2 | Plus manual QA of one real Razorpay test-mode checkout |
| R2 | command — expiry test + concurrency test | P4 | Plus manual QA: abandon checkout, confirm stock returns |
| R3 | command — dual-path coupon test, audit-row tests | P3 | |
| R4 | command — over-discount unit test | P5 | |
| R5 | command — `npm run test --workspace=server`; CI run green on PR | P1 / P6 | CI evidence is a PR check URL |
| R6 | command — refund-amount tests incl. pre-cutoff RMA | P5 | |
| R7 | command — `grep -c "new PrismaClient"` = 1; full suite still green | P3 | |
| RI1 | review — protected-path edits traced to brief Q2 approval | P6 | Migration verdict recorded in P4 |
| RI2 | command — `git branch --show-current`, PR URLs | P6 | |
| RI3 | review — diff scope check against Repo Impact Map | P6 | |
| RI4 | review — every gate cites command output | P6 | |
| RI5 | review — artifact scan for env values | P6 | Names only |

Configured commands `npm run build` (required) and `npm run lint` run at P6. `npm run db:migrate` runs only if P4 produces a migration.

## Architecture Notes

- role: Principal Engineer
- decision: safety net first — P1 blocks all money-path changes. The evidence policy forbids claiming a payment fix works without a run, and there is nothing to run today.
- decision: R3 is implemented *as* the service layer (R7) rather than a helper later refactored — one pass instead of two.
- decision: stacked PRs onto an `arb-remediation` integration branch, not one mega-PR — each phase is independently reviewable and revertable.
- decision: Q4 resolved by inspection rather than asking — the client forwards Razorpay's own order id, so hard-reject is safe; an env flag remains as an escape hatch.
- constraint: two protected paths (`webhook.routes.ts` edit approved; `schema.prisma` migration conditionally approved) — P4 must record its model-sufficiency verdict before touching schema.
- constraint: `test_roots` is empty and CI `provider: none` — P1 is greenfield infrastructure, not an extension of existing tooling.
- tradeoff rejected: patching R1 alone as a hotfix — leaves the webhook path drifted and unverified.
- tradeoff rejected: reservations before the service layer — would wire inventory logic into route handlers slated for extraction.
- assumption for Build to verify: A3 (existing `StockReservation` model sufficiency) at the top of P4.
- downstream: Review focuses on protected-path diffs and audit-log coverage; Test cannot be waived (Complex class); Ship produces four PRs plus an updated `release.yaml`.

## Open Questions

- **Q4 — RESOLVED during planning (inspection, not user):** hard-reject immediately. `apps/web/src/app/checkout/page.tsx:198` forwards Razorpay's own `razorpay_order_id`, which matches the stored `order.razorpayOrderId`, so the binding check cannot reject a legitimate payment. An env flag is retained as an operational escape hatch.
- No open blockers. Plan awaits user approval at the `plan-review` checkpoint.

## Exit Gate

- [x] Every active R and RI mapped to a phase with exactly one owning phase.
- [x] Every phase has a binary exit gate.
- [x] Verification plan covers every R and RI.
- [ ] User approved or waiver recorded.
