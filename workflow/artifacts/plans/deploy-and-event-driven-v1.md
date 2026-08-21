---
slug: deploy-and-event-driven
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-08-18
updated: 2026-08-18
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10, RI11]
upstream:
  - workflow/artifacts/briefs/deploy-and-event-driven-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Production Deployment + Event-Driven API - Plan

## Summary

Eight phases, sequenced so the deployment ships independently of the queue work. Phase 1 is a
compatibility fix, because inspecting the repo during planning invalidated the brief's assumption A3:
this codebase leans on `SELECT ... FOR UPDATE` and `SERIALIZABLE` isolation in ways TiDB does not
support identically. That was raised as **Q5** and is now resolved (see Q5 below) — TiDB implements
`SERIALIZABLE` as snapshot isolation, which permits write skew: on `issueRefund` specifically, two
concurrent calls on the same RMA can both pass the status check and both fire a real Razorpay refund,
double-refunding the customer. The remedy is explicit `SELECT ... FOR UPDATE` row locks at all three
`rma.service.ts` call sites, replacing the `isolationLevel: Serializable` option, which TiDB cannot
honor at all and which `tidb_skip_isolation_level_check` would only silence rather than fix.

Phases 2–4 deliver a working deployment. Phases 5–8 add the queue layer incrementally, ordered by
risk so the protected webhook path is touched only after the pattern is proven on a low-risk consumer.

## Inputs

- Approved brief: `workflow/artifacts/briefs/deploy-and-event-driven-v1.md` (checkpoint `brief-review`
  approved 2026-08-18).
- Decisions from brief Q1–Q4: webhook modification approved; BullMQ; Upstash Redis; all three extra
  seams in scope.
- `workflow/config/repo-profile.yaml` — protected paths, generated outputs, branch policy.
- `workflow/config/verification.yaml` — `npm run build` (required), `npm run lint`, `npm run db:migrate`.
- `workflow/config/domain.yaml` — payment/checkout constraints.
- Repo inspection performed during this phase (see Repo Impact Map).

## Requirement Coverage

| Manifest ID | Covered by phases | Notes |
|---|---|---|
| R1 | Phase 3 (owning) | Env-correct config for both Next apps. |
| R2 | Phase 4 (owning), Phase 3 | Session isolation; verified by manual two-tab QA. |
| R3 | Phase 1, Phase 4 (owning) | Gated on Q5 resolution in Phase 1. |
| R4 | Phase 5 (owning), Phases 6–8 | Queue layer exists and is exercised. |
| RI1 | Phase 2 (owning) | Storage fail-fast. Net-negative diff, no dependencies. |
| RI2 | Phase 3 (owning) | Preserve host-only cookies; guard rail, not new code. |
| RI3 | Phase 3 (owning) | `R2_PUBLIC_URL` at build time in both Vercel projects. |
| RI4 | Phase 7 (owning) | Protected path. Deliberately last of the high-value seams. |
| RI5 | Phase 6 (owning) | Reservation sweeper — first queue consumer. |
| RI6 | Phase 8 (owning) | Re-run every phase; Phase 8 owns the final green gate. |
| RI7 | Phase 3 (owning) | Secret handling concentrated where env is configured. |
| RI8 | Phase 4 (owning) | Spin-down implications documented. |
| RI9 | Phase 3 (owning) | Production CORS + cross-service URLs. |
| RI10 | Phase 5 (owning) | Upstash command-quota tuning; consequence of Q3. |
| RI11 | Phase 8 (owning) | Remaining three seams; OTP seam may be reverted. |

