---
slug: redis-shared-state
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  source_document: docs/deployment.md
  related_chain: workflow/artifacts/verify/deploy-and-event-driven-v1.md
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
  task_class: complex
---

# Brief — Move per-instance state to Redis

## Origin and scope decision

The request was to refactor the code to match `docs/deployment.md`. A claim-by-claim audit on
2026-08-29 (recorded in `workflow/artifacts/verify/deploy-and-event-driven-v1.md`, section
"Documentation Conformance Audit") found the code already satisfies all 13 of the document's
claims. There is no conformance gap.

The scope below was therefore selected by the user from the document's "Operational behaviour to
expect" section, which records five *deliberately accepted* weaknesses. The user chose to stop
accepting the three that live in application code. This is a change to documented, intentional
decisions — not a defect fix — with one exception (R1) which is a live bug.

## Problem

Five stores of process-local state exist. On a single Render free-tier instance four of them are
correct; one is actively broken.

| Store | Location | Status today |
|---|---|---|
| Password-reset OTP | `server/src/routes/auth.routes.ts:18` `NodeCache({stdTTL:600})` | **Broken.** See below. |
| General API rate limit | `server/src/index.ts:96` `rateLimit()`, default memory store | Correct on one instance |
| Auth rate limit | `server/src/routes/auth.routes.ts:22` `rateLimit()`, default memory store | Correct on one instance |
| Product response cache | `server/src/routes/product.routes.ts:9` `NodeCache({stdTTL:60})` | Correct; divergence harmless |
| Category response cache | `server/src/routes/category.routes.ts:7` `NodeCache({stdTTL:60})` | Correct; divergence harmless |

**R1 is a live bug, not a hypothetical.** The OTP TTL is 600s. Render free-tier web services spin
down after roughly 15 minutes idle (`docs/deployment.md`, "Cold starts"). A password-reset request
is frequently the only traffic on an idle store, so the sequence "request OTP → open email →
return" routinely crosses a spin-down. The code is discarded, the user gets `INVALID_OTP` on a code
that has not expired, and nothing in the response distinguishes that from a wrong code.

The other four are speculative on the current topology and were flagged as such to the user before
this brief was written. They are in scope by explicit user decision.

## Evidence (static, file:line)

OTP lifecycle — three call sites, all inside `async` handlers:
- `auth.routes.ts:265` `otpCache.set(\`pwd_reset_${user.email}\`, otp)`
- `auth.routes.ts:305` `const storedOtp = otpCache.get(\`pwd_reset_${...}\`)`
- `auth.routes.ts:326` `otpCache.del(\`pwd_reset_${user.email}\`)`

Response caches — ten call sites, all inside `async` handlers, all pure TTL:
- `product.routes.ts` get `:89 :136 :167 :218`, set `:125 :156 :196 :258`
- `category.routes.ts` get `:13`, set `:37`
- No cross-file invalidation exists: `grep -n "flushAll\|invalidat\|cache" server/src/routes/admin.routes.ts` returns nothing. Admin writes do not bust these caches; they age out.

Rate limiters — two, both relying on `express-rate-limit`'s default in-process `MemoryStore`:
- `index.ts:96` general, `max: isDevelopment ? 1000 : 100` per 15 min
- `auth.routes.ts:22` auth, `max: isDevelopment ? 50 : 5` per 15 min

Existing Redis wiring available for reuse:
- `server/src/queues/index.ts` already constructs `new IORedis(redisUrl, {maxRetriesPerRequest: null})` and exports `connection` and `isQueueEnabled`.
- `ioredis@^6.0.0` is already a dependency. No new runtime dependency is required for R1 or R3.

## Requirements

