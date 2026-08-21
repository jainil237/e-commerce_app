---
slug: deploy-and-event-driven
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-08-18
updated: 2026-08-18
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10]
upstream:
  - user-request
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
skill_trigger_log:
  - skill: repo-alignment-scan
    decision: ran
    reason: Request spans deployment topology, storage, auth cookies, and a new queue layer; mapped each to real repo surfaces (storage.service.ts, index.ts, webhook.routes.ts, inventory.service.ts, next.config.js) before framing.
  - skill: architecture-decision-advisor
    decision: ran
    reason: Introduces a new architectural pattern (queue + worker) and a new infra dependency; decision and rejected alternatives recorded in Architecture Notes.
  - skill: constraint-conflict-scan
    decision: ran
    reason: Intended change touches server/src/routes/webhook.routes.ts, a configured protected path, and payment logic covered by domain.yaml constraints. Conflict found and raised as blocking Q1.
---

# Production Deployment + Event-Driven API - Brief

## Source Links

- User request, this session (deployment target, session isolation, queue introduction).
- `workflow/config/repo-profile.yaml` — protected paths, generated outputs.
- `workflow/config/domain.yaml` — payment/checkout constraints.
- No external tracker item; `source-of-truth.yaml` names Notion but no page was supplied for this work.

## Problem

The platform has never been deployed. Three workspaces (`apps/web`, `apps/admin`, `server`) run only
against localhost, and no deployment configuration exists anywhere in the repo (no `vercel.json`, no
Render config, no hosted database). Beyond the missing config, three defects would surface the moment
it is deployed:

1. **Storage silently breaks.** `storage.service.ts` falls back to local disk when R2/Cloudinary env
   vars are absent or mistyped. On any ephemeral filesystem the upload *succeeds*, returns a URL, and
   that URL 404s after the next restart. A config typo becomes silent data loss.
2. **The payment webhook does slow work inline.** `webhook.routes.ts:124-131` awaits PDF generation,
   an R2 upload, and an SMTP send before acking Razorpay. Slow handlers get retried by the provider,
   risking duplicate processing on a payment path.
3. **Stock reservations never get swept.** `inventory.service.ts:74` implements expiry lazily at read
   time. Expired `StockReservation` rows are never deleted, so the table grows without bound.

Separately, the user wants the two frontends usable side by side in one browser — a customer session
in one tab and an admin session in another — without the sessions colliding.

## Goals

- Deploy all three workspaces to free-tier hosting with no recurring cost.
- Keep customer and admin sessions fully isolated in the same browser.
- Replace the local-disk storage fallback with a fail-fast cloud-only path in production.
- Introduce an event-driven queue layer in the API, both to fix the two latency/reliability defects
  above and to demonstrate the pattern as portfolio work.

## Non-Goals

- Paid tiers of any provider. Every choice must sit inside a free allotment.
- Migrating off MySQL. TiDB Serverless is wire-compatible; `schema.prisma` keeps `provider = "mysql"`.
- Converting every synchronous call to a queued job. Only the seams named in RI4/RI5 and Q4.
- Multi-region, autoscaling, or high-availability topology.
- Changing the auth token model (JWT in httpOnly cookies stays as-is).
- RabbitMQ, AMQP, and CloudAMQP — ruled out by the Q2 decision.
- Render Key Value as the queue backend — ruled out by the Q3 decision.
- Restructuring Razorpay signature verification or the raw-body parsing at `index.ts:107`. The Q1
  approval covers moving work off the request path only.

## User Impact

- **Customer:** order confirmation returns faster once invoice and email move off the request path.
  Payment confirmation becomes more reliable under provider retries. First request after an idle
  period is slow (see RI8).
- **Admin:** can hold an admin session in one tab and a customer session in another without either
  logging the other out.
- **Operator/author:** one deploy per push, no recurring bill, and a queue layer that is visible and
  explainable as portfolio work.

## Success Metrics