No active R/RI is unmapped. No ID is multiply-owned.

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `server/src/services/storage.service.ts` | delete + modify | RI1 | Remove `uploadToLocal`, drop `'local'` from prod path. ~−30/+5. |
| `server/src/index.ts` | delete + modify | RI1, RI9 | Remove `uploadsRoot` (L32) and `/uploads` static (L117); startup guard; CORS origins. |
| `server/src/services/invoice.service.ts` | simplify | RI1, RI11 | Drop dual disk+memory write and the `provider === 'local'` branch. ~−15. |
| `server/src/services/email.service.ts` | modify | RI1 | Guard mock-preview disk write at L82. |
| `server/src/services/rma.service.ts` | modify | R3, Q5 | 3× `TransactionIsolationLevel.Serializable` (L207, L307, L375) replaced with `FOR UPDATE` locked reads. |
| `server/src/services/inventory.service.ts` | modify (RI5 only) | RI5, Q5 | `FOR UPDATE` at L116 unchanged, verified under TiDB; sweeper consumer added separately. |
| `server/src/routes/cart.routes.ts` | verify, no edit | Q5 | `FOR UPDATE` at L12. Single-row lock by PK — behaviour check only. |
| `server/src/routes/webhook.routes.ts` | **modify (protected)** | RI4 | L124–131 enqueue instead of await. Q1-approved, narrow scope. |
| `server/src/routes/order.routes.ts` | modify | RI11 | L333 invoice generation → enqueue. |
| `server/src/routes/admin.routes.ts` | modify | RI11 | L946/1062/1106 shipping emails → enqueue. |
| `server/src/routes/auth.routes.ts` | modify | RI11 | L266 OTP email → enqueue (revertible; see Risk R-7). |
| `server/src/queues/**` | new | R4, RI10 | Queue definitions, worker registration, job handlers. |
| `server/package.json` | modify | R4 | Add `bullmq`, `ioredis`. |
| `apps/web/next.config.js` | modify | RI2, RI3 | Keep rewrites; drop `localhost` remote pattern in prod. |
| `apps/admin/next.config.js` | modify | RI2, RI3 | Same. |
| `apps/web/.env.local.example` | modify | R1, RI7 | Document every var actually read. |
| `apps/admin/.env.local.example` | modify | R1, RI7 | Same. |
| `docs/deployment.md` | new | RI8, R3 | Env matrix (names only), cold-start behaviour, quota behaviour. |
| `server/prisma/schema.prisma` | **no content change** | R3 | Protected. TiDB migration is connection-string only. |

## Source-of-Truth Strategy

`source-of-truth.yaml` names Notion providers, but no Notion page was supplied for this work and the
request originated in-session. **Strategy: repo-local only.** Artifacts in `workflow/artifacts/**` are
the record. No external tracker read or write is planned. If the user wants this reflected in Notion,
that is a Ship-phase handoff and needs an explicit page target.

## Approach

Three principles drive the sequencing:

1. **Deployment ships before the queue.** The brief flagged the coupling risk; Phases 2–4 are a
   complete, deployable increment. If queue work stalls, the deployment still lands.
2. **Prove database compatibility before building on it.** Q5 is unresolved and cheap to answer
   empirically but expensive to discover late — it gets Phase 1 with a hard exit gate.
3. **Touch the protected webhook last among high-value work.** The queue pattern is proven on the
   reservation sweeper (Phase 6, no payment exposure) before Phase 7 goes near Razorpay.

## Phases

### Phase 1 - TiDB compatibility fix (locked-read remedy)

- **Manifest IDs:** R3 (partial), Q5
- Touches: `server/src/services/rma.service.ts` (L207 `approveRmaRequest`, L307 `markReceived`,
  L375 `issueRefund`), `server/src/services/inventory.service.ts` (read-only verification),
  `server/src/routes/cart.routes.ts` (read-only verification), `server/prisma/` migrations
- Work:
  1. Provision TiDB Serverless; run `prisma migrate deploy` against it.
  2. In each of the three `rma.service.ts` transactions, replace the initial
     `tx.rMARequest.findUnique(...)` with a locked read — `SELECT ... FOR UPDATE` on the `RMARequest`
     row by `id`, via `tx.$queryRaw`/`Prisma.sql`, following the same pattern already proven at
     `inventory.service.ts:116` — before the existing `status` check runs. Where a call site also
     needs `items`/`orderItem`/`refund` relations, lock the `RMARequest` id first, then fetch the
     relations, so the lock is acquired before any status decision is made.
  3. Remove the `{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }` option from all
     three `prisma.$transaction` calls — the row lock is what now provides the guarantee; the
     isolation hint TiDB cannot honor is deleted, not silenced.
  4. Do **not** set `tidb_skip_isolation_level_check` anywhere — it makes TiDB accept the
     `SERIALIZABLE` keyword without error while actually running snapshot isolation, which is the
     exact silent downgrade this fix exists to avoid.
  5. Add a concurrency test per site proving the fix: two simultaneous calls to `issueRefund` on the
     same `rmaId` must result in exactly one `Refund.status = 'PAID'` transition and exactly one
     Razorpay refund call (assert via `isPaymentsMockMode()` call count); same pattern (single
     winner, second call throws the existing "Only PENDING requests..." error) for
     `approveRmaRequest` and `markReceived`.
  6. Verify (read-only, no code change expected) that the existing `FOR UPDATE` sites in
     `cart.routes.ts:12` and `inventory.service.ts:116` behave correctly under TiDB — both lock a
     single row by primary key, not a range, so they do not depend on gap locks and are expected to
     be unaffected; run `server/tests/services/inventory.service.test.ts` against TiDB to confirm.
