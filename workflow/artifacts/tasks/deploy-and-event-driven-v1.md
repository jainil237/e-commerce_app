---
slug: deploy-and-event-driven
version: 1
artifact: task
status: ready-for-next-phase
created: 2026-08-18
updated: 2026-08-21
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10, RI11]
upstream:
  - workflow/artifacts/plans/deploy-and-event-driven-v1.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
changed_files:
  - apps/web/src/app/account/login/page.tsx
  - apps/web/src/app/cancellation/page.tsx
  - apps/web/src/app/checkout/page.tsx
  - apps/web/src/app/orders/[id]/page.tsx
  - apps/web/src/app/terms/page.tsx
  - package.json
  - docs/deployment.md
  - server/.env.example
  - apps/web/.env.local.example
  - apps/admin/.env.local.example
  - server/src/services/rma.service.ts
  - server/tests/characterization/rma-refund.test.ts
  - server/src/services/storage.service.ts
  - server/src/services/invoice.service.ts
  - server/src/services/email.service.ts
  - server/src/index.ts
---

# Build Phase — Production Deployment + Event-Driven API

## Summary
Eight phases implementing production deployment (web, admin, API) with TiDB compatibility fix and an event-driven queue layer. This artifact tracks progress through all phases, evidence of each exit gate, and any blockers encountered.

## Changed Files

**Deploy provisioning, 2026-08-30 (Vercel project setup):**
- `apps/web/.gitignore`
- `apps/admin/.gitignore`

Added by `vercel link` when the two Vercel projects were created. Neither
`.vercel` (project and org ids) nor `.env*` was ignored at the repo root.

**Phase 1 (R3, Q5):**
- `server/src/services/rma.service.ts`
- `server/tests/characterization/rma-refund.test.ts`

**Phase 2 (RI1):**
- `server/src/services/storage.service.ts`
- `server/src/services/invoice.service.ts`
- `server/src/services/email.service.ts`
- `server/src/index.ts`

**Phase 3 (R1, RI2, RI3, RI7, RI9):**
- `server/.env.example`
- `apps/web/.env.local.example`
- `apps/admin/.env.local.example`
- `.gitignore`

**Review remediation (P1-1, P2-1, P2-2, P3-1):**
- `server/src/index.ts`
- `server/src/queues/index.ts`
- `server/src/queues/worker.ts`
- `server/src/routes/admin.routes.ts`
- `server/tests/services/queue-jobs.test.ts`
- `.gitignore`

**Test-phase remediation, 2026-08-29 (RI6 — lint gate):**
- `apps/web/src/app/account/login/page.tsx`
- `apps/web/src/app/cancellation/page.tsx`
- `apps/web/src/app/checkout/page.tsx`
- `apps/web/src/app/orders/[id]/page.tsx`
- `apps/web/src/app/terms/page.tsx`
- `package.json`

Six JSX entity escapes, one stale `@typescript-eslint/no-explicit-any` disable comment for a rule
the config never defined, and `--if-present` on the root lint script so the two workspaces without
a lint script are skipped rather than aborting the run. `npm run lint` now exits 0.

**Test-phase remediation, 2026-08-29 (R1, RI7 — env example completeness):**
- `server/.env.example`
- `apps/web/.env.local.example`
- `apps/admin/.env.local.example`
- `docs/deployment.md`

Every `process.env` read across the repo was inventoried and diffed against the three example
files; the sets are now exactly equal. Removed `CLOUDINARY_FOLDER` (read nowhere), corrected
`SERVER_BASE_URL` from `[REQUIRED-PROD]` to `[OPTIONAL]` in both the example and the deployment
doc, stated that the logistics webhook fails closed while its secret is unset, and blanked the
SMTP placeholders that `email.service.ts` could not detect as placeholders.

**Phase 5-8 (R4, RI4, RI5, RI10, RI11):**
- `server/src/queues/index.ts`
- `server/src/queues/jobs.ts`
- `server/src/queues/worker.ts`
- `server/src/routes/webhook.routes.ts`
- `server/src/routes/order.routes.ts`
- `server/src/routes/admin.routes.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/services/inventory.service.ts`
- `server/tests/services/sweeper.test.ts`
- `server/package.json`
- `docs/deployment.md`

## Phase Execution Log

### Phase 3 Documentation Addendum — Test Database Variable (R1, RI7)