- All three services reachable at their production URLs and serving real data from TiDB.
- Logging into web and admin in the same browser yields two independent, concurrently valid sessions.
- Razorpay webhook handler acks in well under its retry threshold, with invoice + email done off-path.
- No expired `StockReservation` rows older than one sweep interval remain in the table.
- A production API boot with storage misconfigured fails at startup rather than serving broken URLs.
- `npm run build` and `npm run lint` pass at repo root.

## Requirements

Captured as R/RI IDs in the Requirement Manifest below.

## Constraints

- **C1 — Protected path.** `server/src/routes/webhook.routes.ts` is configured as
  "must never be modified without explicit approval". Also covered by `domain.yaml`: no payment or
  checkout changes without approval. Blocks the highest-value queue seam. See Q1.
- **C2 — Protected path.** `server/prisma/schema.prisma` requires migration handling; TiDB migration
  touches it only via connection string, not schema content.
- **C3 — Render free tier has no background worker service type.** Workers are paid. The queue
  consumer must run in-process with the Express web service.
- **C4 — Render free web services spin down after ~15 min idle** and cold-start in roughly 50s.
  An in-process worker stops consuming while spun down.
- **C5 — Ephemeral filesystem** on Render free (persistent disks are paid). No local storage may be
  relied on for durable data.
- **C6 — Build-time env.** `apps/web/next.config.js` and `apps/admin/next.config.js` derive image
  `remotePatterns` from `R2_PUBLIC_URL` at build time, not runtime.
- **C7 — No secrets in artifacts.** No connection strings, keys, or `.env` contents in any lifecycle
  document.
- **C8 — Branch policy.** Non-default branch required; current branch is `inventory-reservation`.

## Risks

- **Job durability.** A free Redis tier without persistence loses queued jobs on restart. On an order
  confirmation path that means a customer silently never receives an invoice. Drives Q3.
- **Webhook regression.** The handler verifies Razorpay's HMAC against exact raw bytes
  (`index.ts:107`). Any restructuring risks breaking signature verification on a payment path.
- **Free-tier queue quotas.** *Now a live risk, not a hypothetical — Q3 selected Upstash.* BullMQ
  polls Redis continuously; Upstash bills per command, so idle polling alone can exhaust the daily
  free allotment. Mitigation is RI10. If the quota is hit, jobs delay rather than disappear, which is
  the failure mode this choice was made to prefer.

- **OTP email latency (new, from Q4).** `auth.routes.ts:266` sends a password-reset OTP while the
  user is actively waiting on it. Queueing adds worker pickup latency to a synchronous-feeling flow,
  and on Render free the worker may be spun down (C4), so a cold start could delay the OTP by ~50s.
  This is the one Q4 seam where queueing may be worse than the status quo. RI11 requires measuring it
  and reverting that seam if latency is unacceptable.
- **Spin-down surprises.** Delayed jobs (reservation sweep) will not fire while the service is idle,
  so sweeps are bursty rather than punctual. Correctness holds because expiry is already evaluated
  lazily at read time; only cleanup is delayed.
- **Connection ceiling.** TiDB is built for many short-lived connections, so this is low, but Prisma
  pool sizing should still be set explicitly.
- **Scope coupling.** Deployment and the queue layer are separable; bundling them means a webhook
  regression could block the whole deployment.

## Open Questions

All of Q1–Q4 were resolved by the user on 2026-08-18; see the Requirement Manifest for each decision.
No blockers remain. The only outstanding gate is brief approval itself (`user_checkpoint:
brief-review`).

## Requirement Manifest

### Explicit (R)

- **R1 — Environment-correct config for web and admin.**
  Both Next apps must run correctly in local dev and in production, reading environment-specific
  values rather than hardcoded localhost defaults.
  *Acceptance:* each app boots in dev with no env file and in production with its documented env set;
  no `localhost` default is reachable in a production build; `.env.local.example` in both apps lists
  every variable the app actually reads.

- **R2 — Isolated sessions across sibling subdomains.**
  Web and admin deploy to sibling hosts and a single browser must hold both sessions at once.
  *Acceptance:* logging into web then admin in the same browser leaves both sessions valid; a
  documented manual check confirms `accessToken` / `refreshToken` cookies are host-only (no `Domain`
  attribute) on each origin, and that localStorage keys of one app are not visible to the other.