- **Exit gate:** `prisma migrate deploy` exits 0 against TiDB; all three `rma.service.ts` sites use a
  locked read with no `isolationLevel` option remaining anywhere in the file; the three new
  concurrency tests pass, each demonstrating exactly one winner under simultaneous calls;
  `server/tests/services/inventory.service.test.ts` and the full characterization suite pass against
  TiDB; `grep -rn "tidb_skip_isolation_level_check" server/` returns nothing.

### Phase 2 - Storage fail-fast

- **Manifest IDs:** RI1
- Touches: `storage.service.ts`, `index.ts`, `invoice.service.ts`, `email.service.ts`
- Work: delete `uploadToLocal` from the production path; add a startup guard that refuses to boot when
  `NODE_ENV=production` and `getActiveProvider() === 'local'`; remove `/uploads` static serving;
  collapse `invoice.service.ts` to buffer-then-upload; guard the email mock-preview write.
- **Exit gate:** with `NODE_ENV=production` and no storage env vars, the server exits non-zero with a
  named error; with R2 vars set it boots and an upload returns an R2 URL; in dev with no vars the
  local path still works; `grep` finds no remaining `express.static` for uploads.

### Phase 3 - Environment, CORS, and isolation guard rails

- **Manifest IDs:** R1, RI2, RI3, RI7, RI9
- Touches: both `next.config.js`, both `.env.local.example`, `server/src/index.ts`
- Work: document every env var each app reads; wire `FRONTEND_URL`/`ADMIN_URL`/`SERVER_BASE_URL` for
  production origins; confirm both rewrite blocks remain and no `res.cookie` call gains a `domain`
  option; ensure `R2_PUBLIC_URL` is consumed at build time.
- **Exit gate:** `grep -rn "domain" server/src/**/*.ts` returns no cookie-domain option; both
  `next.config.js` files still contain the `/api/:path*` rewrite; both `.env.local.example` files list
  every variable the app reads with no values present; `npm run build` passes at root.

### Phase 4 - Deploy web, admin, and API

- **Manifest IDs:** R2, R3, RI8
- Touches: hosting configuration; `docs/deployment.md` (new)
- Work: two Vercel projects (root dirs `apps/web`, `apps/admin`); Render web service for `server`
  with build `npm install && npm run build --workspace=server`, start `npm start --workspace=server`;
  point `DATABASE_URL` at TiDB; write the deployment doc including cold-start and idle behaviour.
- **Exit gate:** all three URLs respond (API `/health` returns success); a product list renders on web
  from TiDB data; the documented manual two-tab QA passes — customer session on web and admin session
  on admin simultaneously valid, and browser devtools confirm no `Domain` attribute on either origin's
  auth cookies; `docs/deployment.md` states cold-start behaviour.

### Phase 5 - Queue foundation

- **Manifest IDs:** R4, RI10
- Touches: `server/package.json`, `server/src/queues/**`, `server/src/index.ts`
- Work: add `bullmq` + `ioredis`; provision Upstash; define queue and worker registration started
  in-process (C3); configure polling explicitly against Upstash's per-command billing; add a trivial
  round-trip job to prove the path.
- **Exit gate:** a job enqueued via an HTTP handler is observably processed by the worker outside the
  request lifecycle; a deliberately throwing job retries per configured backoff and ends in the failed
  set without crashing the process; the task artifact records the configured poll interval and a
  projected idle-command-per-day figure that sits inside Upstash's current free quota, with the quota
  figure cited from Upstash docs as read on the build date.