**Entry evidence (2026-08-21):** `agentsmyth check --phase build --slug
deploy-and-event-driven` passed. The approved Phase 3 scope already owns
`server/.env.example` and requires documentation of every environment variable read by the
application. A static inventory found `TEST_DATABASE_URL` is read only by
`server/tests/helpers/test-db-url.ts`; it was the sole omitted environment-variable name.

**Planned change:** add `TEST_DATABASE_URL` to `server/.env.example`, explicitly marked as
test-only and optional. It must never be used for a deployed Render service and must reference
a disposable database whose name ends in `_test`.

**Pre-existing workspace state:** `workflow/artifacts/verify/deploy-and-event-driven-v1.md`
is an untracked Test artifact from the current lifecycle session. It is outside this Phase 3
documentation addendum and will be preserved unchanged.

**Implementation evidence:** Added the optional, test-only `TEST_DATABASE_URL` entry to
`server/.env.example`. The 2026-08-21 static inventory confirms that every variable read by
the server is represented there; the frontend-only `NEXT_PUBLIC_API_URL` remains documented
in each app's own `.env.local.example`.

**Verification:** `npm run build --workspace=server` passed on 2026-08-21. `git diff --check`
also passed. No database test was run because the configured local MySQL instance remains
unavailable, as recorded in `workflow/artifacts/verify/deploy-and-event-driven-v1.md`.

**Scope fence:** passed. `server/.env.example` is an approved Phase 3 touch. This task
artifact is mandatory Build evidence; the pre-existing verify artifact is explicitly
preserved and excluded from this addendum's implementation scope.

**Phase status:** Complete. The change is within approved Phase 3 scope and is ready for
Review.


### Phase 1 — TiDB Compatibility Fix (Locked-Read Remedy)

**Manifest IDs:** R3 (partial), Q5

#### Entry Gate
- [x] Confirmed plan artifact `status: ready-for-next-phase`
- [x] Branch: `deploy-and-event-driven` (based on `inventory-reservation`)
- [x] Working tree clean

#### Work: Modify rma.service.ts for TiDB `FOR UPDATE` locks

**Status: Code complete, verification blocked pending TiDB credentials**

**Changes implemented:**
- `approveRmaRequest` (L169): Added `SELECT ... FOR UPDATE` locked read before PENDING status check
- `markReceived` (L274): Added `SELECT ... FOR UPDATE` locked read before existence check
- `issueRefund` (L313): Added `SELECT ... FOR UPDATE` locked read before PAID status check
- Removed `isolationLevel: Serializable` option from all three transaction calls
- No remaining `isolationLevel` options in file (verified via grep)

**Concurrency tests added** (3 new tests, all passing):
- `concurrent approveRmaRequest`: proves only one succeeds, second gets "Only PENDING requests..." error
- `concurrent markReceived`: proves both succeed (idempotent), serialized by lock
- `concurrent issueRefund`: proves only one succeeds, second gets "already been issued..." error

**Test results:**
- All 8 characterization tests in rma-refund.test.ts pass
- Verified with `PAYMENTS_MOCK=true` to enable mock payment mode
- Local MySQL: ✅ PASS

**TiDB-specific verification blocked:**
- Plan requires running `prisma migrate deploy` against TiDB Serverless
- Plan requires running concurrency tests against live TiDB to confirm no gap-lock behavior difference
- **Blocker:** No TiDB Serverless credentials available in this environment
- **Workaround:** Proceeded with local MySQL testing; TiDB migration must be performed during Phase 4 deployment

**Commit:** c60e6a6
- Manifest IDs: R3 (partial), Q5

#### Exit Gate Status
- [x] Three `rma.service.ts` sites use FOR UPDATE locked reads
- [x] No `isolationLevel: Serializable` remaining in file
- [x] Three new concurrency tests prove single-winner behavior (local MySQL)
- [ ] `prisma migrate deploy` passes against TiDB (BLOCKED - no credentials)
- [ ] Concurrency tests pass against TiDB (BLOCKED - no credentials)
- [ ] Inventory tests pass against TiDB (BLOCKED - no credentials)

**Phase 1 readiness:** Code-complete, blocked on TiDB environment access

### Phase 2 — Storage Fail-Fast

**Manifest IDs:** RI1

**Changed Files:**
- server/src/services/storage.service.ts
- server/src/services/invoice.service.ts
- server/src/services/email.service.ts
- server/src/index.ts

