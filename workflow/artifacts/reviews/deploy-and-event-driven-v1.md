---
slug: deploy-and-event-driven
version: 1
artifact: review
status: ready-for-next-phase
created: 2026-08-18
updated: 2026-08-21
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10, RI11]
upstream:
  - workflow/artifacts/briefs/deploy-and-event-driven-v1.md
  - workflow/artifacts/plans/deploy-and-event-driven-v1.md
  - workflow/artifacts/tasks/deploy-and-event-driven-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Production Deployment + Event-Driven API - Review

Review target: `git diff inventory-reservation..HEAD` — 27 files, +2420/−99, commits
c60e6a6, e753a41, 1d996fc, 659f420, e011da0, bb79608, 55703a2.

## Phase 3 Documentation Addendum Review (2026-08-21)

**Findings:** none.

Reviewed `server/.env.example` against the static environment-variable inventory and
`server/tests/helpers/test-db-url.ts`. `TEST_DATABASE_URL` was the only omitted key; it is
now present with an empty placeholder and accurately marked optional and test-only. Its
documentation requires a disposable `_test` database and explicitly prohibits production or
Render use, so it cannot be mistaken for a deployment setting.

**Evidence reviewed:**

- `npm run build --workspace=server` — passed on 2026-08-21.
- `git diff --check` — passed on 2026-08-21.
- `server/tests/helpers/test-db-url.ts` — confirms the variable is optional and overrides the
  test harness database only.

**Coverage delta:** R1 and RI7 gain complete example coverage for the test harness. No other
manifest row changes. The live deployment risks already recorded below and in
`workflow/artifacts/verify/deploy-and-event-driven-v1.md` remain unresolved.

**Recommendation:** pass-with-risk. The documentation addendum is correct; Test remains
blocked by unprovisioned hosting infrastructure and the pre-existing root lint failure.

## Remediation Status

User approved fixing P1-1, P2-1, P2-2, and P3-1 on 2026-08-18. All four are resolved in commit
`a835301`. P3-2 was not selected and remains open.

| Finding | Severity | Status |
|---|---|---|
| P1-1 Redis outage prevents boot | P1 | **fixed** — `a835301` |
| P2-1 Admin responses block on Redis | P2 | **fixed** — `a835301` |
| P2-2 Duplicate confirmation email on retry | P2 | **fixed** — `a835301`, regression test added |
| P3-1 Agent memory files committed | P3 | **fixed** — `a835301` |
| P3-2 Docs placeholder convention | P3 | open — not selected |

Post-remediation verification: `npm run build --workspace=server` clean; **11 files / 83 tests
pass** (was 10/79). The new `server/tests/services/queue-jobs.test.ts` was confirmed to have
teeth by temporarily disabling the P2-2 guard — 2 of its 4 tests failed, then passed on restore.

Findings below are preserved as originally written, each annotated with its resolution.

## Findings

### P1-1 — A Redis outage prevents the server from booting at all

- **Severity:** P1
- **Path:** `server/src/index.ts:172-184`
- **Manifest IDs:** R4, RI10
- **Problem:** `await jobQueue.upsertJobScheduler(...)` sits inside `startServer()`'s `try`
  block, whose `catch` calls `process.exit(1)`. If Upstash is unreachable, rate-limited, or
  the credentials are wrong, this rejects and the process exits — the API never starts.

  This defeats the central design decision of the whole queue layer. `enqueue()` was
  deliberately built to return `false` and let every call site fall back to inline execution
  precisely so a Redis problem would cost latency rather than availability. That guarantee
  holds at request time and is then thrown away at startup.

  Two aggravating details:
  1. `app.listen(...)` is *after* the awaited scheduler registration, so even a merely slow
     Redis delays port binding. On Render that reads as a failed health check, so a
     degraded queue backend can look like a dead service.
  2. The `catch` logs `❌ Failed to connect to database:` — a Redis failure would be
     reported as a database failure, misdirecting whoever debugs it at 3am.
