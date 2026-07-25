---
slug: inventory-reservation
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - user-request
  - notion:Architecture Audit — Epics & Tech Debt Register (2026-07-19) — Epic 2
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
skill_trigger_log:
  - skill: repo-alignment-scan
    decision: ran
    reason: task_class is complex — predicate "task_class != trivial" true. Mapped every Epic 2 claim against the actual post-merge code on `main` before framing; this is what surfaced that Epic 2's first acceptance criterion is already satisfied and that no scheduler infrastructure exists. Results in Problem table.
  - skill: architecture-decision-advisor
    decision: ran
    reason: new_surface true — a reservation lifecycle is a new architectural pattern (new service, new state machine, new background-execution surface), and `server/src/routes/**` is a declared public_contract. Decision recorded in Architecture Notes (reservation as the authoritative availability source vs. bolt-on).
  - skill: constraint-conflict-scan
    decision: ran
    reason: touches_protected likely true — `server/prisma/schema.prisma` is a protected path and this chain may need a migration; `server/src/routes/**` is a public contract. Conflicts surfaced as Constraints and Q2.
---

# Inventory Reservation & Stock Integrity — Brief

## Source Links

- Notion (source of truth): [Architecture Audit — Epics & Tech Debt Register (2026-07-19)](https://app.notion.com/p/3a83d3f7968b81cab9bde9cbfd705899) → **Epic 2 — Inventory Reservation & Stock Integrity**
- `docs/product/architecture-audit-and-refactor-plan.md` — P0-1 (oversell race), P1-10 (StockReservation unused), S-05 (stock restore triplication), W-13 (snapshot over-invalidation), §4 (the implement-vs-delete decision)
- `docs/product/architecture-review-board-assessment-2026-07-19.md` — INV-1, TD-4
- `docs/product/mvp-gap-register.md` — P0-0 (abandoned checkout burns inventory), DRIFT-1
- Prior chain that closed the oversell race: `workflow/artifacts/{briefs,plans,tasks,reviews,verify,ship}/oversell-race-fix-v1.md` (merged to `main` via PR #3)
- Prior chain on the same money path: `workflow/artifacts/briefs/payment-integrity-v1.md` (merged to `main` via PR #5)
- Repo policy: `workflow/config/repo-profile.yaml` — `server/prisma/schema.prisma` protected; `server/src/routes/**` public contract

## Problem

Stock is decremented permanently at order creation, before payment. Nothing ever gives it back unless a human cancels the order. A shopper who reaches checkout and closes the tab silently burns that inventory forever — other customers see "out of stock" for units nobody bought.

The fix for this was designed but never built. `StockReservation` exists in `schema.prisma` with five supporting indexes and a four-state `ReservationStatus` enum (`ACTIVE`/`CONVERTED`/`EXPIRED`/`RELEASED`); `store.config.json` carries an `inventory.reservationDurationMinutes` key; `CLAUDE.md` documents soft-locking during checkout as a key pattern. **`grep -rn "stockReservation" server/src/` returns zero hits.** The schema, the config, and the documentation all describe a safety property the running system does not have.

Verified against the actual code on `main` (post PR #3 and PR #5), 2026-07-25:

| Finding | Location | State |
|---|---|---|
| P0-1 / S-01 — oversell race | `server/src/routes/order.routes.ts:69-87` | **ALREADY FIXED** by the `oversell-race-fix` chain — atomic conditional `updateMany` under a transaction, plus a `CHECK (stock >= 0)` migration. Not this chain's work; needs a regression guard only. |
| P1-10 / INV-1 / TD-4 — `StockReservation` entirely unused | `server/prisma/schema.prisma:219-235` | **OPEN** — model + 5 indexes + enum present, zero code references |
| P0-0 — abandoned checkout permanently burns inventory | `order.routes.ts:74-87` (decrement at creation) | **OPEN** — the core defect |
| S-05 — stock restore is non-transactional, triplicated | `order.routes.ts:607`, `webhook.routes.ts:160`, `webhook.routes.ts:192` | **OPEN** — three independent `for` loops of individual updates; a crash mid-loop leaves stock partially restored |
| Part-12 open item — no stock re-check at payment confirmation | `server/src/services/payment-confirmation.service.ts` | **OPEN** — an order can be confirmed after its product was deactivated or sold out by another buyer |
| W-13 — snapshot cache over-invalidation | `apps/web/src/lib/inventory-snapshot.ts:83-89` | **OPEN** — `forceRefreshSnapshot()` calls `clearSnapshots()`, nuking every cached snapshot to refresh one |
| DRIFT-1 — `CLAUDE.md` documents a soft-lock that doesn't exist | `CLAUDE.md` | **OPEN** — corrected only when the behaviour it describes actually ships |

Two structural gaps block a clean implementation and are recorded as blocking questions below: there is **no background-execution infrastructure of any kind** in this repo (no `node-cron`, no `bullmq`, no `setInterval`, no worker process), and `reservationDurationMinutes` has **two conflicting values in two different config files**.

## Goals

1. Stock is held, not consumed, while a shopper is paying — and is returned automatically if they never complete (R1, R2).
2. Reservations convert to a real decrement exactly once, on confirmed payment, with no double-decrement and no lost hold (R3).
3. Stock restoration happens in one transactional place instead of three drifting copies (R4).
4. A payment cannot confirm an order whose stock is no longer actually available (R5).
5. Availability shown to shoppers accounts for other shoppers' active reservations, not just raw `stock` (R2 acceptance).
6. Documentation stops describing behaviour that does not exist (R6).

## Non-Goals

- **Re-fixing the oversell race.** Closed by the `oversell-race-fix` chain already on `main`. This chain must not regress it — a regression guard is in scope (RI6), a re-fix is not.
- **Epic 3 (cancel-without-refund).** Cancelling a paid order still fails to issue a refund. Explicitly out of scope; only the *stock* half of cancellation is touched here (R4).
- **Any background-execution mechanism at all (Epic 10).** Per Q1's resolution this chain adds no scheduler, no cron dependency, no worker, no `setInterval`. Expiry is lazy (read-time). A physical sweeper to reclaim stale `ACTIVE` rows is a deliberate follow-up for Epic 10, once real job infrastructure exists — it is a table-housekeeping optimisation, not a correctness requirement.
- **Server-side cart (Epic 14/E4).** Reservations key off `userId`/`sessionId` as the schema already allows; this chain does not introduce a persisted server cart.
- **Config-file deduplication (TD-11).** The duplicate `Store.config.json` / `config/store.config.json` is a real pre-existing bug surfaced by Q2, but consolidating them is its own change. This chain reads whichever the user designates as authoritative.
- **Inventory ledger / stock audit trail (Epic 14/P2-9).** No reason-codes or who-changed-stock history.

## User Impact

- **Shopper:** stops seeing false "out of stock" on items nobody actually bought; gets a fair hold on stock while paying instead of racing other shoppers at the payment step.
- **Store operator:** inventory counts stop silently drifting down with every abandoned checkout; no manual cancellation needed to reclaim stock.
- **On-call/support:** stock discrepancies stop being an unexplainable class of ticket.

## Success Metrics

- An abandoned checkout releases its held stock automatically within the configured reservation window, with no human action — proven by an automated test that advances past expiry.
- A completed payment consumes exactly one decrement's worth of stock — never zero (lost), never two (double).
- Concurrent checkouts for the last unit: exactly one shopper holds it; the other is told immediately, not at the payment step.
- `grep -rn "stockReservation" server/src/` returns non-zero (the model is actually wired).
- The existing oversell-race regression test still passes unchanged.

## Requirements

Explicit requirements derive from Epic 2's checklist in the Notion source of truth, narrowed by what the repo-alignment scan proved is already done. Implicit requirements derive from `repo-profile.yaml` (protected paths, public contracts), `verification.yaml` (evidence), `domain.yaml` (safety constraints), and `release.yaml` (branch/PR gates).

## Constraints

- **`server/prisma/schema.prisma` is a protected path.** The `StockReservation` model already exists, so the *intent* is no schema change. But this chain may discover a needed index or field, and any migration is a protected-path change requiring explicit approval (Q2 covers the related config question; a schema change would return as a new blocker).
- **`server/src/routes/**` is a declared public contract.** `/api/v1/cart/validate-checkout` and `/api/v1/orders` are consumed by `apps/web`; response shape `{ success, message, data }` must not break, and any new reservation-related field must be additive.
- **Domain constraint (`domain.yaml`):** *"Do not modify payment or checkout logic … without explicit user approval."* The user's instruction to implement Epic 2 is that approval for the checkout/stock path; `payment-confirmation.service.ts` (R3, R5) is squarely payment logic and is covered by the same approval, recorded here.
- **Domain constraint:** no destructive DB commands without approval. No bulk/background mutation is introduced (Q1 → lazy expiry), but Plan must still confirm every reservation status transition that affects `Product.stock` happens inside a transaction.
- **No background-execution infrastructure exists** — this is the single biggest architectural constraint and is why Q1 blocks.
- **Branch policy:** non-default branch required; PR required. Already on `inventory-reservation`, cut from `main` @ `2afecaf`.
- **No secrets, connection strings, or env values in artifacts** (RI4).

## Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| RK1 | Double-decrement: a reservation converts to a decrement while the legacy decrement-at-creation path also runs, halving inventory per order | **High** | The conversion must *replace* the creation-time decrement, not supplement it. One code path owns stock mutation. Test asserts total stock delta per order equals exactly the ordered quantity. |
| RK2 | Lost hold: reservation expires while payment is genuinely in flight → shopper pays for stock that was released to someone else | **High** | Reservation window must exceed the realistic Razorpay completion time (Q2 decides the value); conversion re-validates and fails closed (R5) rather than silently overselling. |
| RK3 | Reservations pile up as permanent phantom holds, which is *worse* than today's bug | **High** | **Structurally eliminated by Q1's resolution** — with lazy expiry there is no sweeper to fail. Availability is computed as `stock` minus *unexpired* active reservations, so an expired hold stops counting the instant anyone reads it, regardless of whether any cleanup ran. Residual: stale `ACTIVE` rows accumulate in the table (housekeeping, not correctness). |
| RK4 | Regressing the just-merged oversell fix while restructuring the same code block | **High** | RI6 makes the existing oversell-race regression test a hard gate; it must pass unchanged at every phase. |
| RK5 | Availability math (`stock` minus active reservations) is computed inconsistently across `validate-checkout`, order creation, and the product read paths → shoppers see three different numbers | Medium | Single shared availability helper; all three call it. Named explicitly in R2 acceptance. |
| RK6 | Sweeper and checkout race on the same reservation rows under concurrency | Medium | Conditional/atomic status transitions (same pattern the merged oversell fix and the payment-integrity coupon guard both use), never read-then-write. |
| RK7 | In-process `setInterval` sweeper multiplies under horizontal scaling (N instances = N sweepers) — the same class of defect as the already-known in-memory rate limiter (TD-12) and OTP cache (S-09) | ~~Medium~~ | **No longer applicable** — Q1 resolved to lazy expiry, so no in-process scheduler is introduced. This chain adds zero new scale-fragile state. |
| RK8 | Guest (`sessionId`-keyed) reservations leak — no login to attribute them to, no cart to clear them from | Medium | Lazy expiry is the backstop for guests exactly as for logged-in users; Plan must confirm the `sessionId` path is covered by the same availability/expiry logic, with a test for the guest case specifically. |

## Open Questions

Q1 and Q2 are blocking — neither is mine to decide, and both change the shape of the implementation rather than just its details. Q3 is non-blocking with a recorded assumption.

## Requirement Manifest

### Explicit (R)

**R1 — Stock is reserved, not decremented, when a shopper enters checkout.** (P0-0 / TD-4 / INV-1)
- Acceptance: entering checkout creates `StockReservation` rows (`status: ACTIVE`, `expiresAt` set from configured duration) for the cart's items.
- Acceptance: `Product.stock` is **not** decremented at reservation time.
- Acceptance: a reservation cannot be created when effective availability is insufficient; the shopper is told at checkout entry, not at payment.
- Acceptance: reservations are attributed to `userId` when authenticated and `sessionId` when not, matching the existing schema fields.

**R2 — Effective availability accounts for other shoppers' active reservations.** (P0-0 supporting)
- Acceptance: one shared helper computes availability as `Product.stock` minus other shoppers' `ACTIVE`, unexpired reservations.
- Acceptance: `/api/v1/cart/validate-checkout`, order creation, and the reservation-creation path all use that same helper — no independent re-derivation.
- Acceptance: a shopper's *own* active reservation does not count against them (they see the units they hold as available to them).
- Acceptance: with the last unit reserved by shopper A, shopper B's `validate-checkout` reports it unavailable.

**R3 — Reservations convert to a real stock decrement exactly once, on confirmed payment.** (TD-4)
- Acceptance: payment confirmation converts the order's `ACTIVE` reservations to `CONVERTED` **and** decrements `Product.stock`, in one transaction.
- Acceptance: the creation-time decrement is removed — total stock delta for one completed order equals exactly the ordered quantity (proves RK1 closed).
- Acceptance: conversion is idempotent — a replayed/duplicate confirmation does not decrement twice (must hold for both confirmation entry points, since `payment-confirmation.service.ts` is shared by the client route and the webhook).
- Acceptance: an already-`CONVERTED` reservation is never re-converted.

**R4 — Expired and released reservations return stock automatically, and stock restoration lives in one transactional place.** (P0-0 / S-05)
- Acceptance: an `ACTIVE` reservation past `expiresAt` **stops counting against availability immediately at read time**, with no background process involved (per Q1 → lazy expiry).
- Acceptance: an abandoned checkout's held stock becomes available again with no human action and no scheduler, within the configured window (30 min, per Q2).
- Acceptance: a stale `ACTIVE`-but-expired row is transitioned to `EXPIRED` opportunistically when a transaction next touches it; correctness must not depend on that transition having happened.
- Acceptance: order cancellation releases reservations (`RELEASED`) or restores stock, as appropriate to whether payment converted.
- Acceptance: the three existing stock-restore loops (`order.routes.ts:607`, `webhook.routes.ts:160`, `:192`) are replaced by one shared transactional helper called from all three sites.
- Acceptance: a crash partway through restoration leaves stock either fully restored or untouched, never partially.

**R5 — Payment confirmation re-validates stock and fails closed.** (Part-12 open item)
- Acceptance: confirmation rejects when the order's reservation is missing/expired **and** current availability cannot cover the order.
- Acceptance: confirmation rejects when a product has been deactivated since order creation.
- Acceptance: rejection leaves the order unconfirmed (not `PAID`) rather than confirming with negative or borrowed stock.
- Acceptance: the legitimate happy path still confirms.

**R6 — Documentation matches shipped behaviour.** (DRIFT-1)
- Acceptance: `CLAUDE.md`'s stock/reservation description reflects what the code actually does after this chain.
- Acceptance: no remaining claim of a soft-lock mechanism that does not exist.

### Implicit (RI)

**RI1 — Server-side test coverage for every reservation state transition.** (from `verification.yaml` evidence rules; harness exists from the payment-integrity chain)
- Acceptance: `npm run test --workspace=server` exits 0.
- Acceptance: at least one test per R1–R5, each failing before its fix and passing after.
- Acceptance: a concurrency test proves two simultaneous checkouts for one remaining unit produce exactly one reservation.
- Acceptance: an expiry test proves held stock returns to availability after the window (time advanced deterministically, not by sleeping).

**RI2 — Public API contract preserved.** (`repo-profile.yaml` → `paths.public_contracts`)
- Acceptance: `{ success, message, data }` envelope unchanged.
- Acceptance: any new reservation-related response field is additive; no existing field removed or retyped.
- Acceptance: `apps/web` builds and its existing tests pass without modification, or any required client change ships in the same chain (as the coupon contract change did in the payment-integrity chain).

**RI3 — Protected-path handling is explicit.** (`repo-profile.yaml` → `paths.protected`)
- Acceptance: no `server/prisma/schema.prisma` change without explicit user approval recorded in this chain's artifacts.
- Acceptance: if Build discovers a migration is unavoidable, it stops and returns a new blocker rather than proceeding.

**RI4 — No secrets in artifacts or logs.** (`domain.yaml` safety constraints)
- Acceptance: only env var *names* appear in artifacts; no values, connection strings, or keys.

**RI5 — Branch and PR policy honoured.** (`repo-profile.yaml`, `release.yaml`)
- Acceptance: all work lands on `inventory-reservation`, never directly on `main`.
- Acceptance: Ship opens the PR; Build neither pushes nor opens one.

**RI6 — The merged oversell-race fix is not regressed.** (protects PR #3's work)
- Acceptance: the atomic conditional stock guard remains in place (or is superseded by an equivalent-or-stronger reservation-based guarantee, proven by test).
- Acceptance: the `CHECK (stock >= 0)` DB constraint still holds — no code path drives stock negative.
- Acceptance: a concurrent-checkout oversell test passes at every phase of this chain.

### Assumptions (A)

- **A1** — Base branch is `inventory-reservation`, cut from `main` @ `2afecaf` (PR #5 merge commit). Verified this session via `gh pr view 5` (state `MERGED`) and by confirming `payment-confirmation.service.ts` is present on `origin/main`. Plan must not re-open the base-branch question.
- **A2** — Epic 2's "overselling race closed" checklist item is **already satisfied** by the merged `oversell-race-fix` chain and is therefore scoped out of this chain's *fix* work while remaining in scope as a regression guard (RI6). Verified by reading `order.routes.ts:69-87` on the current branch.
- **A3** — The existing server test harness (Vitest + supertest, `*_test` schema rebuilt per run) from the payment-integrity chain is reusable as-is for RI1; no new harness is needed. Verified present at `server/tests/`.
- **A4** — `payment-confirmation.service.ts` is the correct single place to hook R3 conversion and R5 re-validation, because the payment-integrity chain already unified both confirmation entry points (client route + `payment.captured` webhook) through it. Building the conversion anywhere else would re-fragment what that chain just consolidated.
- **A5** — Reservations are per-order-attempt, not a persistent server cart. Creating a reservation is an explicit checkout-entry action, not a side effect of adding to cart. (If the user intends add-to-cart reservations, that materially changes R1 and should be raised before Plan.)

### Open Questions (Q)

**Q1 — Where does reservation expiry run?**
- Context: this repo has **no background-execution infrastructure at all** — no `node-cron`, no `bullmq`, no worker process, no `setInterval` anywhere in `server/src`. A reservation system needs expiry to actually happen. The options differ in operational risk, not just implementation effort, and one of them (in-process interval) reproduces a defect class the audit already flagged twice (TD-12 in-memory rate limiter, S-09 in-memory OTP store — both break under horizontal scaling).
- Options: (a) lazy expiry only — evaluate `expiresAt` at read time, no background process, zero new infra; (b) in-process `setInterval` sweeper + lazy expiry as backstop; (c) `node-cron` dependency + lazy expiry; (d) external cron calling a protected admin endpoint.
- Owner: user
- Blocking: **yes**
- Note: (a) is the smallest correct option — expired reservations stop counting against availability the moment anyone reads availability, so stock is never permanently frozen even with zero background execution. Rows accumulate as `ACTIVE`-but-expired until something sweeps them, which is a housekeeping concern, not a correctness one.
- **RESOLVED 2026-07-25 — option (a), lazy expiry only.** User: *"Q1: Go as per your recommendation"*. No background scheduler, no new dependency, no `setInterval`. Expiry is evaluated at read time (availability computation) and on any transition that touches a reservation. A physical sweeper is explicitly deferred to Epic 10, when real job infrastructure exists — recorded in Non-Goals and as a Reflect follow-up.

**Q2 — Which `reservationDurationMinutes` value is authoritative, and from which file?**
- Context: `config/store.config.json` says **30**; root `Store.config.json` says **15**. `server/src/utils/config.ts:105` reads `path.join(process.cwd(), '..', 'config', 'store.config.json')` — i.e. the **30** one, when cwd is `server/`. `CLAUDE.md` cites the root `Store.config.json` (the 15 one) as the runtime config. So the documented file and the actually-read file disagree, and so do their values. This directly sets RK2's safety margin — too short and shoppers lose held stock mid-payment.
- Owner: user
- Blocking: **yes**
- **RESOLVED 2026-07-25 — 30 minutes, from `config/store.config.json`.** User: *"Q2: go with the authoritative one"*. Interpreted as *the file that actually governs runtime behaviour* — `server/src/utils/config.ts:105` reads `config/store.config.json` (value `30`), so that is what is in force today; the root `Store.config.json` (`15`) is an unread duplicate. This reading was stated explicitly back to the user when recording it, so it is correctable. The 30-minute window is also the safer choice for RK2 (more headroom before a hold expires mid-payment). The duplicate-file bug itself remains out of scope (TD-11) and is carried as a Reflect follow-up.

**Q3 — Should `validate-checkout` create reservations, or is reservation a separate explicit step?**
- Context: `/api/v1/cart/validate-checkout` is already called on checkout page load (`apps/web/src/app/checkout/page.tsx`) and already takes a `sessionId`. Making it reserve is the smallest client change (possibly zero). But it is currently a read-only validation endpoint, and making a `POST /validate-*` mutate stock state is a contract-semantics change reviewers may object to.
- Owner: Plan (technical/contract decision, not product policy)
- Blocking: no — proceeding on A5 (reservation is a checkout-entry action); Plan decides the exact endpoint shape and records the rationale.

## Questions For User

Both blocking questions are resolved (see Open Questions (Q) above). No questions remain outstanding.

1. ~~**(Q1, blocking)** Where should reservation expiry run?~~ — **Answered:** lazy expiry only, per the recommendation.
2. ~~**(Q2, blocking)** Which reservation duration is authoritative?~~ — **Answered:** the authoritative one, interpreted as the file actually read at runtime → `config/store.config.json`, 30 minutes. Stated explicitly back to the user when recorded, so it is correctable if the reverse was intended.

Remaining gate: brief approval before Plan starts (the user asked to be consulted at every phase transition).

## Architecture Notes

- **role:** Architect
- **decision (architecture-decision-advisor):** make the **reservation the authoritative availability mechanism**, replacing decrement-at-creation entirely — rather than layering reservations on top of the existing decrement as an additional check.
  - *Rationale:* two mechanisms both claiming to own stock is precisely how RK1 (double-decrement) happens. The merged `oversell-race-fix` proved the atomic-conditional pattern works here; reservations extend that same guarantee across the payment window instead of competing with it. One code path mutates `Product.stock`, and it runs exactly once per order, at confirmation.
  - *Rejected — reservations as an advisory overlay* (create reservations, keep decrementing at creation): smaller diff, but leaves the P0-0 abandoned-cart bug completely unfixed, which is the entire point of the epic. Purely additive complexity for zero user benefit.
  - *Rejected — decrement at creation + a compensating "reaper" that re-increments abandoned orders:* avoids the reservation model entirely and could be done in a day, but it makes every abandoned checkout a write-then-undo against real inventory, and any reaper failure silently loses stock permanently. The reservation model already exists in the schema specifically to avoid this.
  - *Precedent:* `payment-confirmation.service.ts` (from the payment-integrity chain) is the established in-repo pattern for a single transactional service owning a money-path state transition with both entry points delegating to it. R3/R5 follow it rather than inventing a new shape.
- **constraint:** `schema.prisma` protected (no change intended — the model exists; a discovered need returns as a blocker per RI3). `server/src/routes/**` is a public contract — additive response fields only.
- **constraint:** no background-execution infrastructure exists, and per Q1 this chain introduces none. Every correctness guarantee in R1–R5 must hold with zero background execution — Plan may not sequence any requirement behind a scheduler.
- **tradeoff (accepted, Q1):** lazy-only expiry leaves expired `ACTIVE` rows in the table until something sweeps them — a housekeeping wart, not a correctness bug. Accepted as the right trade for not introducing scale-fragile in-process scheduling into a repo that already has two such defects logged (TD-12, S-09). The upside is structural: with no sweeper, there is no sweeper to fail (RK3 eliminated rather than mitigated).
- **decision (Q2):** reservation duration reads from `config/store.config.json` (`inventory.reservationDurationMinutes`, currently 30) — the file `server/src/utils/config.ts` actually loads. Build must read it through the existing `getStoreConfig()` accessor, never hardcode 30, so the value stays operator-tunable.
- **tradeoff:** this chain touches `order.routes.ts` and `payment-confirmation.service.ts` — both just modified by two other chains that merged within hours of each other. Concentrating further change there raises regression risk, mitigated by RI6 and the existing 54-test suite.
- **assumption Plan must preserve:** A1 (base settled), A2 (oversell already fixed — guard, don't re-fix), A4 (conversion belongs in `payment-confirmation.service.ts`).
- **downstream — Plan:** must sequence R1/R2 (reserve + availability) before R3 (convert), since conversion has nothing to convert otherwise; R4's shared restore helper should land with or before R3 to avoid a window where restoration and conversion disagree. Must decide Q3.
- **downstream — Build:** the creation-time decrement removal (R3) and reservation creation (R1) must land together or stock is briefly unmanaged — Plan should make that a single phase, not two.
- **downstream — Test:** RI1's expiry test needs deterministic time control (injected clock or manipulated `expiresAt`), not `sleep` — a wall-clock test of a 15–30 minute window is not runnable.
- **downstream — Ship:** no deploy impact from expiry (lazy, no new infra, no new dependency, no new env var). Ship must still state plainly that reservation rows are never physically swept in this chain.
- **downstream — Reflect:** two follow-ups to carry forward — (1) the duplicate `Store.config.json` / `config/store.config.json` files with divergent values, to TD-11; (2) a physical sweeper for stale `ACTIVE` reservation rows, to Epic 10.

## Checkpoint Approval

- Checkpoint: brief-review
- Status: approved
- Date: 2026-07-25
- User's own words (verbatim, this turn): "yes, start plan"
- Prior turn, resolving both blocking questions (verbatim): "Q1: Go as per your recommendation, Q2: go with the authoritative one."
- Scope of approval: this brief as written — R1–R6 and RI1–RI6 all active, no requirement waived. Q2's interpretation (authoritative = the runtime-loaded `config/store.config.json`, 30 minutes) was stated explicitly to the user both when recorded and again at the approval prompt, and was not contested.

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs appear in `orchestration.blockers` (Q1, Q2 — both now resolved, list empty).
- [x] User approved or waiver recorded. — approved; no waivers.