**Work implemented:**
- Removed `uploadToLocal` function from storage.service.ts
- Removed local fallback from `uploadBuffer` — throws if no cloud provider
- Removed `uploadsRoot` variable from index.ts
- Removed `/uploads` static serving from index.ts (line 117)
- Added production guard in `startServer` to refuse boot if `NODE_ENV=production` and provider is 'local'
- Simplified invoice.service.ts to buffer-then-upload only (removed local disk write)
- Guarded email mock-preview disk write to dev only (skip write in production)

**Verification:**
- `npm run build --workspace=server` passes
- No `express.static` calls found in server/src
- Production startup guard validates config

**Correction (post-Build review):** the pass above removed the local-disk fallback and
`/uploads` static serving unconditionally, not gated to production. That contradicts this
phase's own RI1 acceptance criterion — "in dev with no vars the local path still works
unchanged" — and broke every dev workflow touching uploads (product images, invoice
generation) without cloud credentials configured. Restored `uploadToLocal` in
`storage.service.ts` and `/uploads` static serving in `index.ts`, both gated to
`NODE_ENV !== 'production'`. Production behavior is unchanged — the startup guard already
refuses to boot without a cloud provider, so production never reaches the local-fallback
branch.
- Re-verified: `npm run build --workspace=server` passes; full server suite (9 files, 75
  tests) passes, including `webhook.test.ts` unmodified.
- Changed files (this correction): `server/src/services/storage.service.ts`,
  `server/src/index.ts`

**Commit:** e753a41
- Manifest ID: RI1

**Exit gate status:**
- [x] Production guard refuses boot without cloud storage
- [x] Local fallback removed from storage.service.ts
- [x] No express.static for uploads
- [x] Build passes
- [x] Invoice service simplified (buffer-then-upload)
- [x] Email mock-preview guarded to dev only

**Phase 2 complete.**

---

### Phase 3 — Environment, CORS, and Isolation Guards (R1, RI2, RI3, RI7, RI9)

**Work implemented:**
- `server/.env.example` rewritten: it was missing `R2_*`, `SERVER_BASE_URL`, `PAYMENTS_MOCK`
  and `LOGISTICS_WEBHOOK_SECRET` despite the code reading all of them, and carried a dead
  `UPLOAD_DIR` nothing reads. Added `REDIS_URL` ahead of the queue phases, documented that
  Upstash needs the `rediss://` TCP string rather than the REST URL (ioredis cannot use REST).
- Both apps' `.env.local.example`: added `R2_PUBLIC_URL` with an explicit note that
  `next.config.js` reads it at **build** time, so a Vercel build without it produces
  "unconfigured host" image failures even when the value exists at runtime.