- **R3 — Deploy API to Render free tier and database to TiDB Serverless.**
  *Acceptance:* API reachable at its Render URL with `/health` returning success; Prisma connects to
  TiDB over TLS; `prisma migrate deploy` applies cleanly against TiDB; `schema.prisma` still declares
  `provider = "mysql"`; documented build and start commands work from the monorepo root.

- **R4 — Event-driven queue layer in the API.**
  Introduce a queue with at least one producer and one consumer, demonstrating async job handling
  with retries.
  *Acceptance:* a job enqueued by an HTTP handler is processed by the worker outside the request
  lifecycle; a deliberately failing job retries per configured backoff and lands in a failed state
  rather than crashing the process; queue wiring is documented well enough to explain in a walkthrough.

### Implicit (RI)

- **RI1 — Fail fast instead of falling back to local disk in production.**
  *Acceptance:* with `NODE_ENV=production` and no cloud storage provider configured, the API refuses
  to start with a clear error; in dev the local path still works unchanged; `uploadToLocal` is
  unreachable in production; `app.use('/uploads', ...)` static serving is removed.

- **RI2 — Preserve host-only cookie scoping.**
  Both apps proxy `/api/*` through Next rewrites, which is what keeps cookies on each app's own origin.
  *Acceptance:* no `res.cookie` call gains a `domain` option; both `next.config.js` rewrites remain in
  place; no browser-side authenticated `fetch` targets an absolute cross-origin API URL.

- **RI3 — `R2_PUBLIC_URL` present at build time for both Next apps.**
  *Acceptance:* both Vercel projects define it as a build-time variable; a production build resolves
  product images through `/_next/image` without an "unconfigured host" error.

- **RI4 — Razorpay webhook acks fast and keeps HMAC verification byte-exact.**
  *Acceptance:* handler enqueues rather than awaiting invoice/email work; existing webhook tests in
  `server/tests/characterization/webhook.test.ts` still pass; raw-body parsing at `index.ts:107` is
  unchanged. **Gated on Q1.**

- **RI5 — Expired stock reservations are swept.**
  *Acceptance:* a recurring or delayed job deletes or releases `StockReservation` rows past
  `expiresAt`; existing lazy-expiry read logic is left intact as the correctness guarantee; a test
  proves expired rows are removed and active ones are not.

- **RI6 — Configured verification commands pass.**
  *Acceptance:* `npm run build` and `npm run lint` succeed at repo root before Ship.

- **RI7 — No secrets in artifacts.**
  *Acceptance:* no artifact in this chain contains a connection string, key, token, or `.env` content;
  env vars are referenced by name only.

- **RI8 — Idle spin-down behaviour is documented and acceptable.**
  Free-tier constraint C3/C4 means the in-process worker halts while the service sleeps.
  *Acceptance:* deployment docs state the cold-start and delayed-job implications; no feature depends
  on a job firing punctually while the service is idle.

- **RI9 — Production CORS and cross-service URLs configured.**
  *Acceptance:* `FRONTEND_URL` and `ADMIN_URL` are set to the real Vercel origins on Render so the
  `cors()` allowlist at `index.ts:70` admits both; `SERVER_BASE_URL` points at the Render URL.

- **RI10 — BullMQ polling tuned to survive Upstash's per-command free quota.**
  Consequence of the Q3 decision. BullMQ's default blocking-poll loop issues commands continuously
  even when the queue is empty, which can exhaust a daily free allotment on idle alone.
  *Acceptance:* worker polling interval / `drainDelay` is explicitly configured rather than left at
  default; a documented estimate shows projected idle command volume sitting inside the free quota;
  deployment docs record what happens if the quota is hit (jobs delay, not silently vanish).

