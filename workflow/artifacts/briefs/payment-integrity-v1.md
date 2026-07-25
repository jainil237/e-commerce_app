---
slug: payment-integrity
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - user-request
  - notion:Architecture Audit — Epics & Tech Debt Register (2026-07-19) — Epic 1
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
skill_trigger_log:
  - skill: repo-alignment-scan
    decision: ran
    reason: task_class is complex (money path, protected path, public contract) — predicate "task_class != trivial" true. Mapped every Epic 1 claim to the current branch before framing; results in Source Links / Problem.
  - skill: architecture-decision-advisor
    decision: ran
    reason: touches_contract true — server/src/routes/** is a declared public_contract in repo-profile.yaml. Decision recorded in Architecture Notes (single confirmation path vs. duplicated fixes).
  - skill: constraint-conflict-scan
    decision: ran
    reason: touches_protected true — server/src/routes/webhook.routes.ts is a protected path requiring explicit approval. Conflict surfaced as blocking Q1.
---

# Payment Integrity & Fraud Prevention — Brief

## Source Links

- Notion (source of truth): [Architecture Audit — Epics & Tech Debt Register (2026-07-19)](https://app.notion.com/p/3a83d3f7968b81cab9bde9cbfd705899) → **Epic 1 — Payment Integrity & Fraud Prevention**
- `docs/product/architecture-review-board-assessment-2026-07-19.md` — SEC-1, SEC-2, SEC-3, TD-1, TD-2, TD-3, TD-5, TD-6, TD-7
- `docs/product/architecture-audit-and-refactor-plan.md` — S-02, S-16, S-19, S-21, W-07
- Prior chain (same problem space, different base): `workflow/artifacts/briefs/arb-remediation-v1.md`, `.../plans/arb-remediation-v1.md`, `.../tasks/arb-remediation-v1.md`
- Repo policy: `.claude/CLAUDE.md` + `workflow/config/repo-profile.yaml` — `server/src/routes/webhook.routes.ts` and `server/prisma/schema.prisma` are protected paths

## Problem

Three independent paths can mark an order `PAID` without a verified Razorpay charge of the right amount, and the two confirmation paths that exist disagree with each other about coupons and audit logging.

Verified against this branch (`payment-integrity`, cut from `main` @ merge of `frontend-security-a11y`) on 2026-07-25:

| Finding | Location | Confirmed state |
|---|---|---|
| SEC-1 / TD-1 — no order↔Razorpay binding | `server/src/routes/order.routes.ts:283-298` | Order loaded by `{ id, userId }` only. `razorpayOrderId` from the request body is used for the HMAC but **never compared to `order.razorpayOrderId`**, and the captured amount is never checked against `order.total`. **OPEN** |
| SEC-2 / TD-2 / S-16 / S-19 — signature check fails open | `order.routes.ts:265-267`, `services/rma.service.ts:326` | `isMockMode` is derived from the *shape of* `RAZORPAY_KEY_ID` (unset / `rzp_test_placeholder` / `dummy_key`), not from `NODE_ENV` or an explicit flag. `grep PAYMENTS_MOCK` → 0 files. A prod deploy with that var unset silently disables HMAC verification on both payment and refund. **OPEN** |
| SEC-3 / TD-3 — webhook HMAC over re-serialized body | `routes/webhook.routes.ts:19` | `.update(JSON.stringify(req.body))`; no `express.raw` mount anywhere. **OPEN — protected path** |
| TD-5 — coupon non-atomic + discount unclamped | `order.routes.ts:171-178`, `:324-355` | `discount` computed with no upper bound, then `total = subtotal + shippingCharge - discount` → total can go **negative**. Usage increment happens after the order update, outside any transaction, so concurrent redemptions can exceed `maxUsage`/`perUserLimit`. **OPEN** |
| TD-6 — audit trail absent on money mutations | `order.routes.ts` | `grep orderAuditLog server/src/routes/order.routes.ts` → **0**. Payment confirmation, failure, and cancellation write no audit row, despite `CLAUDE.md` declaring the log append-only on every status transition. The only payment-adjacent write is the logistics delivery path (`webhook.routes.ts:215`). **OPEN** |
| TD-7 — GST asymmetry over-refunds | `order.routes.ts:92` vs `rma.service.ts:128-131` | Orders are GST-**inclusive** (`const totalGst = 0 // GST is now inclusive`), but refunds compute `unitPrice + (unitPrice × gstPercent / 100)`. Every return refunds more than was charged. **OPEN** |
| S-21 / W-07 — coupon preview trusts client `orderValue` | `routes/coupon.routes.ts:11,59,70` | Client-supplied `orderValue` gates `minOrderValue` and computes the previewed discount. Not a money bug (order creation recomputes server-side) but the displayed price is not the charged price. **OPEN** |
| S-02 — ZodError → 500 | `middleware/error.middleware.ts:19-26` | **ALREADY FIXED** — landed via the `frontend-security-a11y` merge. Retained as a regression-guard requirement only, not new work. |

Compounding all of it: **`server/` has no test harness on this branch** (`server/tests`, `server/vitest.config.ts`, `.github/workflows/ci.yml` all absent; only `apps/web/vitest.config.ts` exists). There is currently no way to prove any of these fixes works, or that it stays fixed.

## Goals

1. A payment can only be confirmed when the signature, the Razorpay order identity, and the captured amount all match the order being confirmed (R1).
2. Signature verification never silently disables itself because of a missing or malformed environment variable (R2).
3. Webhook signatures are verified against the exact bytes Razorpay signed (R3).
4. Money arithmetic is correct and concurrency-safe: discounts cannot exceed order value, coupon quotas hold under concurrent redemption, and a refund never exceeds what was charged (R4).
5. Every payment-affecting state transition leaves an `OrderAuditLog` row (R5).
6. Enough server-side test scaffolding to prove each of the above fails before the fix and passes after (RI1).

## Non-Goals

- **Epic 2 (inventory/`StockReservation`)** — stock is decremented at order creation and never released on abandonment. Real, launch-blocking, and explicitly out of scope here. Any stock line touched by this chain is left behaviourally identical.
- **Epic 3 (cancellation refunds)** — cancelling a paid order still fails to refund. Out of scope; only the *audit-log* aspect of cancellation (R5) is touched.
- **Epic 9 (full domain layer)** — this chain extracts exactly one service (payment confirmation) because two paths must agree; it does not extract `order.service.ts` / `coupon.service.ts` / `product.service.ts` wholesale.
- Full CI platform build-out (Epic 8), auth/session work (Epic 4), migration baseline (Epic 5).
- Any frontend change beyond what R4's "displayed price = charged price" requires.
- Schema changes. `server/prisma/schema.prisma` is protected and `OrderAuditLog` already exists; this chain intends **no migration**. If one proves unavoidable, that returns to the user as a new blocker.

## User Impact

- **Customer:** cannot be charged an amount that differs from what checkout displayed; a return refunds exactly what was paid, not more.
- **Store operator:** an attacker can no longer replay a cheap order's valid signature onto an expensive unpaid order; coupon quotas actually hold; a complete audit trail exists for payment disputes.
- **On-call:** a misconfigured production deploy fails loudly at boot instead of quietly accepting unsigned payments.

## Success Metrics

- A valid signature from order A, replayed against unpaid order B, is rejected — proven by an automated test.
- With `RAZORPAY_KEY_SECRET` unset and `NODE_ENV=production`, the server refuses to start rather than accepting unverified payments.
- A webhook body captured from Razorpay test mode verifies against the raw-body implementation and fails against the current `JSON.stringify` one.
- A coupon whose discount exceeds cart value produces `total >= 0`, never negative.
- An RMA refund for a full order equals `order.total`, not `order.total + GST`.
- Every `paymentStatus` transition has a corresponding `OrderAuditLog` row.

## Requirements

Explicit requirements come from Epic 1's six checklist items in the Notion source of truth. Implicit requirements are derived from `repo-profile.yaml` (protected paths, public contracts), `verification.yaml` (evidence), `domain.yaml` (safety constraints), and `release.yaml` (branch/PR gates).

## Constraints

- `server/src/routes/webhook.routes.ts` is a **protected path** — `.claude/CLAUDE.md` states it "must never be modified without explicit approval". R3 cannot start without that approval (Q1).
- `server/prisma/schema.prisma` is protected; this chain plans no schema change.
- `server/src/routes/**` is a declared **public contract** — the `{ success, message, data }` response shape and existing status codes must not break existing web/admin clients (RI2).
- Domain constraint: *"Do not modify payment or checkout logic … without explicit user approval."* The user's instruction to implement Epic 1 is that approval for the payment paths generally; the protected-file carve-out (Q1) is tracked separately because `CLAUDE.md` names that file specifically.
- Branch policy: non-default branch required; PR required. Already on `payment-integrity`.
- No secrets, connection strings, or env values in any artifact (RI4).
- Build must not push, open PRs, or execute CI (that is Ship's job).

## Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RK1 | Raw-body change breaks live webhook delivery — a payment-confirmation outage is worse than the bug | High | Mount `express.raw` on the webhook route **only**; verify against a captured real test-mode event before merge; keep the JSON path working for the logistics webhook, which is signed differently |
| RK2 | Fail-closed env assertion crashes an otherwise healthy production deploy on rollout | Medium | Assert only what payment genuinely needs; document required vars in the ship artifact; a crashed deploy is the intended outcome vs. accepting unsigned payments |
| RK3 | GST refund correction changes historical refund amounts | Medium | Apply to newly created RMAs only; do not retro-adjust existing `Refund` rows (A2) |
| RK4 | Extracting a shared confirmation service silently changes webhook behaviour | Medium | Characterization tests written **first** against today's behaviour, then flipped as each fix lands (pattern proven in the prior chain) |
| RK5 | No server test harness exists — every fix is unproven without building one first | High | RI1 makes the harness a first-class requirement, sequenced before the fixes it protects |
| RK6 | Verify-payment amount check requires a live Razorpay API call, adding an external dependency to the confirm path | Medium | Plan decides: fetch-and-compare vs. compare against the amount stored at order creation; treat Razorpay unavailability as failure-to-confirm, not silent success |

## Open Questions

Q1 is blocking. Q2 and Q3 have safe defaults recorded as assumptions and do not block Plan.

## Requirement Manifest

### Explicit (R)

**R1 — Bind payment confirmation to the Razorpay order and its captured amount.** (SEC-1 / TD-1)
- Acceptance: `verify-payment` rejects with 4xx when `razorpayOrderId` in the request does not equal the stored `order.razorpayOrderId`.
- Acceptance: confirmation rejects when the captured payment amount does not equal `order.total`.
- Acceptance: a valid signature for order A replayed against unpaid order B is rejected, proven by an automated test.
- Acceptance: the legitimate happy path still confirms successfully.

**R2 — Payment/refund signature verification fails closed.** (SEC-2 / TD-2 / S-16 / S-19)
- Acceptance: mock mode is entered only via an explicit opt-in flag (e.g. `PAYMENTS_MOCK=true`), never inferred from the shape of `RAZORPAY_KEY_ID`.
- Acceptance: mock mode is impossible when `NODE_ENV=production`.
- Acceptance: with `NODE_ENV=production` and payment secrets missing, the process exits non-zero at boot rather than serving traffic.
- Acceptance: the same rule governs `rma.service.ts:326` refunds, not just order payment.
- Acceptance: local/dev workflow without real Razorpay keys still works via the explicit flag.

**R3 — Webhook HMAC verified against the raw request bytes.** (SEC-3 / TD-3) — *gated on Q1*
- Acceptance: `express.raw({ type: 'application/json' })` is mounted on the Razorpay webhook route only; no other route's body parsing changes.
- Acceptance: the HMAC is computed over the raw `Buffer`, then the payload is parsed.
- Acceptance: a captured real Razorpay test-mode event verifies successfully.
- Acceptance: a tampered body fails verification.
- Acceptance: an unset webhook secret still fails closed (current behaviour preserved).

**R4 — Money arithmetic is correct, bounded, and concurrency-safe.** (TD-5 / TD-7 / S-21 / W-07)
- Acceptance: `discount` is clamped so `total >= 0` for any coupon value.
- Acceptance: coupon `usedCount` / `CouponUsage` increment occurs in the same transaction as the order-confirmation write; concurrent redemptions cannot exceed `maxUsage` or `perUserLimit`.
- Acceptance: an RMA refund for an entire order equals the order's charged total — GST is not added on top of a GST-inclusive price.
- Acceptance: the coupon preview endpoint no longer trusts a client-supplied `orderValue` for the discount it displays.
- Acceptance: the price shown at checkout equals the price charged for the same cart and coupon.

**R5 — Every payment-affecting mutation writes an `OrderAuditLog` row.** (TD-6)
- Acceptance: payment confirmed (both the client `verify-payment` path and the webhook path) writes a row with `fromState`/`toState`.
- Acceptance: payment failed writes a row.
- Acceptance: refund issued writes a row.
- Acceptance: rows are written inside the same transaction as the state change they describe.
- Acceptance: both confirmation paths produce equivalent audit rows for equivalent transitions.

### Implicit (RI)

**RI1 — Server-side test harness sufficient to prove the money paths.** (from `verification.yaml` evidence rules; `server/tests` absent today)
- Acceptance: `npm run test --workspace=server` exits 0 and is runnable from a clean database.
- Acceptance: at least one test per R1–R5, each demonstrably failing before its fix and passing after.
- Acceptance: the harness never targets a non-test database (guarded by name).

**RI2 — Public API contract preserved.** (`repo-profile.yaml` → `paths.public_contracts: server/src/routes/**`)
- Acceptance: responses keep the `{ success, message, data }` shape.
- Acceptance: no existing successful request becomes an error, other than the fraudulent cases R1–R3 intentionally now reject.
- Acceptance: web and admin clients require no coordinated change to keep working.

**RI3 — Protected-path modification is explicitly approved and recorded.** (`repo-profile.yaml` → `paths.protected`)
- Acceptance: `webhook.routes.ts` is not modified until Q1 is answered.
- Acceptance: the approval is recorded verbatim in this chain's artifacts, not just in chat.

**RI4 — No secrets in artifacts or logs.** (`domain.yaml` safety constraints)
- Acceptance: only env var *names* appear in artifacts; no values, connection strings, keys, or signatures.
- Acceptance: no payment secret is logged by new code.

**RI5 — Branch and PR policy honoured.** (`repo-profile.yaml`, `release.yaml`)
- Acceptance: all work lands on `payment-integrity`, never directly on `main`.
- Acceptance: Ship opens a PR; Build neither pushes nor opens one.

**RI6 — Regression guard on the already-landed ZodError fix.** (S-02, fixed via merge)
- Acceptance: a validation failure on a payment endpoint returns 400 with field errors, not 500 — asserted by a test so the fix cannot silently regress.

### Assumptions (A)

- **A1** — `main` (post-merge of `frontend-security-a11y`) is the correct base. Confirmed by inspection: it now contains the RMA subsystem, `OrderAuditLog`, `StockReservation`, `CouponUsage`, and 5 migrations — the absence of which was blocker B1 in the prior `arb-remediation` chain. *Plan must not re-litigate the base branch.*
- **A2** — The GST refund correction applies to **newly created RMAs only**; existing `Refund` rows are not retro-adjusted. Mirrors the answer recorded in the prior chain's brief ("refunds equal what was charged, applied to new RMAs only"). Re-confirm if the user disagrees (Q2).
- **A3** — A minimal server test harness is in scope for this chain because Epic 1's own Notion entry names a test as its first deliverable, and no server harness exists. Epic 8's broader CI platform remains out of scope.
- **A4** — Prior-chain findings **F1** (migration drift: `CouponUsage` has no creating migration; `OrderItem` vs `orderitem` case mismatch) and **F3** (17 npm audit findings) still apply and are *not* fixed here. F1 may force the harness to build its schema with `db push` rather than `migrate deploy`; that is a harness detail, not a product change. F1's real fix belongs to Epic 5.
- **A5** — Prior-chain finding **F2** (a stashed Playwright e2e suite exists) is not incorporated; this chain writes its own server-level tests. Left for Epic 8 to reconcile.

### Open Questions (Q)

**Q1 — Approval to modify the protected file `server/src/routes/webhook.routes.ts` for R3?**
- Context: `.claude/CLAUDE.md` and `repo-profile.yaml` both flag this file as requiring explicit approval. R3 (raw-body HMAC) cannot be implemented without touching it, and it also needs a mount change in `server/src/index.ts`.
- Owner: user
- Blocking: **yes**
- If declined: R3 is dropped from this chain and recorded as a waiver with residual risk (webhook signature verification remains structurally unsound); R1, R2, R4, R5 proceed unaffected.
- **RESOLVED 2026-07-25 — approved.** User selected "Approve — include R3". `webhook.routes.ts` and the webhook-only mount in `server/src/index.ts` are in scope. This satisfies RI3; Plan must still weigh RK1 (outage risk) when sequencing.

**Q2 — Confirm A2: GST refund correction applies to new RMAs only, with no retro-adjustment of existing `Refund` rows?**
- Owner: user
- Blocking: no — proceeding on A2, which mirrors the prior chain's recorded answer.
- **RESOLVED 2026-07-25 — confirmed.** User selected "New RMAs only". A2 stands: forward-only, no retro-adjustment of existing `Refund` rows.

**Q3 — For R1's amount check: re-fetch the captured amount from the Razorpay API, or compare against the amount recorded when the Razorpay order was created?**
- Context: fetching is stronger (catches an amount changed out-of-band) but adds a live external call to the confirmation path and a new failure mode (RK6). Comparing to the stored value is simpler and offline.
- Owner: Plan (technical decision, not product policy)
- Blocking: no — Plan decides and records the rationale.

## Questions For User

1. **(Q1, blocking)** Do you approve modifying `server/src/routes/webhook.routes.ts` (plus a webhook-only body-parser mount in `server/src/index.ts`) to verify the Razorpay HMAC against raw bytes? It is a protected path, so I will not touch it otherwise. Declining is fine — R3 becomes a recorded waiver and the other four requirements proceed.
2. **(Q2, non-blocking)** Confirm the GST refund fix applies to new RMAs only, leaving existing refund records untouched. I will proceed on that assumption unless you say otherwise.

## Architecture Notes

- **role:** Architect
- **decision (architecture-decision-advisor):** Route both payment-confirmation paths — `POST /orders/verify-payment` and the `payment.captured` webhook — through **one shared confirmation function** rather than applying R1/R4/R5 separately in each.
  - *Rationale:* the two paths already disagree today, and that disagreement is the bug. `verify-payment` increments coupons; the webhook does not. Neither writes an audit row. Fixing them independently reproduces exactly the drift the audit documents elsewhere (the toast-id bug fixed in web but not admin).
  - *Rejected — patch both call sites independently:* smaller diff, but guarantees the next payment change has two places to land and one will be missed.
  - *Rejected — full `OrderService` extraction now:* that is Epic 9's scope; doing it here would balloon a P0 security fix into a multi-week refactor and enlarge the review surface on the money path.
  - *Precedent:* `services/rma.service.ts` is the existing in-repo pattern for a transactional domain service that writes its own audit rows — this follows it rather than inventing a new shape.
- **constraint:** `webhook.routes.ts` (protected, Q1) and `schema.prisma` (protected, no change planned). `server/src/routes/**` is a public contract — RI2 forbids breaking the response shape.
- **constraint:** Epic 1 must not "fix" stock behaviour while passing through order creation; that is Epic 2 and changing it here would make this chain's blast radius unreviewable.
- **tradeoff:** Building a server test harness (RI1) inside a P0 security chain slows the first fix landing. Accepted — the prior chain demonstrated the harness is what makes these fixes provable, and without it every acceptance criterion above reduces to "read the code and hope".
- **tradeoff:** Fail-closed env assertion (R2) can crash a production deploy that is currently "working". Accepted deliberately: a deploy that accepts unsigned payments is not working, it is failing silently.
- **assumption for Plan:** A1 (base branch settled — do not re-open), A2 (GST fix is forward-only), A4 (F1 migration drift may force `db push` in the harness).
- **downstream — Plan:** must sequence RI1 (harness) before R1–R5, decide Q3, and decide whether R3 lands as its own PR given its protected-path status and outage risk (RK1).
- **downstream — Build:** characterization-tests-first; no pushing, no PRs, no CI runs.
- **downstream — Test:** R3 needs a captured real Razorpay test-mode event; that is manual-QA evidence, not something a unit test can synthesise.
- **downstream — Ship:** R2 changes required environment variables — the ship artifact must list the new var names (never values) and the rollback trigger, since a missing var now blocks boot by design.
- **downstream — Epic 2/3:** this chain deliberately leaves stock-on-abandonment and cancel-without-refund broken. Ship notes must state that plainly so nobody reads "Epic 1 done" as "the money path is safe".

## Checkpoint Approval

- Checkpoint: brief-review
- Status: approved
- Date: 2026-07-25
- Mechanism: structured choice prompt on this brief's two open questions; the lines below are the user's selected options verbatim, not agent paraphrase.
- User's own words (verbatim, this turn): **"Approve — include R3"** (Q1) and **"New RMAs only"** (Q2).
- Scope of approval: this brief's Requirement Manifest as written — R1, R2, R3, R4, R5 all active; no requirement waived.
- Earlier in the same turn the user also directed the base-branch decision ("make a new branch from main and continue with /workflow think process to implement Epic 1"), then selected "Merge a11y branch → main, then branch" when shown that `main` lacked the ZodError fix and all test infrastructure. That is the authority behind A1.

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs appear in `orchestration.blockers` (Q1 — now resolved, list empty).
- [x] User approved or waiver recorded. — approved; no waivers recorded.