| ID | Requirement | Source |
|---|---|---|
| R1 | Password-reset OTPs survive an instance restart or spin-down while unexpired | User selection; live bug |
| R2 | Both rate-limit counters are shared across instances rather than process-local | User selection; `deployment.md` "Rate limiting is per-instance" |
| R3 | Product and category response caches are shared across instances | User selection; `deployment.md` |
| RI1 | With `REDIS_URL` unset the server still boots and every affected path still works, degrading to today's in-memory behaviour | `deployment.md` §2 states this contract explicitly; `.env.example` marks `REDIS_URL` `[OPTIONAL]` |
| RI2 | No change to any API response shape, status code, or error code — including `INVALID_OTP` and `RATE_LIMITED` | Repo API contract; `agent-behavior.yaml` compatibility |
| RI3 | A Redis outage must not take the API down. Behaviour on outage must be an explicit, documented decision per store, not an accident | `deployment.md` P1-1 precedent: Redis is a degraded-mode dependency, not a boot dependency |
| RI4 | Command volume must stay inside the Upstash free allotment, or the overage must be quantified and accepted | `deployment.md` "Upstash command quota" |
| RI5 | `docs/deployment.md` operational section and the env examples updated to match new behaviour | Docs are the source document for this chain |
| RI6 | No secrets, connection strings, or env values in any artifact | `domain.yaml` safety constraints |

## Principal risk — RI4 directly opposes R2

`docs/deployment.md` tuned the worker's `drainDelay: 30` specifically to cap Redis traffic at
"roughly 2 blocking reads per minute per worker (~2,880/day), which sits inside the free daily
allotment", and warns: "check the quota before changing either."

R2 moves rate limiting into Redis. The general limiter is mounted on every `/api/v1/*` route, so
**every API request becomes at least one Redis command** — a per-request cost the current design
does not have. R3 adds a `GET` per cache read plus a `SET` per miss. A rough order of magnitude:

| Source | Commands |
|---|---|
| Worker idle polling (today) | ~2,880/day |
| Rate limiting (R2) | ~1–2 per API request |
| Response cache (R3) | ~1–2 per product/category request |

At 2–4 commands per request, the free allotment becomes a request-rate ceiling that does not exist
today. **This must be quantified against Upstash's current published free-tier limit during Plan
and confirmed acceptable before Build starts.** If the ceiling is too low, the correct outcome is
to descope R3 (pure latency optimisation, no correctness value) and possibly R2, keeping R1.

## Assumptions

- **A1** Upstash's free tier is command-metered with a published cap. The exact figure is *not*
  asserted here — `deployment.md` refers to a "free daily allotment" without stating it. Plan must
  cite the current published limit before relying on it. Recorded per `no_external_claim_without_evidence`.
- **A2** Render runs a single instance on the free tier, so R2 and R3 deliver no behavioural benefit
  until the service is scaled out. Their value is readiness, not a fix.
- **A3** `NodeCache.get/set` are synchronous; the Redis equivalents are not. All 13 affected call
  sites are already inside `async` handlers, so the conversion is mechanical rather than structural.
- **A4** Moving the caches to Redis makes stale reads *more* visible, not less: today each instance
  holds its own 60s copy; shared, a single stale entry serves every instance. Admin edits already do
  not bust these caches (see Evidence), so R3 slightly widens an existing staleness window.

## Questions

- **Q1** On a Redis outage, should the rate limiters fail **open** (serve traffic unmetered) or
  **closed** (reject)? Fail-open risks abuse during an outage; fail-closed turns a degraded
  dependency into an outage, contradicting the P1-1 precedent already established in this repo.
  *Blocking for Plan.* Recommendation: fail open to the in-memory store, matching RI1's fallback.
- **Q2** Should R3 proceed if the RI4 budget analysis is tight? Recommendation: descope R3 first —
  it is the only item with no correctness or security value.
- **Q3** Should the OTP store fail open or closed when Redis is down? Recommendation: fall back to
  the in-memory store, which is exactly today's behaviour, so an outage is no worse than the status quo.

## Non-goals

- The in-process queue worker and Render cold starts — `deployment.md` documents both as unfixable
  on the free tier without a paid worker service type.
- Cache invalidation on admin write. Real gap (admin edits are invisible for up to 60s) but
  pre-existing, orthogonal to where the cache lives, and not selected by the user.
- Any change to payment, checkout, or webhook logic — `.claude/CLAUDE.md` protected path.
- Session/JWT storage. Refresh tokens are already in the database, not in memory.