- **Fix:** move `startWorker()` and the scheduler registration *after* `app.listen(...)`, and
  wrap them in their own `try/catch` that logs and continues. The server should serve traffic
  with an inline-fallback queue rather than not serve at all. Worth asserting in a test:
  boot with `REDIS_URL` pointed at a dead port and confirm the process stays up.
- **RESOLVED** (`a835301`): extracted `startQueue()`, invoked as `void startQueue()` after
  `app.listen(...)`, with its own catch that logs `⚠️ Queue unavailable — jobs will run
  inline. The API is still serving traffic`. The misleading `Failed to connect to database`
  catch message was corrected to `Failed to start server`. The suggested dead-port boot test
  was **not** added: `REDIS_URL` is read at module load in `queues/index.ts`, so asserting it
  requires module-registry mocking that would test the mock more than the behaviour. The
  structural guarantee is now that no queue call is awaited before `listen`, which is
  verifiable by reading the file. Recorded as a deliberate gap rather than an oversight.

### P2-1 — Admin shipping responses now block on a Redis round-trip

- **Severity:** P2
- **Path:** `server/src/routes/admin.routes.ts:947`, `:1080`, `:1124`
- **Manifest IDs:** RI11
- **Problem:** all three shipping-email sites were previously fire-and-forget
  (`sendShippingUpdateEmail(...).catch(...)`), so the admin response never waited on them.
  They now `await enqueue(...)`. In the healthy case that is a fast local round-trip, but
  when Redis is slow or unreachable the admin request blocks until ioredis gives up before
  the inline fallback even begins — a latency regression on a path that used to have none.
- **Fix:** either don't await the enqueue on these three sites (fire-and-forget the enqueue
  itself, accepting that a lost enqueue falls back to nothing), or bound it with an explicit
  short timeout. Note this trades against the retry guarantee the change was made to gain, so
  it is a real decision rather than an obvious cleanup — flagging rather than prescribing.
- **RESOLVED** (`a835301`): added `enqueueOrRun()` to `queues/index.ts` — enqueues, or runs the
  fallback inline if there is no queue, without making the caller await either, and never
  throwing. This avoids the trade the finding described: the retry guarantee is kept when Redis
  is healthy, and the response path is non-blocking either way. Incidental TypeScript fix: the
  enclosing `order.user` narrowing does not survive into the deferred closure, so all three
  sites now bind `const recipient = order.user` first.

### P2-2 — Order-confirmation job can re-send a duplicate email on retry

- **Severity:** P2
- **Path:** `server/src/queues/worker.ts:36-48`
- **Manifest IDs:** RI4, RI11
- **Problem:** `handleOrderConfirmation` guards invoice *generation* against retries by
  reusing an existing `invoiceUrl`, but nothing guards the email send. If the job is retried
  after `sendOrderConfirmationEmail` already succeeded — a worker crash between send and job
  completion, or Render reclaiming the instance mid-job — the customer receives a second
  confirmation email with the same invoice.
- **Fix:** persist a marker after a successful send (e.g. an `OrderAuditLog` entry, which the
  repo already treats as the append-only record for order events) and skip the send when it
  is present. Low likelihood, cosmetic impact, but it is the kind of thing that erodes trust
  in transactional email.
- **RESOLVED** (`a835301`): guarded with an `ORDER_CONFIRMATION_EMAIL_SENT` entry in
  `OrderAuditLog`, checked before the send and written after. Covered by four new tests in
  `server/tests/services/queue-jobs.test.ts` (first-run send, no re-send on retry, exactly one
  audit entry, markers not shared across orders). The tests were verified to actually catch the
  defect: with the guard temporarily disabled, 2 of the 4 fail.

### P3-1 — Subagent private memory files committed to the repository

- **Severity:** P3
- **Path:** `.claude/agent-memory/workflow-implementation-executor/MEMORY.md`,
  `.claude/agent-memory/workflow-implementation-executor/ecommerce-db-patterns.md`
