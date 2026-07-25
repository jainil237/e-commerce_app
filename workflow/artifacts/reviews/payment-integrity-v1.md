---
slug: payment-integrity
version: 1
artifact: review
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/payment-integrity-v1.md
  - workflow/artifacts/plans/payment-integrity-v1.md
  - workflow/artifacts/tasks/payment-integrity-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Payment Integrity & Fraud Prevention — Review

## Review Basis

Reviewed against the current uncommitted working-tree diff on branch `payment-integrity` (Phases 3-5 combined; Phases 1-2 already committed as `edc79ff`/`b0fcaa6`). Read every changed file directly, not from Build's self-report. Two findings below were caught during this pass and **fixed in place before finalizing this artifact** — per the user's explicit instruction this session ("commit the changes only after finishing review and test phase successfully"), the intent is a working, passing pipeline before commit, not a formal stop for every defect found. Both fixes, their rationale, and the before/after verification are recorded in the task artifact's Implementation Log (#52a, #52b) as well as here.

## Findings

### [RESOLVED] P1 — `perUserLimit` had no concurrency guard, only `maxUsage` did

- **Path/area:** `server/src/services/payment-confirmation.service.ts`, coupon-usage block
- **Manifest ID:** R4
- **Problem:** Phase 4's coupon-atomicity fix (task artifact finding #36) added an atomic conditional-update guard for `Coupon.usedCount` against `maxUsage`, but the brief's own R4 acceptance criterion explicitly named both counters: *"concurrent redemptions cannot exceed `maxUsage` or `perUserLimit`."* The `CouponUsage` per-user row was still updated with a plain `upsert` — two simultaneous confirmations by the same user against a `perUserLimit: 1` coupon could both succeed and push `usedCount` to 2.
- **Fix applied:** added the same conditional-update shape to the per-user path (`updateMany` gated on `usedCount < perUserLimit`), with a `create` + catch-`P2002` fallback for the first-use race (Prisma's unique constraint on `(couponId, userId)` makes a losing concurrent create a safe no-op).
- **Evidence after fix:** new test `two simultaneous confirmations by the same user for a coupon with perUserLimit=1 result in usedCount <= 1` in `money-correctness.test.ts`, passing. Full suite: 53/53 (up from 52), `tsc --noEmit` clean, full `npm run build` clean.

### [RESOLVED] P1 — webhook silently returned 200 on a confirmation it couldn't verify

- **Path/area:** `server/src/routes/webhook.routes.ts`, `payment.captured` case
- **Manifest ID:** R1, R5
- **Problem:** the case wrapped `confirmPayment()` in a local `try/catch` that logged the error and `break`-ed — which fell through to the unconditional `res.json({ success: true })` after the `switch`. Razorpay's retry mechanism triggers on non-2xx responses; a confirmation that failed (amount mismatch, unreachable Razorpay API, order mismatch) would report success anyway, so Razorpay would never retry and the order could stay `PENDING` indefinitely with no further signal. The comment directly above the `catch` said *"a confirmation that can't be verified must not silently succeed"* — the code did exactly that, contradicting its own stated intent.
- **Fix applied:** removed the inner `try/catch`; `confirmPayment()` failures now propagate to the route's outer `catch`, which returns 500, so Razorpay retries.
- **Evidence after fix:** new test `returns a non-2xx when confirmation fails, so Razorpay retries instead of getting a silent success` in `webhook.test.ts` — turns off `PAYMENTS_MOCK` for one delivery (forcing a real, unreachable Razorpay fetch), asserts a non-200 response and that the order is still `PENDING` afterward. Full suite: 54/54 (up from 53), `tsc --noEmit` clean, full `npm run build` clean.

### P3 — idempotency short-circuit precedes the R1 binding check (informational, not exploitable)

- **Path/area:** `server/src/services/payment-confirmation.service.ts`, `confirmPayment()`
- **Manifest ID:** R1
- **Problem:** the order lookup and `paymentStatus === 'PAID'` idempotency check both run before the `razorpayOrderId` binding check. A request against an *already-PAID* order returns `alreadyConfirmed: true` regardless of whether the submitted `razorpayOrderId`/`razorpayPaymentId` actually match that order.
- **Why not blocking:** for the client path, the order lookup is scoped to the requesting user, so this only ever no-ops against an order the requester already legitimately owns and has already paid for — no state changes, no information disclosed beyond "yes, this is already paid," which the ordinary happy-path response already reveals. For the webhook path, the order was already looked up by the matching `razorpayOrderId`, so the check is structurally satisfied before `confirmPayment` is even called. Not a replay vector.
- **Recommendation:** no fix required for this chain. Worth a one-line comment if Epic 9's later domain-layer work touches this function, so a future reader doesn't assume idempotency also re-validates identity.

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 2 (both resolved during this review) |
| P2 | 0 |
| P3 | 1 (informational, no fix required) |

## Requirement Coverage

| Manifest ID | Evidence | Status | Notes |
|---|---|---|---|
| R1 | `payment-confirmation.service.ts` layer-1/layer-2 checks; `payment-binding.test.ts` SEC-1 tests (flipped from `it.fails`); `payment-confirmation.test.ts` unit tests (amount mismatch, non-captured, fetch failure, order binding, ownership scoping) | covered | Replay rejected offline before any network call; amount/status verified via mocked Razorpay fetch since no real sandbox is available in CI |
| R2 | `config/payments.ts`; `payments-config.test.ts`; `payment-binding.test.ts` R2 block | covered | Single explicit `PAYMENTS_MOCK` switch, hard off in production; boot assertion manually verified outside the test framework too (task artifact Command Results) |
| R3 | `express.raw()` mount in `index.ts`; `verifyWebhookSignatureRaw`; `webhook.test.ts` R3 block (unit + HTTP-level, including the byte-exact-match test and the new fail-closed-on-confirmation-failure regression test) | covered | Byte-exactness proven against what supertest actually puts on the wire, not a re-echo. A captured *real* Razorpay test-mode event is manual-QA evidence per the plan — that's Test's job, not Build/Review's; flagged in Residual Risk |
| R4 | Discount clamp tests; `maxUsage` and `perUserLimit` concurrency tests (the latter added during this review); GST-refund test (flipped from `it.fails`); coupon-endpoint contract tests | covered | Both concurrency guards now symmetric; see Findings above for the gap this review closed |
| R5 | `payment-confirmation.test.ts`'s entry-point-equivalence test; audit rows added to `payment.failed`/`refund.created` in `webhook.routes.ts` | covered | Client and webhook paths produce identical `action`/`fromState`/`toState`, differing only in `userId` (null for webhook) as designed |
| RI1 | `server/tests/**` harness, all 8 files | covered | Runs from a clean `*_test` schema every time; `db push` not `migrate deploy`, per brief A4 (F1 migration drift, out of scope) |
| RI2 | Response-shape audit (task artifact #49); `PaymentConfirmationError` → `createError` translation preserves `{success, message, code}` | covered | One intentional contract change (`coupon.routes.ts`) shipped with its frontend caller update in the same phase, not left dangling |
| RI3 | Brief Q1 approval cited in task artifact Phase 5 section and Active Phase header | covered | |
| RI4 | `grep -rniE` secret-value audit across all three lifecycle artifacts and every changed/new source file (task artifact #50) | covered | Zero real-looking secret values; only the literal placeholder token name appears, as intended fixture/documentation text |
| RI5 | `git ls-remote --heads origin payment-integrity` (task artifact #51) | covered | Branch not pushed, no PR opened |
| RI6 | `validation-error.test.ts` | covered | Regression guard on the pre-existing ZodError→400 fix; still passing after every phase |

No manifest ID is `partial` or `missing`.

## Architecture Notes

- role: Staff Reviewer
- decision: reviewed the working diff directly (file reads, not Build's task-artifact narrative) before accepting any "exit gate met" claim — this is what surfaced both P1 findings, neither of which Build's own self-report had caught.
- decision: fixed both P1s in place during this same pass rather than writing a `blocked` review and handing back to Build. Justification: the user's instruction this turn was explicitly about reaching a passing Review+Test before the first commit of Phases 3-5; a `blocked` review followed by a trivial reopened Build phase for a one-file fix would not have served that instruction any better than fixing it here with full before/after evidence recorded in both artifacts.
- constraint: R3's byte-exactness claim rests on a mocked/synthesized signature computed the same way the test's own helper computes it — this proves the *mechanism* is correct (raw bytes in, same bytes verified) but does not prove compatibility with Razorpay's actual webhook delivery format. That gap is by design per the plan (manual QA, Test phase), not an oversight.
- tradeoff: did not attempt to close the P3 finding (idempotency-before-binding-check ordering) — assessed as non-exploitable and the fix would add a check that never fires in practice, which is complexity without a corresponding safety gain.
- downstream — Test: R3 needs a captured real Razorpay test-mode webhook event as manual QA evidence; everything else in this chain is closed by automated tests already in the suite. Test should also independently confirm (not just re-trust) the two review-fixed findings, since they were both found late.
- downstream — Ship: handoff draft already exists in the task artifact (#52, source-of-truth section) — Epic 1's checklist status, and the explicit statement that Epic 2 (stock reservation) and Epic 3 (cancel-without-refund) remain open, so this chain's completion isn't misread as "the money path is fully safe."

## Verification Reviewed

| Item | Outcome | Notes |
|---|---|---|
| `npm run test --workspace=server` (post-review-fixes) | **pass** — 8/8 files, 54/54 tests, 0 todo | Re-ran twice for determinism per task artifact Command Results |
| `npx tsc --noEmit -p server/tsconfig.json` (post-review-fixes) | **pass** | Clean |
| `npm run build` (full monorepo: server + apps/web + apps/admin) | **pass** | Re-verified after both review fixes, not just once before them |
| `git status --short` (post-review-fixes) | **pass** | Same file set as before the fixes — both were in-place edits to already-touched files, no scope expansion |
| `grep -rniE` secret-value audit | **pass** | Reviewed the audit command and its output directly (task artifact #50), not just Build's claim |
| `git ls-remote --heads origin payment-integrity` | **pass** | Reviewed directly — empty output confirms nothing pushed |
| Manual real-world assertion check for the boot-time env assertion (`NODE_ENV=production npx tsx -e ...`) | **pass** | Read the actual command and output in the task artifact (Phase 2 Command Results) — not a claim taken on faith, the exact error string is recorded |

## Residual Risk

- **R3 lacks a captured real Razorpay test-mode event.** Everything unit/HTTP-testable about the raw-body mechanism is covered; byte-for-byte compatibility with Razorpay's actual delivery format is not provable without one. Owner: Test phase, per the plan's own verification design (this was never intended to be closed by Build/Review).
- **F1 (migration drift, pre-existing, out of scope):** the test harness builds its schema with `db push` rather than `migrate deploy` because a database built purely from this repo's migrations is already broken (`CouponUsage` has no creating migration; `OrderItem`/`orderitem` case mismatch). This chain does not touch it. Recorded so Test doesn't mistake harness behavior for something this chain fixed.
- **Order-creation-time coupon race (pre-existing, out of scope):** two concurrent order *creations* can both pass the `maxUsage`/`perUserLimit` check before either order is confirmed — this chain's guard protects the counter at *confirmation* time (where the money actually changes hands), not at creation time. A rare double-discount can still occur when both such orders are then both confirmed, but the ledger itself never overshoots. Documented in `payment-confirmation.service.ts`'s inline comment.
- **Epic 2 and Epic 3 remain open**, as stated throughout this chain's artifacts. This review does not treat their absence as a gap in *this* chain's scope, but Ship must state it plainly regardless.

## Recommendation

**pass-with-risk**

Both P1 findings were caught and fixed within this review pass, with full before/after evidence in both this artifact and the task artifact. The one P3 is informational and non-exploitable. The residual risks are all either explicitly out of this chain's scope (documented, pre-existing) or belong structurally to Test (the R3 manual-QA requirement, which the plan always intended). Nothing here should block Test from starting.
