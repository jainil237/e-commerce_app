---
slug: arb-remediation
version: 1
artifact: brief
status: draft
created: 2026-07-19
updated: 2026-07-19
manifest_ids: [R1, R2, R3, R4, R5, R6, R7, RI1, RI2, RI3, RI4, RI5]
upstream: []
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
---

# ARB Assessment Remediation — Brief

## Source Links

- `docs/product/architecture-review-board-assessment-2026-07-19.md` (authoritative findings; SEC-*, TD-*, R-* epic IDs referenced below)
- `docs/product/architecture-audit-and-refactor-plan.md` (prior audit; overlapping register)
- Repo policy: `.claude/CLAUDE.md` — `server/src/routes/webhook.routes.ts` and `server/prisma/schema.prisma` are protected paths

## Problem

The 2026-07-19 ARB assessment found that the platform's revenue path has exploitable and correctness-critical defects: payment verification does not bind the Razorpay order to the DB order (SEC-1), signature checks fail open on env misconfiguration (SEC-2), webhook HMAC is computed over a re-serialized body (SEC-3), stock is hard-decremented at order creation with no reclaim (TD-4/INV-1), coupon and audit-log behavior drifts between the two payment-confirmation paths (TD-5/TD-6), and GST asymmetry can over-refund returns (TD-7). There is no test suite or CI to protect any fix (TD-9).

## Goals

Remediate the P0 tier of the assessment as a sequenced program:

1. Payment confirmation hardening (assessment epic R-1).
2. Inventory integrity via activation of the existing `StockReservation` model (epic R-2).
3. A minimal test + CI safety net targeted at the money paths, landed *before or alongside* the fixes it protects (epic R-5, scoped down).
4. Pricing/refund correctness (discount clamping, GST-consistent refunds — epic R-4). Per Q3 answer: refunds equal what was charged, applied to new RMAs only.
5. Commerce service-layer extraction (epic R-3): `OrderService` / `CouponService` / `InventoryService` following the existing `RmaService` pattern, sharing the single `utils/prisma` client — added to scope per Q1 answer.

## Non-Goals

- Frontend data layer (R-8), operational baseline (R-6), config unification (R-7) — deferred to later chains.
- Any accessibility, styling, or frontend-architecture work from the prior audit.
- Migrating off Express 5 beta or multer (tracked, not in scope).
- Multi-region/HA work.

## User Impact

- Customers: orders can no longer be marked paid fraudulently; abandoned checkouts stop causing phantom stock-outs; webhook-confirmed orders behave identically to client-confirmed ones.
- Store operator: coupon quotas enforced consistently; refunds never exceed what was charged; audit trail complete for disputes.

## Success Metrics

- A replayed valid signature against a different order is rejected (automated test).
- Abandoned PENDING orders release stock within `inventory.reservationDurationMinutes` with no manual action.
- Razorpay test-console webhook passes signature verification against the raw body.
- CI runs lint + typecheck + money-path test suite on every PR.

## Requirements

See manifest.

## Constraints

- `server/src/routes/webhook.routes.ts` is a protected path — R1's raw-body change requires explicit user approval before Build (Q2).
- `server/prisma/schema.prisma` is protected — R2 should reuse the existing `StockReservation` model without schema change if possible; any migration needs approval.
- No destructive DB commands; all work on a feature branch, PR to `main`.
- Payment/checkout logic changes broadly require explicit user approval per repo constraints — this brief and its plan checkpoint are the approval vehicle.
- No test infrastructure exists today; R5 must introduce tooling (vitest/supertest + disposable MySQL) from zero.

## Risks

- Changing verification order-binding could reject in-flight legitimate payments if the client sends inconsistent ids — mitigate with logging-first rollout or careful client audit.
- Reservation activation changes availability semantics for `snapshot`/`validate-checkout`; frontend cart UX must be checked for regressions.
- GST refund fix (R6) changes refund amounts — a product/finance decision, not purely engineering (Q3).
- Webhook raw-body change, if wrong, breaks the async confirmation path entirely; needs a verified test against Razorpay's signing scheme before merge.

## Open Questions

Mirrored as Q IDs below; Q1–Q3 are blocking.

## Requirement Manifest

### Explicit (R)

- **R1 — Payment confirmation hardening (SEC-1/2/3, TD-1/2/3).**
  Bind submitted `razorpayOrderId` to `order.razorpayOrderId`; verify amount; fail closed on missing keys (explicit `PAYMENTS_MOCK` flag refused in production); webhook HMAC over raw body.
  Acceptance: test proves cross-order signature replay is rejected; server refuses to boot in `NODE_ENV=production` without real Razorpay keys unless `PAYMENTS_MOCK=true` is explicitly set to a non-production guard; Razorpay test webhook verifies successfully.
- **R2 — Inventory reservations (TD-4).**
  Order creation reserves stock via `StockReservation` (ACTIVE, expiry from `inventory.reservationDurationMinutes`); payment confirmation converts; expiry job releases and cancels stale PENDING orders; availability = stock − active reservations everywhere it is read.
  Acceptance: integration test — create order, let reservation expire, stock is available again and order is CANCELLED with an audit row; concurrent checkout test shows no oversell.
- **R3 — Unified confirmation semantics (TD-5/TD-6).**
  One code path (shared service function) for "order becomes paid" used by both `verify-payment` and the webhook; coupon check+increment atomic; every status transition writes `OrderAuditLog`.
  Acceptance: coupon usage identical via either path (test); grep/CI check that order-status mutations in these routes go through the shared function; audit rows asserted in tests for confirm/cancel.
- **R4 — Discount clamping (TD-5).**
  `discount ≤ subtotal + shippingCharge`; total never negative.
  Acceptance: unit test with FLAT coupon larger than cart.