- **Manifest IDs:** — (out of manifest)
- **Problem:** these are the Build subagent's own scratch memory, swept into commit 1d996fc by
  a `git add -A`. They are not project documentation, were never part of any phase's Changed
  Files, and duplicate content that properly belongs in the task artifact and
  `docs/deployment.md`. Their content is benign — no secrets — but they are noise in the
  history and will confuse a reader looking for authoritative docs.
- **Fix:** `git rm -r --cached .claude/agent-memory/` and add it to `.gitignore`.
- **RESOLVED** (`a835301`): untracked (4 files, including two from an earlier chain that had
  also been swept in) and added `.claude/agent-memory/` to `.gitignore`. Verified afterwards
  that the three `.env.example` files remain tracked — the negation rules added in Phase 3 are
  in the same file and were easy to disturb.

### P3-2 — `docs/deployment.md` verification block references an unset variable

- **Severity:** P3
- **Path:** `docs/deployment.md` (Verification after deploying)
- **Manifest IDs:** RI8
- **Problem:** the `prisma migrate status` snippet passes `DATABASE_URL` inline while the
  `curl` snippet uses a `<render-service>` placeholder. The mixed convention is easy to
  paste wrong. Minor docs hygiene, not correctness.
- **Fix:** use one placeholder convention throughout the block.

## Severity Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 1 (fixed) |
| P2 | 2 (fixed) |
| P3 | 2 (1 fixed, 1 open) |

## Requirement Coverage

| Manifest ID | Status | Evidence |
|---|---|---|
| R1 | covered | `server/.env.example`, both `.env.local.example` rewritten; `npm run build` exit 0 |
| R2 | partial | Code guarantees verified (host-only cookies, rewrites intact); two-tab manual QA needs live origins — Test phase |
| R3 | partial | Locking fix complete + tested on MySQL; `prisma migrate deploy` against TiDB not yet run |
| R4 | partial | Queue wiring, retry, backoff in place and typechecked; live round-trip not yet observed |
| RI1 | covered | Startup guard verified; dev fallback restored and re-verified after the Build regression |
| RI2 | covered | `grep` finds no cookie `domain` option; both `next.config.js` rewrites present |
| RI3 | covered | `R2_PUBLIC_URL` documented as build-time in both app examples and `docs/deployment.md` |
| RI4 | covered | `webhook.test.ts` 17 tests pass unmodified; diff confirms signature/raw-body untouched |
| RI5 | covered | `sweeper.test.ts` — 4 tests: expire, skip CONVERTED/RELEASED, no stock change, idempotency |
| RI6 | covered | `npm run build` exit 0; lint error count identical to stashed baseline (7/7) |
| RI7 | covered | Examples contain placeholders only; artifacts carry env names, no values |
| RI8 | covered | `docs/deployment.md` documents cold start, sleeping worker, quota, in-memory OTP |
| RI9 | covered | CORS allowlist reads `FRONTEND_URL`/`ADMIN_URL`; documented per-environment |
| RI10 | covered | `drainDelay: 30` set; ~2,880 idle commands/day projection recorded |
| RI11 | covered | All 5 seams converted; payload/refetch design sound |

Partial rows for R2, R3, R4 are not defects — each is blocked on user-supplied credentials
and is carried into Test rather than recorded as a finding.

## Architecture Notes

- **role:** Staff Reviewer
- **Q1 scope discipline held.** The `webhook.routes.ts` diff is +23/−9 and touches only the
  import block and the L124-131 invoice/email sequence. Signature verification and the
  raw-body parsing at `index.ts:107` are untouched, and the 17-test characterization suite
  passes unmodified. This was the highest-risk item in the plan and it was executed within
  its approved bounds.
- **Q5 remedy correctly applied.** All three `rma.service.ts` sites take a `FOR UPDATE` lock
  on the `RMARequest` row before their status check, and no `isolationLevel` option remains
  in the file. `tidb_skip_isolation_level_check` appears nowhere in the repo.
- **The graceful-degradation design is sound but incompletely applied.** `enqueue()`
  returning `false` rather than throwing is the right shape, and every call site honours it.
  P1-1 is the one place the principle was not carried through.