- **RI11 — Remaining synchronous email/invoice seams moved to the queue.**
  Covers the Q4 selections: `order.routes.ts:333`, `admin.routes.ts:946/1062/1106`,
  `auth.routes.ts:266`.
  *Acceptance:* each call site enqueues instead of awaiting; each has a job handler with retry
  configuration; failures surface in the failed-job state rather than throwing inside a request;
  OTP delivery latency is measured and confirmed acceptable, or that seam is reverted to synchronous
  (see Risks).

### Assumptions (A)

- **A1** — This is a non-commercial passion project, so Vercel Hobby terms are satisfied. *(User
  stated "this is a passion project".)*
- **A2** — Traffic stays inside free allotments for Vercel, Render, TiDB, and the chosen queue backend.
- **A3** — TiDB Serverless is MySQL wire-compatible for every query this app issues, so no Prisma
  provider change is needed. Plan must verify against raw SQL, if any exists.
- **A4** — The two frontends stay on `*.vercel.app` subdomains for now. Because `vercel.app` is on the
  Public Suffix List, cookie isolation is enforced by the browser. On a future custom parent domain
  isolation depends entirely on RI2 holding.

### Open Questions (Q)

- **Q1 — May `server/src/routes/webhook.routes.ts` be modified to enqueue instead of awaiting invoice
  and email work?** It is a configured protected path and payment logic under `domain.yaml`.
  *Owner:* user. *Blocking:* yes.
  **RESOLVED 2026-08-18 — approved.** User selected "Approve — modify it" in response to this brief.
  RI4 is in scope. This constitutes the explicit approval that `repo-profile.yaml` and `domain.yaml`
  require for this path; Review must confirm HMAC byte-exactness survived.

- **Q2 — BullMQ or RabbitMQ?**
  *Owner:* user. *Blocking:* yes.
  **RESOLVED 2026-08-18 — BullMQ.** RabbitMQ and CloudAMQP are now out of scope entirely.

- **Q3 — Which Redis/broker provider, given the durability trade-off?**
  A no-persistence free tier can lose queued jobs on restart; a per-command-billed tier can be
  exhausted by BullMQ's idle polling.
  *Owner:* user. *Blocking:* yes.
  **RESOLVED 2026-08-18 — Upstash Redis.** Durability chosen over quota headroom: silently losing a
  customer's invoice job is worse than being throttled. Consequence is that BullMQ's idle polling
  must be actively tuned, not accepted as default — raised as RI10.

- **Q4 — Which seams move to the queue beyond RI4 and RI5?**
  *Owner:* user. *Blocking:* no.
  **RESOLVED 2026-08-18 — all three candidates selected:** `order.routes.ts:333` (invoice on order
  create), `admin.routes.ts:946/1062/1106` (shipping update emails), `auth.routes.ts:266` (OTP email).
  Tracked as RI11. Note the OTP caveat recorded under Risks.

## Questions For User

1. **Q1 — Webhook approval.** The single highest-value queue seam is the Razorpay handler, and it is
   also the riskiest file in the repo. Approve modifying it, or keep it untouched and accept a
   narrower demonstration?

2. **Q2 — Queue technology.** Recommendation is **BullMQ**: it is Node-native, needs only Redis,
   ships delayed jobs natively (which RI5 requires), and has retries and backoff built in. RabbitMQ
   showcases broader AMQP concepts — exchanges, routing keys, dead-letter queues — but needs a second
   vendor, and delayed messages depend on a plugin that free tiers generally do not offer. If the
   portfolio goal specifically calls for AMQP vocabulary, that argues for RabbitMQ despite the cost.

3. **Q3 — Queue backend provider.** Trade-off, assuming BullMQ:
   - *Render Key Value* — same datacenter as the API, no per-command billing, but the free tier has
     no persistence, so a restart can drop queued jobs.
   - *Upstash* — persistent, but per-command billing that BullMQ's polling consumes quickly.
   Free-tier terms shift; both should be confirmed before Plan commits.

4. **Q4 — Additional seams.** Answer now or accept the stated default.

## Architecture Notes

- **role:** Architect