### Phase 6 - Reservation sweeper

- **Manifest IDs:** RI5
- Touches: `server/src/services/inventory.service.ts`, `server/src/queues/**`
- Work: repeatable job deleting/releasing `StockReservation` rows past `expiresAt`. Leave the existing
  lazy read-time expiry (`inventory.service.ts:74`) intact as the correctness guarantee — the sweeper
  is cleanup, not correctness.
- **Exit gate:** a test seeds expired and active reservations, runs the sweeper, and asserts only
  expired rows are removed; `inventory.service.test.ts` still passes; the lazy-expiry filter at L74 is
  unchanged.

### Phase 7 - Webhook enqueue (protected path)

- **Manifest IDs:** RI4
- Touches: `server/src/routes/webhook.routes.ts` (protected — Q1-approved)
- Work: replace the awaited `generateInvoicePdf` + `sendOrderConfirmationEmail` at L124–131 with an
  enqueue. Signature verification and the raw-body parsing at `index.ts:107` are **out of scope** per
  the brief's non-goals.
- **Exit gate:** `server/tests/characterization/webhook.test.ts` passes unmodified; `git diff` on
  `webhook.routes.ts` shows no change to signature verification or raw-body handling; the handler no
  longer awaits PDF or SMTP work; a queued invoice job completes after the webhook has already acked.

### Phase 8 - Remaining seams and final gate

- **Manifest IDs:** RI11, RI6
- Touches: `order.routes.ts` (L333), `admin.routes.ts` (L946/1062/1106), `auth.routes.ts` (L266)
- Work: convert the three Q4-selected seams to enqueue with retry config. Measure OTP delivery
  latency end to end including a cold-start case; revert that seam to synchronous if unacceptable.
- **Exit gate:** each of the five call sites enqueues rather than awaits, or is explicitly recorded as
  reverted with the measured latency that justified it; `npm run build` and `npm run lint` pass at
  repo root; all `server/tests/**` and `apps/web` suites pass.

## Dependency Order

```
Phase 1 (TiDB fix) ──┬─> Phase 4 (deploy) ──> Phase 5 (queue) ──> Phase 6 (sweeper) ──> Phase 7 (webhook) ──> Phase 8
Phase 2 (storage) ─────┤                                                    │
Phase 3 (env/CORS) ────┘                                                    └─ Phase 6 must pass before Phase 7 begins
```

- Phases 2 and 3 are independent of Phase 1 and of each other; either may run first.
- Phase 4 requires 1, 2, and 3.
- **Phases 2–4 form a shippable increment.** The chain may stop there with queue work deferred.
- Phase 7 must not begin until Phase 6's exit gate has passed — that is what makes the pattern proven
  before the payment path is touched.

## Branch Strategy

- Base: **`inventory-reservation`**, not `main`. That branch is 6 commits ahead of `main` and
  unmerged, and RI5's sweeper builds directly on its `StockReservation` work. Branching from `main`
  would put the sweeper on top of code that does not exist there.
- Working branch: `deploy-and-event-driven`.
- Consequence: this chain cannot merge to `main` until `inventory-reservation` merges first. Recorded
  as Risk R-8.
- No commits to `main`. One commit per phase, each citing its manifest IDs.
- Uncommitted at plan time: only this chain's own artifacts.

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|
| R-1 TiDB implements `SERIALIZABLE` as snapshot isolation; write skew lets two concurrent RMA actions both pass a status check — worst case, `issueRefund` double-fires a real Razorpay refund | High | Critical | Phase 1 replaces isolation hint with `FOR UPDATE` locked reads at all 3 sites; forbid `tidb_skip_isolation_level_check`; 3 concurrency tests prove single-winner behavior | Build | R3, Q5 |
| R-2 TiDB `FOR UPDATE` has no gap locks, unlike MySQL InnoDB | Low | Low | Existing sites lock a single row by primary key, not a range — not gap-lock-dependent. Phase 1 verifies with existing tests, no code change expected | Build | R3, Q5 |
| R-3 Webhook change breaks HMAC verification on a payment path | Low | Critical | Non-goal fences signature/raw-body; characterization suite must pass unmodified; Phase 7 gated behind Phase 6 | Build/Review | RI4 |
| R-4 Upstash free command quota exhausted by BullMQ idle polling | Medium | Medium | RI10 explicit poll tuning + documented projection; failure mode is delay, not loss | Build | RI10 |
| R-5 Render idle spin-down halts in-process worker | High | Low | Accepted; documented in RI8. Lazy expiry means sweeper delay is not a correctness issue | Build | RI8, RI5 |
| R-6 Storage misconfig in prod silently 404s uploads | Medium | High | RI1 startup guard converts it to a boot failure | Build | RI1 |
| R-7 Queued OTP email arrives too late on a flow the user is waiting on | Medium | Medium | Phase 8 measures latency incl. cold start; seam is revertible by design | Build | RI11 |
| R-8 Chain cannot merge until `inventory-reservation` merges | High | Low | Known and accepted; surfaced at Ship | Ship | — |
| R-9 In-process `NodeCache` OTP store (`auth.routes.ts:16`) is lost on restart/spin-down | Medium | Medium | Document in RI8; combined with R-7 this makes password reset the weakest flow — flag to Review | Build/Review | RI8 |