- **Sweeper decisions are correct.** Marking rather than deleting preserves the audit trail;
  not touching `Product.stock` is right, because an `ACTIVE` reservation was never decremented
  — and there is a dedicated test asserting exactly that, which is the sort of invariant that
  silently rots without one.
- **Build self-corrected honestly.** The task artifact records the Phase 2 dev-fallback
  regression and the OTP risk re-assessment rather than quietly fixing or omitting them.
  Reviewed both; the OTP reasoning (the request itself wakes the instance, so worker cold
  start is not additive) is correct.

## Verification Reviewed

| Evidence | Command / method | Outcome |
|---|---|---|
| Root build | `npm run build` | exit 0, all three workspaces — re-run during review |
| Server suite | `npm test --workspace=server` | 10 files, 79 tests pass |
| Protected path | `server/tests/characterization/webhook.test.ts` | 17 tests pass, file unmodified |
| Sweeper | `server/tests/services/sweeper.test.ts` | 4 tests pass |
| RMA concurrency | `server/tests/characterization/rma-refund.test.ts` | 8 tests pass (3 new) |
| Lint baseline | stash all changes → `npm run lint` → pop | 7 errors before, 7 after — no new violations |
| Isolation guard | `grep` for cookie `domain` in `server/src` | no matches |
| Secret scan | grep examples for non-placeholder values | clean |
| Ignore rules | `git check-ignore server/.env apps/web/.env.local` | both still ignored |

Not run, and correctly not claimed: `prisma migrate deploy` against TiDB, any live Upstash
round-trip, and the two-tab session-isolation QA. All three need user-supplied credentials.

## Residual Risk

- ~~**P1-1 is a production availability risk.**~~ **Resolved in `a835301`** — Redis is now a
  degraded-mode dependency, not a boot dependency. Residual: the fix is structurally verifiable
  by reading `index.ts` but has no automated test (see P1-1 resolution note), so a future
  refactor could re-introduce an awaited queue call before `listen` without anything failing.
- **TiDB behaviour remains unverified.** The locking remedy is correct in principle and
  proven on MySQL, but TiDB's pessimistic locking is not byte-identical to InnoDB. The
  concurrency tests must be re-run against TiDB before this is trusted. This is the single
  largest unverified assumption in the chain.
- **Upstash quota projection is arithmetic, not measurement.** ~2,880 idle commands/day
  follows from `drainDelay: 30`, but real consumption includes job traffic and scheduler
  polling. Watch the Upstash dashboard for the first days.
- **`markReceived` idempotency gap persists** (flagged in Build, unfixed by decision). Two
  admin clicks can restock the same items twice. Pre-existing, out of this chain's scope,
  but now sitting next to code that made its siblings safe — which makes it more likely to
  be mistaken for reviewed-and-fine.
- **Render free-tier behaviour is documented but unexercised.** Cold starts, worker sleep,
  and their interaction with queued jobs have not been observed on real infrastructure.

## Recommendation

**pass-with-risk** — original recommendation, retained.

The chain met its requirements, held the protected-path boundary, and produced honest
evidence including self-reported regressions. P1-1 should be fixed before deploying — it is a
small, well-understood change (move two calls after `app.listen` and wrap them) that restores
a guarantee the design already intended. P2-1 and P2-2 are reasonable follow-ups. P3s are
housekeeping.

Nothing here blocks proceeding to Test, since Test's remaining work is exactly the live
credential-dependent verification that P1-1's fix should be validated alongside.

### Post-remediation (2026-08-18)

P1-1, P2-1, P2-2, and P3-1 are fixed in `a835301`. The recommendation stays **pass-with-risk**
rather than moving to **pass**, because the risks that produced that qualifier were never the
findings themselves — they are the three requirement rows still `partial` (R2, R3, R4), all
blocked on live credentials, and the TiDB locking behaviour that remains unverified against
real TiDB. Those carry into Test unchanged.
