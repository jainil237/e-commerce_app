---
slug: inventory-reservation
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  user_checkpoint: none
  build_completed_at: 2026-07-25T23:45:00Z
  evidence:
    - all_62_tests_pass: ✅
    - zero_frontend_changes: ✅
    - no_push_to_remote: ✅
    - claude_md_drift_fixed: ✅
    - typescript_clean: ✅
---

# Inventory Reservation & Stock Integrity — Plan

## Summary

Five phases on branch `inventory-reservation`. The load-bearing decision, made during this Plan pass and detailed in Approach §1: **reserve at order creation, not at checkout-page entry.** That single choice fixes P0-0 exactly (the burn happens at order creation today, so that is the window that needs a hold), avoids any change to `/api/v1/cart/validate-checkout`, and requires **zero frontend changes** — which collapses most of RI2's contract risk.

Phase 1 lands the availability helper additively with no behaviour change. Phase 2 is the pivot — reservation replaces decrement at order creation *and* conversion lands at payment confirmation, in one phase, because splitting them leaves a window where stock is unmanaged. Phases 3–5 consolidate restoration, add confirmation-time re-validation, and close out docs/contract/ship readiness.

**One blocker (Q4):** `StockReservation` has no `orderId` column, so there is no way to know which reservations belong to which order at conversion time. This was not visible when the brief was written. Resolving it requires either a protected-path migration or accepting an ambiguous matching heuristic — the user's call.

## Inputs

- Approved brief: `workflow/artifacts/briefs/inventory-reservation-v1.md` (checkpoint `brief-review` → approved 2026-07-25; Q1 → lazy expiry, Q2 → 30 min from `config/store.config.json`)
- `workflow/config/repo-profile.yaml` — `server/prisma/schema.prisma` protected; `server/src/routes/**` public contract
- `workflow/config/verification.yaml` — `npm run build` (required), `npm run lint` (not required), `npm run db:migrate` (**required in P2** — Q4 → option A introduces a migration)
- `workflow/config/source-of-truth.yaml` — Notion providers `update: false`, handoff only
- `workflow/config/release.yaml` — branch + PR gates required; CI/release/deployment not required
- Repo inspection performed this phase on branch `inventory-reservation` @ `2afecaf`; findings inline below

## Requirement Coverage

| Manifest ID | Covered by phases | Owning phase | Notes |
|---|---|---|---|
| R1 — reserve, don't decrement | P2 | **P2** | Trigger point refined to order creation (Approach §1, resolves brief Q3) |
| R2 — availability accounts for others' holds | P1 | **P1** | Shared helper, three call sites |
| R3 — convert exactly once at payment | P2 | **P2** | **Gated on Q4** — needs the reservation↔order link |
| R4 — expiry/release returns stock; one restore helper | P1 (expiry), P3 (restore) | **P3** | Lazy expiry semantics land in P1's helper; restore consolidation in P3 |
| R5 — re-validate at confirmation, fail closed | P4 | **P4** | |
| R6 — docs match reality | P5 | **P5** | |
| RI1 — test coverage per transition | P1–P5 | **P5** | Each phase adds its own; P5 signs off completeness |
| RI2 — public contract preserved | P2, P5 | **P5** | Materially de-risked by the order-creation trigger choice — no client change expected |
| RI3 — protected-path handling explicit | P0 (decision), P2 | **P2** | Q4 is exactly this requirement firing as designed |
| RI4 — no secrets | P1–P5 | **P5** | Continuous |
| RI5 — branch/PR policy | P5 | **P5** | Build never pushes |
| RI6 — oversell fix not regressed | P1–P5 | **P5** | Hard gate at every phase, not just the end |

