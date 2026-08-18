---
slug: deploy-and-event-driven
version: 1
artifact: task
status: in-progress
created: 2026-08-18
updated: 2026-08-18
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10, RI11]
upstream:
  - workflow/artifacts/plans/deploy-and-event-driven-v1.md
orchestration:
  phase: build
  status: in-progress
  blockers: []
changed_files:
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

**Phase 1 (R3, Q5):**
- `server/src/services/rma.service.ts`
- `server/tests/characterization/rma-refund.test.ts`

**Phase 2 (RI1):**
- `server/src/services/storage.service.ts`
- `server/src/services/invoice.service.ts`
- `server/src/services/email.service.ts`
- `server/src/index.ts`

## Phase Execution Log

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

## Remaining Phases

Due to token constraints and external dependency requirements, the following phases remain:

### Phase 3 — Environment, CORS, and Isolation Guards (RI2, RI3, RI7, RI9)
**Status:** Not started
**Scope:** Configure environment variables, CORS origins, R2_PUBLIC_URL build-time setup
**Files:** apps/web/next.config.js, apps/admin/next.config.js, both .env.local.example files, server/src/index.ts
**Blocker:** None — ready to start

### Phase 4 — Deploy Web, Admin, and API (R2, R3, RI8)
**Status:** Blocked pending manual setup
**Scope:** Vercel projects setup, Render service configuration, TiDB Serverless provisioning
**Manual steps required:** 
- Create two Vercel projects for apps/web and apps/admin
- Create Render service for server
- Provision TiDB Serverless database
- Configure environment variables in each platform
- Document deployment (RI8)
**Note:** Phase 1 TiDB verification must complete against live TiDB

### Phases 5–8 — Queue Layer (R4, RI4, RI5, RI6, RI10, RI11)
**Status:** Blocked pending Phase 4 and Upstash Redis credentials
**Scope:** BullMQ integration, Upstash Redis setup, queue job definitions, email/invoice enqueue
**External dependencies:** Upstash Redis account

## Summary of Completed Work

✅ **Phase 1 (Code):** TiDB compatibility fix — FOR UPDATE locks on RMA transactions
- All 8 characterization tests pass (including 3 new concurrency tests)
- Commit: c60e6a6

✅ **Phase 2 (Code):** Storage fail-fast — remove local fallback, production guard
- npm run build passes
- Commit: e753a41

🔄 **Phases 3+:** Pending implementation and external credential setup