Every risk has a mitigation or an explicit acceptance.

## Verification Plan

| Manifest ID | Evidence | Owner phase | Notes |
|---|---|---|---|
| R1 | command: `npm run build` | Phase 3 | Plus inspection of both `.env.local.example`. |
| R2 | manual QA: two-tab session check | Phase 4 | Scenario/steps/expected/observed recorded per `verification.yaml` `manual_qa`. |
| R3 | command: `prisma migrate deploy`; `server/tests/**`; 3 new concurrency tests | Phase 1, 4 | Against TiDB, not local MySQL. Concurrency tests prove single-winner on simultaneous RMA actions. |
| R4 | manual QA + job-state inspection | Phase 5 | Round-trip and failure/retry both demonstrated. |
| RI1 | command: boot with/without storage env | Phase 2 | Non-zero exit is the pass condition. |
| RI2 | review: grep for cookie `domain`; rewrites present | Phase 3 | Guard rail, verified by inspection. |
| RI3 | command: `npm run build` with `R2_PUBLIC_URL` set | Phase 3 | Image host resolves. |
| RI4 | command: `server/tests/characterization/webhook.test.ts` | Phase 7 | Must pass **unmodified**. |
| RI5 | command: new sweeper test | Phase 6 | Expired removed, active retained. |
| RI6 | command: `npm run build`, `npm run lint` | Phase 8 | Configured required commands. |
| RI7 | review: artifact scan for secrets | Phase 3 | Names only, no values. |
| RI8 | generated-output: `docs/deployment.md` | Phase 4 | Source-mapped to real hosting config. |
| RI9 | manual QA: cross-origin request from both apps | Phase 4 | CORS allowlist admits both. |
| RI10 | generated-output: documented quota projection | Phase 5 | Cites Upstash limits as read on build date. |
| RI11 | command: suites + measured OTP latency | Phase 8 | Revert recorded if seam dropped. |

No R/RI lacks evidence. No waivers are recorded in this plan.

## Architecture Notes

- **role:** Principal Engineer

- **decision — Phase 1 exists because planning invalidated A3.** The brief assumed TiDB wire
  compatibility was sufficient. Inspection found `SERIALIZABLE` isolation at `rma.service.ts`
  L207/L307/L375 and `SELECT ... FOR UPDATE` at `cart.routes.ts:12` and `inventory.service.ts:116`.
  Researched and confirmed: TiDB implements `SERIALIZABLE` as snapshot isolation (permits write
  skew), and its pessimistic locking has no gap locks. This is load-bearing code — it is the
  oversell-prevention and refund-integrity work from the six unmerged commits on
  `inventory-reservation`. Raised as Q5, now resolved with an evidenced remedy rather than left as
  an assumption.