No requirement is deferred, waived, or dropped. Every active R/RI has exactly one owning phase.

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `server/src/services/inventory.service.ts` | create | R1, R2, R4 | New: `getEffectiveAvailability()`, `createReservations()`, `convertReservations()`, `releaseReservations()`, `restoreStock()`. The single owner of reservation state and `Product.stock` mutation. |
| `server/src/routes/cart.routes.ts` | modify | R2 | `/validate-checkout` availability switches from raw `product.stock` to the shared helper. Response shape unchanged (`availableStock` already exists) — value becomes more accurate, field does not move. |
| `server/src/routes/order.routes.ts` | modify | R1, R4 | Order creation: replace the atomic decrement with reservation creation (same transaction, same conditional-guard discipline). Cancel path: replace the inline restore loop with the shared helper. |
| `server/src/services/payment-confirmation.service.ts` | modify | R3, R5 | Conversion + re-validation inside the existing `prisma.$transaction` — the same transaction that already writes `paymentStatus`, coupon usage, and the audit row. |
| `server/src/routes/webhook.routes.ts` | modify | R4 | **Protected path** — two inline restore loops (`payment.failed`, `refund.created`) replaced by the shared helper. Behaviour-preserving. Requires approval (see Q4 note on protected paths). |
| `server/prisma/schema.prisma` | **modify — approved (Q4 → A)** | R3, RI3 | **Protected path, explicitly approved.** Add `orderId String?` + `@@index([orderId])` to `StockReservation`, and the matching nullable relation on `Order`. Nothing else. |
| `server/prisma/migrations/<ts>_add_reservation_order_id/` | create | R3 | Generated migration: nullable column + index only. No backfill, no data transformation. |
| `server/tests/**` | create/modify | RI1, RI6 | Reservation lifecycle, expiry, concurrency, guest path, oversell regression guard |
| `CLAUDE.md` | modify | R6 | DRIFT-1 correction — lands in P5, after the behaviour it describes is real |
| `apps/web/**` | **no change expected** | RI2 | Direct consequence of the order-creation trigger choice. If Build finds a client change is unavoidable, that is a new blocker, not a silent edit. |

## Source-of-Truth Strategy