- **R5 — Test + CI foundation, money-path scope (TD-9).**
  Vitest + supertest harness with disposable MySQL; suites covering R1–R4 and RMA refund idempotency; GitHub Actions on PR: lint, tsc, tests.
  Acceptance: CI green on the feature branch; failing any R1–R4 acceptance test fails CI.
- **R6 — Refund amount correctness (TD-7).**
  Refund per item derives from the charged (GST-inclusive) amount, not unitPrice + GST recomputed. Applies to RMAs created after the change; open RMAs keep existing math (per Q3 answer).
  Acceptance: test — refund for a full single-item return equals what the item contributed to the paid total; an open pre-existing RMA's refund amount is unchanged.
- **R7 — Commerce service layer (assessment epic R-3, added per Q1).**
  Extract `OrderService`, `CouponService`, `InventoryService` following the `RmaService` idiom (transactional, audit-writing, single shared `utils/prisma` client). The RMA files' private `PrismaClient` instances are consolidated in the same pass (TD-11 pool debt). Route handlers for order create/verify/cancel, coupon apply, and stock mutations delegate to these services; strangler-fig for the rest of `admin.routes.ts`.
  Acceptance: no `prisma.order.update` or stock mutation outside the services in the touched routes (grep check in CI); exactly one `PrismaClient` constructed in `server/src`; all R1–R6 acceptance tests still pass through the service layer.

### Implicit (RI)

- **RI1 — Protected-path discipline.** No edits to `webhook.routes.ts` or `schema.prisma` before recorded user approval. Acceptance: approvals recorded in this brief/plan before Build touches them.
- **RI2 — Branch policy.** All work on a non-default branch, shipped via PR using the user's PR template. Acceptance: PR exists; no direct pushes to `main`.
- **RI3 — Behavior preservation outside scope.** No changes to RMA flows, admin routes, or frontend beyond what R2 availability reads require. Acceptance: review diff scope check.
- **RI4 — Evidence policy.** Every phase-complete claim backed by command output or artifact citation. Acceptance: verify artifact cites runs.
- **RI5 — No secrets in artifacts.** Acceptance: artifacts contain env var names only, never values.

### Assumptions (A)

- **A1** — The assessment document is accepted as the finding source of truth; no re-audit needed in this chain.
- **A2** — `inventory.reservationDurationMinutes` (15) in `config/store.config.json` is the intended reservation TTL.
- **A3** — The existing `StockReservation` schema is sufficient (no migration) — Plan must verify field adequacy before committing to this.
- **A4** — GitHub Actions is an acceptable CI provider (repo is on GitHub per `gh` usage); Plan confirms remote.

### Open Questions (Q)

- **Q1 — Scope confirmation.** ANSWERED 2026-07-19: P0 + service layer (assessment epic R-3 included as R7). Ops baseline, config unification, frontend work stay deferred.
  Owner: user. Blocking: resolved.
- **Q2 — Protected-path approval.** ANSWERED 2026-07-19: approved — `webhook.routes.ts` may be edited in this chain; a `schema.prisma` migration is pre-approved only if Plan demonstrates the existing `StockReservation` model is insufficient.
  Owner: user. Blocking: resolved.
- **Q3 — Refund policy decision.** ANSWERED 2026-07-19: refunds equal the charged (GST-inclusive) amount; applies to RMAs created after the fix; open RMAs keep old math.
  Owner: user. Blocking: resolved.
- **Q4 — Rollout style for R1 binding check.** Hard-reject immediately vs. log-only observation window first?
  Owner: user. Blocking: no — Plan defaults to hard-reject (behind an env-flag escape hatch) if unanswered.

## Questions For User

Q1–Q3 answered at brief-review checkpoint (recorded in the manifest above). Outstanding, non-blocking:

1. **(Q4)** Payment binding check: reject immediately, or log-only for a few days first? Plan defaults to immediate hard-reject with an env-flag escape hatch.

## Architecture Notes

- role: Architect
- decision: treat remediation as one Complex chain with four workstreams (payments, inventory, correctness, safety-net) rather than seven separate chains — the workstreams share the same code paths and test harness, and sequencing matters (tests land first).
- decision: R5 (tests/CI) is a prerequisite gate, not a follow-up — no payment-path fix merges without a failing-then-passing test.
- decision: reuse the dormant `StockReservation` model instead of designing a new mechanism; the schema already anticipated this (assessment TD-4).
- constraint: two protected paths sit at the center of the work; approval is a hard gate before Build.
- tradeoff considered and rejected: patching SEC-1 alone as a Trivial hotfix — rejected because the duplicated confirmation path (webhook) would retain the drift, and an untested hotfix to payments contradicts the evidence policy. The lazy fix and the correct fix are the same: one shared confirmation function.
- assumption for Plan to verify: A3 (reservation schema adequacy), A4 (CI provider), and whether the checkout client sends `razorpayOrderId` consistently (affects R1 rollout risk).
- decision (post-checkpoint): scope expanded to include the service layer (R7) per user answer to Q1 — the confirmation-path unification (R3) will be built *as* the service layer rather than a standalone helper, avoiding a double refactor.
- downstream: Plan must sequence R5 harness → R1 → R3/R7 → R2 → R4/R6; Build will need a disposable MySQL setup; Test phase cannot be waived (Complex class); Ship is likely stacked PRs (safety net → payments → reservations → services) — Plan decides.

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs resolved (Q1–Q3 answered at brief-review checkpoint, 2026-07-19); orchestration.blockers empty.
- [x] User approved: scope (P0 + service layer), protected-path edits (webhook + conditional migration), refund policy (as-charged, new RMAs only).