- **decision — Q5 resolved: explicit `FOR UPDATE` row locks replace `SERIALIZABLE` at all three
  `rma.service.ts` sites.** All three transactions share a read-check-write shape on the
  `RMARequest` row with no lock — TiDB's snapshot isolation no longer blocks two concurrent calls
  from both passing the status check. Concretely: `approveRmaRequest` could double-decrement stock,
  `markReceived` could double-increment it, and `issueRefund` — the most serious — could fire two
  real Razorpay refund API calls for one RMA, refunding the customer twice. Locking the
  `RMARequest` row by id before the status check (same pattern as `inventory.service.ts:116`) makes
  the second concurrent call see the post-update status and hit the existing `Error`, which was
  always the intended behavior. Rejected: `tidb_skip_isolation_level_check` — makes TiDB accept the
  `SERIALIZABLE` keyword while silently running the same weaker isolation, hiding the exact defect
  this fix removes. Rejected: leaving `SERIALIZABLE` in place and hoping TiDB errors loudly — it
  does not; it degrades silently, which is worse than an explicit, honest lock.

- **downstream from Q5 resolution:** `cart.routes.ts:12` and `inventory.service.ts:116` need no code
  change — both lock a single row by primary key, not a range, so the missing-gap-locks difference
  does not apply to them. Phase 1 still runs their existing tests against TiDB to confirm rather than
  assume.

- **decision — worker in-process.** Forced by C3 (Render free has no worker service type). Rejected: a
  paid worker; an external cron pinging an endpoint, which adds a vendor and re-implements retry
  badly.

- **decision — sweeper before webhook.** Phase 6 proves enqueue/retry/failure on a path with no
  payment exposure, so Phase 7 changes a protected file with the mechanism already trusted.

- **constraint:** C1 (webhook protected, narrowly approved), C3/C4 (no free worker, idle spin-down),
  C5 (ephemeral disk), C6 (build-time `R2_PUBLIC_URL`), C7 (no secrets), C8 (non-default branch).

- **tradeoff — branching off an unmerged branch.** Basing on `inventory-reservation` couples this
  chain's merge to that one (R-8). Rejected alternative: branch from `main` and cherry-pick the
  reservation work, which would duplicate commits and risk divergence.

- **tradeoff — eight phases is a lot for one chain.** Kept as one chain because Phases 2–4 are
  explicitly shippable alone, so the chain has a natural stopping point if scope proves too large.

- **assumptions Build must preserve:** lazy expiry at `inventory.service.ts:74` stays as the
  correctness guarantee; the Next rewrite proxy stays in both apps (RI2); raw-body parsing at
  `index.ts:107` is untouched.

- **downstream:**
  - *Build* — Phase 1 is a gate, not a formality; do not proceed to Phase 4 on a partial pass.
  - *Review* — focus on `webhook.routes.ts` diff scope, any cookie `domain` option, and the Phase 1
    isolation remedies. R-9 (OTP in NodeCache) is flagged for a Review opinion.
  - *Test* — characterization suite must pass unmodified; R2 and RI9 need manual QA records.
  - *Ship* — record real URLs and env var names only; surface R-8 merge ordering.
  - *Reflect* — A3 being wrong is the main lesson candidate.

## Open Questions

- **Q5 — How should the TiDB incompatibilities be remedied?** Raised in Plan, converted from brief
  assumption A3 which repo evidence contradicted.
  **RESOLVED 2026-08-18.** Researched TiDB's actual isolation and locking behavior (PingCAP docs,
  confirmed via web search), then read all three `rma.service.ts` transaction bodies in full. Remedy:
  replace `{ isolationLevel: Serializable }` with an explicit `SELECT ... FOR UPDATE` locked read on
  the `RMARequest` row at the top of `approveRmaRequest` (L207), `markReceived` (L307), and
  `issueRefund` (L375), before each transaction's status check. `cart.routes.ts:12` and
  `inventory.service.ts:116` need no change — single-row PK locks, not range locks, so they don't
  depend on TiDB's missing gap locks. Full detail folded into Phase 1, Repo Impact Map, Risk Register
  (R-1, R-2), and Architecture Notes.
  No blocker remains from Q5.

## Checkpoint Approval

- Checkpoint: plan-review
- Status: approved
- Date: 2026-08-18
- User's own words (verbatim, this turn): "approved, proceed to build"

## Exit Gate

- [x] Every active R and RI mapped to a phase with exactly one owning phase.
- [x] Every phase has a binary exit gate.
- [x] Verification plan covers every R and RI.
- [x] Dependency order explicit; branch strategy explicit and non-default.
- [x] Every risk has mitigation or explicit acceptance.
- [x] User approved or waiver recorded.