- **Read:** Notion *Architecture Audit — Epics & Tech Debt Register* → Epic 2. Already read; requirements transcribed into the brief's manifest with per-item citation and one documented correction (Epic 2's first checklist item is already satisfied by the merged `oversell-race-fix` chain).
- **Update:** both providers are `update: false` and `update_policy.require_user_request_or_config_for_external_write: true`. **Build and Ship must not write to Notion.**
- **Handoff:** Ship produces a copy-ready handoff stating which Epic 2 checkboxes this chain closes (R1–R6), which was already closed before the chain started (the oversell race, via PR #3 — the register still shows it open), and that a physical reservation sweeper remains deferred to Epic 10.

## Approach

**1. Reserve at order creation, not at checkout-page entry.** (Resolves brief Q3, whose owner was Plan.)

P0-0's actual mechanics: stock is decremented inside `POST /api/v1/orders`, and nothing returns it if the shopper never pays. So the window that burns inventory is *order-created → payment-confirmed*, not *checkout-page-viewed → order-created*. Reserving at order creation covers exactly that window.

Consequences, all favourable:
- Reservation and order are created in the same transaction, so the link (Q4) can be established at birth rather than reconstructed later.
- `/api/v1/cart/validate-checkout` stays read-only — no contract-semantics argument, no `POST /validate-*` that mutates state.
- **No frontend change.** `apps/web` already calls `validate-checkout` on checkout load and `POST /orders` on Pay; neither call site changes shape.
- Less inventory locked up overall — idling on the checkout page holds nothing.

*Rejected — reserve on checkout-page entry:* better in-theory UX (learn about stock loss a few seconds earlier), but `validate-checkout` already surfaces availability on page load via R2's helper, so the real gain is marginal. Costs: a read-only endpoint becomes stateful, reservations exist before any order to attach them to, and idle browsers hold real inventory. Not worth it for this chain; revisit if abandoned-at-payment-step turns out to be a measured problem.

**2. One service owns reservation state and every `Product.stock` mutation.** `inventory.service.ts` is the only module that writes `Product.stock` or transitions a `ReservationStatus`. Routes call it; they do not do stock arithmetic. This is the same consolidation `payment-confirmation.service.ts` applied to the payment path in the prior chain, and it is what makes R4's "one transactional restore helper" true by construction rather than by discipline.

**3. Lazy expiry is a *predicate*, not a job.** (Per brief Q1.) Availability is computed as `Product.stock − SUM(quantity of ACTIVE reservations WHERE expiresAt > now AND owner ≠ me)`. An expired reservation stops counting the instant anyone reads availability, with no cleanup step involved. Status is transitioned to `EXPIRED` opportunistically when a transaction already has the row in hand — never as a prerequisite for correctness. This is why RK3 is structurally eliminated rather than mitigated: there is no sweeper whose failure could freeze stock.

**4. Conversion replaces the decrement; it does not supplement it.** At confirmation, inside the transaction that already marks the order `PAID`: re-validate (R5), decrement `Product.stock` by the order's item quantities, mark the order's reservations `CONVERTED`. Idempotency comes free from the existing `alreadyConfirmed` short-circuit in `confirmPayment` — a replayed webhook returns before reaching conversion. Total stock delta per completed order is exactly the ordered quantity (closes RK1).

## Phases

### Phase 1 — Availability helper and expiry semantics (additive, no behaviour change)

- **Manifest IDs:** R2 (owns), R4 (expiry semantics only; restore consolidation is P3)
- Touches: `server/src/services/inventory.service.ts` (new), `server/src/routes/cart.routes.ts`, `server/tests/**`
- Work: implement `getEffectiveAvailability(productIds, requesterKey, tx?)` returning stock-minus-others'-unexpired-active-holds. Point `/validate-checkout` at it. Because no reservations exist yet, the helper returns exactly `Product.stock` today — so this phase is provably behaviour-preserving while establishing the contract every later phase depends on.
- **Exit gate:** `npm run test --workspace=server` exits 0; a test proves `getEffectiveAvailability` equals raw stock when no reservations exist; a test proves an unexpired reservation owned by *another* requester reduces availability; a test proves an *expired* one does not; a test proves the requester's *own* active reservation does not count against them; `npx tsc --noEmit -p server/tsconfig.json` exits 0.

### Phase 2 — Reserve at order creation; convert at payment confirmation

- **Manifest IDs:** R1 (owns), R3 (owns), RI3 (owns)
- Touches: `server/prisma/schema.prisma` (**protected — approved, Q4 → A**), a generated migration, `server/src/services/inventory.service.ts`, `server/src/routes/order.routes.ts`, `server/src/services/payment-confirmation.service.ts`, `server/tests/**`
- Work: **first**, add `orderId String?` + index to `StockReservation` and the matching relation on `Order`, generate the migration, and run `npm run db:migrate` — the link must exist before anything writes reservations. Then: order creation creates `ACTIVE` reservations stamped with the new `orderId` (`expiresAt = now + reservationDurationMinutes` read via `getStoreConfig()`, never hardcoded) under the same atomic-conditional discipline the current decrement uses, and **stops decrementing**. Payment confirmation converts them by `orderId` and performs the single decrement, inside the existing transaction.
- **These two land together by design** — a phase boundary between "stopped decrementing" and "started converting" would leave stock unmanaged.
- **Exit gate:** `npm run db:migrate` applies cleanly and `npx prisma migrate diff` reports no drift; a test proves order creation creates reservations **stamped with the correct `orderId`** and does **not** change `Product.stock`; a test proves confirmation decrements exactly the ordered quantity and marks that order's reservations `CONVERTED`; a test proves a replayed confirmation does not decrement twice; a test proves two concurrent orders for one remaining unit yield exactly one reservation; a test proves a second in-flight order for the same user does **not** have its reservations converted by the first order's confirmation (the ambiguity option B would have shipped); the oversell-race regression test (RI6) passes unchanged; full suite exits 0.

### Phase 3 — Release, expiry return, and one transactional restore helper

- **Manifest IDs:** R4 (owns)
- Touches: `server/src/services/inventory.service.ts`, `server/src/routes/order.routes.ts` (cancel), `server/src/routes/webhook.routes.ts` (**protected**), `server/tests/**`
- Work: implement `releaseReservations()` and a single transactional `restoreStock(orderId, tx)`. Replace all three inline restore loops (`order.routes.ts:603-608`, `webhook.routes.ts:158-162`, `webhook.routes.ts:190-194`) with calls to it. Cancellation releases still-`ACTIVE` reservations (nothing to restore — never decremented) versus restoring stock for already-`CONVERTED` ones; that distinction is the phase's core correctness requirement.
- **Exit gate:** a test proves cancelling an unpaid order releases reservations and does **not** double-return stock; a test proves cancelling a paid order restores exactly the converted quantity; a test proves an abandoned order's stock returns to availability once past `expiresAt`, with no cleanup process run; a test proves the guest (`sessionId`) path expires identically (RK8); `grep -c "increment: item.quantity"` in routes returns 0 (all restoration goes through the helper); full suite exits 0.

### Phase 4 — Re-validate stock at payment confirmation, fail closed

- **Manifest IDs:** R5 (owns)
- Touches: `server/src/services/payment-confirmation.service.ts`, `server/tests/**`
- Work: before converting, assert the order's reservations are still valid, or that current effective availability can cover the order if they have expired. Reject (leaving the order unconfirmed) when neither holds, or when a product has been deactivated since order creation. Reuses the `PaymentConfirmationError` shape the prior chain established, so route-level error translation is unchanged.
- **Exit gate:** a test proves confirmation is rejected and the order stays unconfirmed when reservations expired and stock is insufficient; a test proves confirmation is rejected when a product was deactivated post-creation; a test proves confirmation still succeeds when reservations expired but stock is nonetheless available; the happy path still confirms; full suite exits 0.

### Phase 5 — Docs, contract, verification, and ship readiness

- **Manifest IDs:** R6 (owns), RI1 (owns), RI2 (owns), RI4 (owns), RI5 (owns), RI6 (owns)
- Touches: `CLAUDE.md`, artifacts and verification runs only — no product logic
- Work: correct `CLAUDE.md`'s stock/reservation description to match shipped behaviour (DRIFT-1); confirm the `{ success, message, data }` envelope and `availableStock` semantics are intact and that `apps/web` needs no change; audit artifacts and new code for secret leakage; confirm nothing was pushed and no PR opened during Build; assemble the Notion handoff.
- **Exit gate:** `npm run build` exits 0; `npm run test --workspace=server` exits 0; `npm run test --workspace=apps/web` exits 0 **with no source changes to `apps/web`** (proves RI2); `grep -rn "stockReservation" server/src/` returns non-zero (proves the model is wired, per the brief's success metric); no secret values in artifacts; `git log origin/inventory-reservation..HEAD` shows Build pushed nothing.

## Dependency Order

```
P1 (availability helper)          — additive, provably no behaviour change
 └─> P2 (reserve + convert)       — needs P1's helper; needs Q4 resolved
      └─> P3 (release + restore)  — needs reservations to exist before releasing them
           └─> P4 (re-validation) — needs conversion to exist before guarding it
                └─> P5 (docs + verification + ship readiness)
```

Strict sequence. P1 before P2 is a hard dependency (P2's reservation creation must check availability through P1's helper, or two mechanisms compute it differently — RK5). P3 after P2 is hard (nothing to release until reservations exist). P4 after P2 is hard (nothing to re-validate until conversion exists). P5 last by definition.

## Branch Strategy

- Working branch: **`inventory-reservation`**, cut from `main` @ `2afecaf` (the PR #5 merge commit). Verified this session: `gh pr view 5` → `MERGED`, and `payment-confirmation.service.ts` present on `origin/main`. Brief A1 settles this; Plan does not re-open it.
- Default branch `main` is never committed to directly (`repo-profile.yaml` → `require_non_default_branch_for_changes: true`).
- **One PR** for the whole chain. Unlike the payment-integrity chain (three stacked PRs), the phases here are not independently shippable — Phase 2 alone would leave restoration inconsistent, and Phase 3 alone would have nothing to release. Splitting would ship a half-migrated stock model.
- Build commits locally per phase; **Build must not push or open PRs** — that is Ship's, per `release.yaml` and the lifecycle rules.

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|
| RK1 — double-decrement (reservation converts *and* creation-time decrement runs) | Medium | **High** | Conversion replaces the decrement; P2's exit gate asserts total stock delta per order equals exactly the ordered quantity | Build | R1, R3 |
| RK2 — hold expires mid-payment; shopper pays for released stock | Medium | **High** | 30-minute window (brief Q2) exceeds realistic Razorpay completion; R5 re-validates and fails closed rather than overselling | Build | R5 |
| RK3 — reservations become permanent phantom holds | Low | High | **Structurally eliminated** by lazy expiry — expired holds stop counting at read time regardless of any cleanup | — | R4 |
| RK4 — regressing the oversell fix merged hours ago | Medium | **High** | RI6 is a hard gate at *every* phase exit, not just the end | Build/Test | RI6 |
| RK5 — availability computed inconsistently across call sites | Medium | Medium | One helper (P1), three call sites point at it; P1 lands before any consumer | Build | R2 |
| RK6 — sweeper/checkout race on reservation rows | Low | Medium | No sweeper exists (Q1). Status transitions use conditional updates, same pattern as the merged oversell fix and the coupon guard | Build | R3, R4 |
| RK8 — guest (`sessionId`) reservations leak | Medium | Medium | Lazy expiry covers guests identically; P3's exit gate requires a guest-path test. Note: guest checkout is not live today (`POST /orders` requires `authenticate`), so this is forward-looking | Build | R1, R4 |
| RK9 — **`Order` has no `sessionId`**, so a future guest order cannot be matched to a `sessionId`-keyed reservation by any shared key | ~~Medium~~ | ~~Medium~~ | **Resolved by Q4 → option A.** The `orderId` link is owner-agnostic, so guest checkout (Epic 7/P1-2) works without revisiting this design. | — | R3 |
| RK10 — migration on a protected path | Low | Medium | Approved (Q4 → A) and deliberately minimal: nullable column + index, no backfill, no data transformation, no destructive operation. Applied and drift-checked as part of P2's exit gate. Rollback is a plain column drop with no data loss (nothing else reads it). | Build | RI3 |

Every risk has a mitigation. None requires a waiver at this stage.

## Verification Plan

| Manifest ID | Evidence | Owner phase | Notes |
|---|---|---|---|
| R1 | command — order creation creates reservations and leaves `Product.stock` unchanged | P2 | Must fail before the fix, pass after |
| R2 | command — availability tests (no-reservation baseline, other-owner hold, expired hold, own hold) | P1 | |
| R3 | command — conversion decrements exactly once; replay does not double-decrement; a concurrent second order for the same user is not mis-converted | P2 | Unblocked (Q4 → A); linkage is by `orderId` |
| R4 | command — cancel-unpaid releases without double-return; cancel-paid restores; expiry returns stock with no process run; guest path; `grep` proves zero inline restore loops remain | P3 | |
| R5 | command — reject on expired-and-insufficient; reject on deactivated product; accept when expired-but-available; happy path | P4 | |
| R6 | review — `CLAUDE.md` diff matches shipped behaviour | P5 | |
| RI1 | command — `npm run test --workspace=server` exits 0 from a clean schema | P5 | Harness reused from the payment-integrity chain (brief A3) |
| RI2 | command + review — `apps/web` suite passes **with zero source changes**; response-shape comparison | P5 | The order-creation trigger choice is what makes this achievable |
| RI3 | review — Q4 approval recorded verbatim; the migration diff cited in the task artifact and confirmed to be nullable-column-plus-index only | P2 | |
| RI4 | review — `grep` audit for secret values across artifacts and new code | P5 | |
| RI5 | command — `git log origin/inventory-reservation..HEAD` proves Build pushed nothing | P5 | |
| RI6 | command — oversell-race regression test passes at **every** phase exit | P1–P5 | Not deferred to the end |

Configured commands used: `npm run build` (required, P5), `npm run test --workspace=server` (P1–P5), `npm run lint` (P5, non-blocking — pre-existing failures documented in the prior chain), `npm run db:migrate` (**P2, now required** — Q4 → option A introduces a migration; `npx prisma migrate diff` also run in P2 to prove no drift).

## Architecture Notes

- **role:** Principal Engineer
- **decision:** reserve at **order creation**, not checkout-page entry (Approach §1). Resolves brief Q3. Fixes P0-0 precisely, keeps `validate-checkout` read-only, and requires no frontend change — which is the single biggest de-risking move available in this chain.
- **decision:** one `inventory.service.ts` owns all reservation state and every `Product.stock` write. Follows the `payment-confirmation.service.ts` precedent from the prior chain rather than inventing a new shape.
- **decision:** lazy expiry implemented as a predicate inside the availability query, not as a status-cleanup prerequisite. Correctness never depends on a status transition having run.
- **decision:** one PR for the chain, not stacked PRs — the phases are not independently shippable without leaving the stock model half-migrated.
- **constraint:** two protected paths are touched, both with explicit approval on record — `webhook.routes.ts` in P3 (behaviour-preserving restore-helper substitution) and `schema.prisma` in P2 (Q4 → option A: `orderId` column + index only). Any protected-path change beyond those two is a new blocker, not an extension of these approvals.
- **decision (Q4 → A):** link reservations to orders via an explicit `orderId` foreign key rather than heuristic matching on `userId`/`productId`/`quantity`. Rejected the heuristic because it is ambiguous under concurrent checkouts and structurally cannot support guest checkout (`Order` has no `sessionId`) — it would have traded a correctness guarantee to avoid a nullable-column migration.
- **constraint:** `server/src/routes/**` is a public contract — `availableStock` in `/validate-checkout` changes *value* (more accurate) but not *shape*; no field added, removed, or retyped.
- **tradeoff:** not reserving at checkout-page entry means a shopper can lose stock between viewing checkout and clicking Pay. Accepted: that window is seconds, `validate-checkout` already reports live availability, and the alternative holds real inventory for idle browsers.
- **tradeoff:** this chain touches `order.routes.ts` and `payment-confirmation.service.ts` for the third time in as many chains. Concentrated regression risk, mitigated by RI6 as a per-phase gate plus the 54-test suite inherited from the prior chain.
- **assumption Build must preserve:** brief A1 (base branch settled), A2 (oversell already fixed — guard, never re-fix), A4 (conversion belongs in `payment-confirmation.service.ts`), and Q2's resolution (duration read via `getStoreConfig()`, never hardcoded).
- **downstream — Build:** P2 must land reservation-creation and conversion together. Never write `Product.stock` outside `inventory.service.ts`. Commit per phase; never push, never open a PR, never run CI.
- **downstream — Review:** focus on RK1 (double-decrement) and the cancel-unpaid-vs-cancel-paid distinction in P3 — that asymmetry is the most likely place for a subtle stock leak.
- **downstream — Test:** expiry tests must control time by manipulating `expiresAt` or injecting a clock — a real 30-minute wait is not runnable. Recorded so Test does not attempt a sleep.
- **downstream — Ship:** a migration ships (Q4 → A), so `npm run db:migrate` is a required release gate and the rollback path must be stated: dropping the `orderId` column is non-destructive to existing data, since nothing outside this chain reads it. Ship must also carry the Notion handoff and state plainly that reservation rows are never physically swept.

## Open Questions

**Q4 — `StockReservation` has no link to `Order`. How should conversion know which reservations belong to which order?**

- **Context (discovered during this Plan pass; not visible when the brief was written):** the `StockReservation` model carries `productId`, `userId`, `sessionId`, `quantity`, `expiresAt`, `status` — and **no `orderId`**. `Order` correspondingly has no `sessionId` and no reservation relation. So at confirmation time there is no key that unambiguously identifies "the reservations belonging to this order." The model appears to have been designed for cart-level holds keyed by user/session, not order-level holds.
- **Why it blocks:** R3's core acceptance is "convert exactly once." Without a reliable link, a shopper with two checkouts in flight (two tabs) could have the wrong reservation converted — silently corrupting stock in the exact way this chain exists to prevent.
- **Option A — add `orderId String?` + index to `StockReservation`, with a migration.** Unambiguous, correct, and guest-ready (resolves RK9 permanently). **Cost: a protected-path change to `schema.prisma` + one migration** — nullable column, no backfill, no data transformation, no destructive operation. Requires explicit approval per RI3.
- **Option B — match on `userId` + `productId` + `quantity` + `ACTIVE` at conversion, no schema change.** Avoids touching a protected path. **But:** ambiguous when a user has concurrent checkouts; and it cannot work at all for guest checkout when Epic 7/P1-2 lands, because `Order` has no `sessionId` to match a guest reservation against (RK9). This trades a correctness guarantee for avoiding a low-risk migration.
- Owner: **user** (protected-path approval is not mine to grant)
- Blocking: **yes**
- Recommendation: **option A.** The migration is about as low-risk as migrations get, and option B knowingly ships an ambiguity into the one code path whose entire purpose is eliminating stock ambiguity.
- **RESOLVED 2026-07-25 — option A approved.** User: *"go with option A"*. This is the explicit protected-path approval RI3 requires for `server/prisma/schema.prisma`. Scope of the approved change, deliberately minimal:
  - Add `orderId String?` to `StockReservation`, plus `@@index([orderId])`.
  - Add the matching nullable relation to `Order` so Prisma can traverse it.
  - One generated migration: nullable column + index only. **No backfill, no data transformation, no column drop, no type change, no destructive operation.**
  - Nothing else in `schema.prisma` is touched. If Build finds any further schema change necessary, it stops and returns a new blocker rather than extending this approval (RI3).
  - Resolves RK9 permanently — guest checkout (Epic 7/P1-2) will be able to link reservations to orders without revisiting this design.

## Checkpoint Approval

- Checkpoint: plan-review
- Status: approved
- Date: 2026-07-25
- User's own words (verbatim, this turn): "go with option A"
- Scope of approval: this plan as written — five phases, one PR, reserve-at-order-creation, lazy expiry, and **Q4 → option A** (the protected-path `schema.prisma` change adding `orderId` to `StockReservation`, plus its migration). No phase waived, no requirement reduced.
- Note on scope of the protected-path approval: it covers exactly the `orderId` column + index + matching `Order` relation described in Q4's resolution. Any further `schema.prisma` change Build discovers to be necessary returns as a new blocker rather than proceeding under this approval (RI3).

## Exit Gate

- [x] Every active R and RI mapped to a phase, each with exactly one owning phase.
- [x] Every phase has a binary exit gate.
- [x] Verification plan covers every R and RI.
- [x] Dependency order explicit.
- [x] Risks have mitigations.
- [x] Source-of-truth and release handling explicit.
- [x] Branch strategy explicit and does not target the default branch.
- [x] User approved or waiver recorded. — approved; Q4 resolved to option A; no waivers.