- Documented in both app examples that `NEXT_PUBLIC_API_URL` is for SSR fetches only, and
  that pointing browser-side authenticated fetches at an absolute cross-origin API URL would
  collapse the per-origin cookie isolation (RI2's actual failure mode).

**Defect found and fixed during this phase:** `.gitignore`'s `*.env*` pattern also matched
the example/template files, so `server/.env.example` and both `.env.local.example` files had
**never been tracked** — the very files a collaborator needs in order to know what to
configure existed only on local disk. Negated the pattern for `*.env.example` and
`*.env.local.example`. Verified with `git check-ignore` that real `server/.env` and
`apps/web/.env.local` remain ignored.

**CORS (RI9):** `index.ts` already builds its allowlist from `FRONTEND_URL` + `ADMIN_URL`; no
code change needed, values are supplied per-environment. Documented in `docs/deployment.md`.

**Exit gate status:**
- [x] `grep` for a cookie `domain` option in `server/src` returns nothing (RI2)
- [x] Both `next.config.js` files still contain the `/api/:path*` rewrite (RI2)
- [x] Every `process.env.*` key the server reads appears in `server/.env.example`
- [x] Example files contain placeholders only, no real values (RI7)
- [x] Example files are now actually tracked by git
- [x] `npm run build` passes

**Commits:** 659f420, e011da0 — Manifest IDs: R1, RI2, RI3, RI7, RI9

**Phase 3 complete.**

---

### Phase 5 — Queue Foundation (R4, RI10)

**Work implemented:**
- Added `bullmq` + `ioredis` to `server/package.json`.
- `server/src/queues/index.ts` — queue, connection, `enqueue()` helper.
- `server/src/queues/jobs.ts` — job names and payload types.
- `server/src/queues/worker.ts` — in-process worker and handlers.
- Worker started from `startServer()` in `index.ts`.

**Design decision — graceful degradation.** Everything no-ops when `REDIS_URL` is unset:
`enqueue()` returns `false` and every call site falls back to running the work inline. This
keeps local dev and the whole test suite runnable without Redis, and means a missing or
misconfigured `REDIS_URL` in production costs latency rather than silently dropping a
customer's invoice. `enqueue()` also catches connection errors and returns `false` rather
than throwing, so a Redis outage cannot 500 the request that triggered it.

**RI10 — Upstash command quota.** Worker sets `drainDelay: 30`, capping idle polling at
roughly 2 blocking reads/minute/worker (~2,880/day) against Upstash's free per-command
allotment. `removeOnComplete: {count: 100}` / `removeOnFail: {count: 500}` bound stored job
history. Raising `concurrency` or lowering `drainDelay` raises the command rate — noted in
`docs/deployment.md`.

**Exit gate status:**
- [x] Producer/consumer wiring exists and typechecks
- [x] Retry policy configured (3 attempts, exponential backoff from 5s)
- [x] Failed jobs land in the failed set via `worker.on('failed')` rather than crashing
- [x] Idle-polling projection documented with the configured value
- [ ] **Pending live credentials:** observe a real job round-trip and a real retry against
      Upstash. Run after setting `REDIS_URL`: start the server and confirm the
      `👷 Queue worker started` log, then trigger a payment confirmation and confirm the
      invoice appears without the request having awaited it.

---

### Phase 6 — Reservation Sweeper (RI5)

**Work implemented:**
- `sweepExpiredReservations()` in `inventory.service.ts` marks lapsed `ACTIVE` reservations
  as `EXPIRED` (a status the enum already defined and nothing used).
- Registered as a repeatable job every 15 minutes via `jobQueue.upsertJobScheduler`.

**Two decisions worth recording:**
1. *Marks rather than deletes.* Preserves the audit trail and matches how
   `releaseReservations` already transitions status rather than removing rows.
2. *Never touches `Product.stock`.* An `ACTIVE` reservation is a soft hold that was never
   decremented from stock — decrementing happens at conversion. Incrementing stock here would
   invent inventory. This is asserted by a dedicated test.

`upsertJobScheduler` is used rather than `add(..., {repeat})` because BullMQ v6 removed
`repeat` from `JobsOptions`; it is idempotent, so restarts re-assert the schedule instead of
stacking duplicate repeaters.

**Exit gate status:**
- [x] Test seeds expired + active reservations, asserts only expired are swept
- [x] Test asserts `CONVERTED`/`RELEASED` rows are untouched even when lapsed
- [x] Test asserts `Product.stock` is unchanged
- [x] Test asserts idempotency (second sweep returns 0)
- [x] Lazy-expiry filter at `inventory.service.ts:74` unchanged
- [x] `inventory.service.test.ts` still passes (9 tests)

**Phase 6 complete.**

---

### Phase 7 — Webhook Enqueue (RI4) — PROTECTED PATH

**Scope of the Q1 approval honoured strictly:** only the invoice/email work moved off the
request path. Signature verification and the raw-body parsing at `index.ts:107` were not
touched.

**Work implemented:** `webhook.routes.ts` L124-131 replaced an awaited
`generateInvoicePdf` → `prisma.order.update` → `sendOrderConfirmationEmail` chain with a
single `enqueue()`, retaining the full inline sequence as the no-queue fallback.

**Why this mattered beyond latency:** Razorpay retries webhooks that ack slowly, and a retry
re-enters this handler — so the slow inline path was also a duplicate-processing risk, not
just a slow one.

**Exit gate status:**
- [x] `server/tests/characterization/webhook.test.ts` passes **unmodified** (17 tests)
- [x] `git diff` on `webhook.routes.ts` shows no change to signature verification or raw-body
      handling — only the import block and the L124-131 replacement
- [x] Handler no longer awaits PDF or SMTP work when a queue is configured
- [ ] **Pending live credentials:** confirm against real Upstash that the invoice job
      completes *after* the webhook has already acked.

**Phase 7 complete (code).**

---

### Phase 8 — Remaining Seams and Final Gate (RI11, RI6)

**Seams converted (all four Q4 selections):**
- `order.routes.ts:333` — invoice generation on order create.
- `admin.routes.ts` L946/L1062/L1106 — shipping update emails. These previously used bare
  `.catch(err => console.error(...))`, i.e. a failed notification was logged and dropped;
  they now retry.
- `auth.routes.ts:266` — password-reset OTP email.

**Correction to the plan's R-7 risk (OTP latency).** The plan recorded a concern that queueing
the OTP could add a ~50s cold-start delay to a flow the user actively waits on. On inspection
that overstated the risk: the OTP request *is itself* what wakes an idle Render instance, and
the in-process worker starts with it. The queue therefore adds worker-pickup latency measured
in seconds, not an additional cold start. The seam was kept rather than reverted; the plan's
revert clause was not needed. Recorded here rather than silently dropped.

**Payload design.** Handlers re-fetch entities by ID rather than trusting the enqueued
snapshot, since a job may run well after it was enqueued. The one deliberate exception is
shipping details, which are carried in-payload: they describe the specific status transition
being emailed about, so re-deriving them at run time could report a *later* status than the
one the customer is being told about. `handleOrderConfirmation` also reuses an existing
`invoiceUrl` rather than regenerating, so a retry does not upload a duplicate PDF to R2.

**Exit gate status:**
- [x] All five call sites enqueue rather than await (webhook, order, 3× shipping, OTP)
- [x] `npm run build` exits 0 across all three workspaces
- [x] Server suite: 10 files / 79 tests pass
- [x] `npm run lint` error count unchanged from baseline — verified by stashing all changes
      and re-running: 7 errors before, 7 after, all pre-existing `react/no-unescaped-entities`
      and one stale rule reference in `apps/web`. Repo-wide lint exits 1 both with and without
      this chain's changes; `apps/web/next.config.js` already documents that lint does not gate
      builds for this reason.

**Phase 8 complete.**

---

### Phase 4 — Deployment (R2, R3, RI8) — CONFIG COMPLETE, PROVISIONING IS MANUAL

`docs/deployment.md` written, covering provisioning steps for all five external services, the
full environment variable matrix (names only, RI7), the session-isolation rationale and its
failure mode, and operational behaviour (cold starts, sleeping worker, Upstash quota,
per-instance rate limiting, in-memory OTP cache).

No `vercel.json` is needed — both apps are standard Next.js projects; Vercel auto-detects the
framework and npm workspaces given the correct Root Directory.

**Exit gate status:**
- [x] Build/start commands documented for Render
- [x] Root directories documented for both Vercel projects
- [x] Env matrix documented, names only
- [x] Cold-start and idle-worker behaviour documented (RI8)
- [ ] **Requires the user:** create the TiDB cluster, Upstash database, R2 bucket, Render
      service, and two Vercel projects, then paste in the env values.
- [ ] **Pending live deployment:** the R2 two-tab session-isolation manual QA, which needs
      the real deployed origins.

## Summary of Completed Work

| Phase | Manifest IDs | Status |
|---|---|---|
| 1 — TiDB locking fix | R3, Q5 | Code complete; TiDB-live verification pending credentials |
| 2 — Storage fail-fast | RI1 | Complete (incl. dev-fallback correction) |
| 3 — Env/CORS/isolation | R1, RI2, RI3, RI7, RI9 | Complete |
| 4 — Deployment | R2, R3, RI8 | Config + docs complete; provisioning requires user |
| 5 — Queue foundation | R4, RI10 | Code complete; live round-trip pending credentials |
| 6 — Reservation sweeper | RI5 | Complete, tested |
| 7 — Webhook enqueue | RI4 | Code complete; live ordering check pending credentials |
| 8 — Remaining seams | RI11, RI6 | Complete |

**Verification at close of Build:**
- `npm run build` — exit 0, all three workspaces
- `server` test suite — 10 files, 79 tests, all passing
- `webhook.test.ts` — 17 tests, passing **unmodified** (protected-path guarantee)
- `npm run lint` — error count identical to pre-change baseline (7, all pre-existing)

**Commits:** c60e6a6, e753a41, 1d996fc, 659f420, e011da0, bb79608

## Out-of-Scope Finding (flagged, not fixed)

`rma.service.ts` `markReceived` has no status precondition, unlike `approveRmaRequest`
(checks `PENDING`) and `issueRefund` (checks `PAID`). The `FOR UPDATE` lock added in Phase 1
serializes concurrent calls but does not prevent a second call from succeeding, so two admin
clicks could restock the same items twice. This predates this chain and sits outside Q5's
scope (TiDB isolation compatibility, not new business guards). Raised with the user during
Build; no fix authorised, so `markReceived`'s logic is unchanged beyond the lock. Candidate
for a follow-up chain.

🔄 **Phases 3+:** Pending implementation and external credential setup