- **decision — deployment topology.** Vercel (Hobby) for `apps/web` and `apps/admin` as two projects;
  Render free web service for `server`; TiDB Serverless for MySQL. Chosen by the user this session
  after comparing against an all-Vercel serverless option.

- **decision — session isolation relies on existing structure, not new code.** Both apps already fetch
  relative `/api/v1/*` through their own Next rewrite proxy, so `Set-Cookie` lands host-only on each
  app's origin. R2 is therefore mostly a matter of *not breaking* what exists. The failure mode to
  guard is any future change pointing an authenticated browser fetch at an absolute shared API origin,
  which would place one cookie jar under both apps and collapse the isolation. Captured as RI2.

- **decision — in-process worker.** Render free has no worker service type (C3), so the BullMQ
  consumer runs inside the Express process. Rejected alternatives: a separate Render worker (paid);
  an external cron pinging an HTTP endpoint (adds a vendor and re-implements retries badly).

- **decision — BullMQ over RabbitMQ (confirmed by user, Q2).** Delayed jobs are a first-class BullMQ
  feature and RI5's sweeper needs exactly that; on RabbitMQ free tiers delayed delivery needs a plugin
  that is usually unavailable. BullMQ also adds one dependency against RabbitMQ's separate vendor.
  Rejected: RabbitMQ/CloudAMQP — demonstrates broader AMQP vocabulary (exchanges, routing keys, DLQ)
  but costs a second vendor and complicates the sweeper.

- **decision — Upstash Redis over Render Key Value (confirmed by user, Q3).** Chosen for persistence.
  The queue carries order-confirmation invoices and emails, so a restart dropping jobs would mean a
  customer silently never receiving their invoice — a worse failure than throttling. Rejected: Render
  Key Value, which is co-located and unmetered but has no free-tier persistence. The accepted cost is
  per-command billing, which makes RI10 (polling tuning) mandatory rather than optional.

- **decision — webhook modification approved (user, Q1).** This is the explicit approval that
  `repo-profile.yaml` ("must never be modified without explicit approval") and `domain.yaml` ("no
  payment or checkout changes without explicit user approval") require. Scope of the approval is
  narrow: move invoice/email work off the request path. It is not approval to restructure signature
  verification or the raw-body parsing at `index.ts:107`.

- **constraint:** C1 (protected webhook path) gates the most valuable seam. C3/C4 (no free worker,
  idle spin-down) shape the worker topology. C5 (ephemeral disk) forces RI1.

- **tradeoff — deployment and queue work bundled in one chain.** They are separable, and bundling
  means a webhook regression could hold up the deployment. Kept together because both are driven by
  the same free-tier constraints and touch overlapping files. Plan should sequence deployment first
  so it can ship independently if the queue work stalls.

- **tradeoff — job durability vs quota.** Q3 has no free option that is both persistent and
  unmetered. Whichever way it goes, the residual risk belongs in the deployment docs.

- **assumption Plan must verify:** A3 — scan for raw SQL or MySQL-specific behaviour before assuming
  TiDB compatibility.

- **downstream:**
  - *Plan* — sequence deployment before queue work so it can ship independently; size the TiDB
    migration; decide whether the worker starts under a flag; verify Upstash's *current* free-tier
    command limits and BullMQ's polling defaults against RI10 before committing job design; order
    the five queue seams (RI4, RI5, RI11 × 3) by value so the OTP seam can be dropped without
    unpicking the rest.
  - *Build* — branch off `inventory-reservation` or `main` per C8; storage change is net-negative
    lines and lands first.
  - *Review* — scrutinise webhook raw-body handling and cookie options for a stray `domain`.
  - *Test* — `server/tests/characterization/webhook.test.ts` must stay green; add coverage for the
    sweeper and for storage fail-fast. R2 needs a documented manual two-tab check.
  - *Ship* — deployment is the ship artifact here; record real URLs and the env matrix, no values.

## Checkpoint Approval

- Checkpoint: brief-review
- Status: approved
- Date: 2026-08-18
- User's own words (verbatim, this turn): "approved, proceed to plan"

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs appear in orchestration.blockers.
- [x] User approved or waiver recorded.
