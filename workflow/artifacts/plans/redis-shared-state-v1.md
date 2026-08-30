---
slug: redis-shared-state
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/redis-shared-state-v1.md
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review-cleared
  task_class: complex
---

# Plan — Move per-instance state to Redis

## A1 resolved — Upstash free tier, with evidence

`docs/deployment.md` referred to a "free daily allotment" without stating it. Retrieved
2026-08-29 from Upstash's published pricing documentation
(<https://upstash.com/docs/redis/overall/pricing>):

| Free tier limit | Value |
|---|---|
| Commands | **500,000 / month** (≈16,667/day) |
| Data size | 256 MB |
| Bandwidth | 10 GB / month |
| Databases | 1 |

A1 is now evidence-backed rather than assumed.

## RI4 budget analysis — the binding constraint

Current consumption, from `deployment.md`'s own figure: worker idle polling at `drainDelay: 30`
is ~2 blocking reads/min ≈ **2,880/day ≈ 86,400/month**, or 17.3% of the allotment. That leaves
**≈413,600 commands/month ≈ 13,800/day** for everything else.

Per-request cost of the selected scope:

| Item | Commands per request | Applies to |
|---|---|---|
| R2 general limiter | 1 (single Lua `EVAL`) | **every** `/api/v1/*` request |
| R2 auth limiter | 1 (single Lua `EVAL`) | auth routes only, additive |
| R3 cache hit | 1 (`GET`) | product/category reads |
| R3 cache miss | 2 (`GET` + `SET`) | product/category reads |
| R1 OTP | 1–2 per reset, negligible volume | password reset only |

So a typical storefront API request costs **1 command** (rate limit) and a product/category
request costs **2** (rate limit + cache read).

Deriving the ceiling. At a blended ~1.5 commands/request:

```
13,800 commands/day ÷ 1.5 = ~9,200 API requests/day
```

A single storefront page view is not one API request. The app fetches products, categories,
cart, wishlist, and an auth check on a typical page, so **4–6 API requests per page view** is a
fair estimate for this codebase.

```
~9,200 API requests/day ÷ 5 = ~1,800 page views/day
```

**This ceiling does not exist today.** The current in-memory stores cost zero Redis commands, so
today the only Redis consumer is the worker and traffic is bounded by Render, not Upstash. The
selected scope converts a free-tier *storage* limit into a free-tier *traffic* limit.

Exceeding it does not degrade gracefully — Upstash rejects commands once the monthly cap is hit,
which with a fail-open design (below) means rate limiting silently stops enforcing, and with a
fail-closed design means an outage.

### Which items actually buy something

| Item | Correctness value today | Command cost | Verdict |
|---|---|---|---|
| R1 OTP | **Real. Fixes a live bug.** | Negligible — only on password reset | Clear keep |
| R2 rate limits | None until scale-out (A2). Security-relevant only when >1 instance | Highest — every request | Expensive readiness |
| R3 caches | **None at all.** Pure latency optimisation; correctness identical either way | High — highest-traffic endpoints | Costs the most, buys the least |

R3 is the worst trade in the set: it consumes the largest share of the budget for the only item
with zero correctness or security value. Worse, per brief A4 it slightly *widens* the staleness
window, because one shared stale entry now serves every instance instead of each instance holding
its own.

## Design

Common to all three items, and the reason this is Complex class: a new shared-state boundary.

### D1 — A dedicated Redis client, not the queue's

`server/src/queues/index.ts` already exports an `IORedis` built with `maxRetriesPerRequest: null`.
That setting is **required** for BullMQ's blocking reads and **wrong** for everything here: it makes
an ordinary command retry forever instead of failing, so a Redis outage would hang request handlers
rather than falling back.

New `server/src/utils/redis.ts` exporting a separate client:

```ts
new IORedis(url, {
  maxRetriesPerRequest: 1,   // fail fast so the fallback can take over
  enableOfflineQueue: false, // reject immediately while disconnected, do not buffer
  connectTimeout: 3_000,
})
```

Both clients share one Upstash database; only the connection options differ.

### D2 — One fallback shape, three consumers (RI1, RI3)

Each store is a thin module that prefers Redis and falls back to today's in-memory object. This
satisfies RI1 (`REDIS_URL` unset ⇒ unchanged behaviour) and RI3 (outage ⇒ degraded, not down)
with the same code path, so the unset case and the outage case cannot drift apart.

- `server/src/utils/otp.store.ts` — `get`/`set`/`del`, Redis `SETEX`/`GET`/`DEL`, NodeCache fallback
- `server/src/utils/response.cache.ts` — `get`/`set`, Redis `GET`/`SETEX` with JSON, NodeCache fallback
- Rate limiting — `rate-limit-redis` store, or `undefined` to let `express-rate-limit` use its
  default `MemoryStore`

Every Redis call is wrapped so a rejection logs once and returns the fallback result. No Redis
error may surface to a request.

### D3 — `rate-limit-redis` over a hand-rolled store

A hand-rolled `Store` is roughly 40 lines, but the natural implementation is
`INCR` + `PTTL` + conditional `PEXPIRE` = **2–3 commands per request**. `rate-limit-redis` ships a
Lua script that does it in **one** `EVAL`. Under a command-metered budget that is a 2–3× difference
on the single highest-volume path, so the dependency pays for itself. This is the one new runtime
dependency in the plan.

`ioredis@^6.0.0` is already present, so R1 and R3 need no new dependency.

### D4 — Call-site conversion (A3, RI2)

`NodeCache` is synchronous; Redis is not. 13 call sites become `await`, all already inside `async`
handlers:

- `auth.routes.ts:265, 305, 326` — OTP
- `product.routes.ts:89, 125, 136, 156, 167, 196, 218, 258` — cache
- `category.routes.ts:13, 37` — cache

No response shape, status code, or error code changes. `INVALID_OTP` and `RATE_LIMITED` are
preserved exactly (RI2).

## Sequenced steps

| # | Step | Manifest | Exit evidence |
|---|---|---|---|
| 1 | `utils/redis.ts` — client, lazy connect, single-shot error logging | RI1, RI3 | Boots with and without `REDIS_URL` |
| 2 | `utils/otp.store.ts` + convert 3 auth call sites | R1, RI1, RI2 | Unit test: set/get/del against both backends |
| 3 | Restart-survival test for OTP | R1 | Test proves a code set before a simulated restart still verifies |
| 4 | `rate-limit-redis` store wired into both limiters, memory fallback | R2, RI1, RI3 | Limiter returns 429 at the configured max via Redis |
| 5 | `utils/response.cache.ts` + convert 10 cache call sites | R3, RI2 | Existing product/category responses byte-identical |
| 6 | Outage simulation across all three stores | RI3 | Redis killed mid-run: requests still succeed |
| 7 | Update `docs/deployment.md` + `.env.example` | RI5 | Operational section states the new ceiling and per-store outage behaviour |

Steps 1–3 are independent of 4–5 and deliver R1 alone if scope is cut.

## Decisions taken on the brief's questions

- **Q1 — fail open.** Rate limiters fall back to the in-memory store on outage. Fail-closed would
  turn a degraded dependency into an outage, contradicting the P1-1 precedent already set in this
  repo (`reviews/deploy-and-event-driven-v1.md`), where Redis was explicitly made non-blocking for boot.
- **Q3 — fall back to memory.** An outage then behaves exactly as today, so it is never worse than
  the status quo.
- **Q2 — resolved 2026-08-29: proceed with R3.** The user was shown the RI4 budget analysis in full,
  including the recommendation to descope R3, and reaffirmed the full scope. Recorded as an accepted
  trade, not an oversight. RI5 must therefore document the ceiling prominently.

## Scope decision — resolved

The user selected the full scope before the RI4 budget was quantified, was then shown the analysis
above together with a recommendation to descope R3, and **reaffirmed the full scope on 2026-08-29**.

Build proceeds with R1 + R2 + R3. The estimated **~1,800 page views/day** free-tier ceiling is an
accepted trade, not an unnoticed consequence. RI5 is upgraded from "document the change" to
"document the ceiling prominently enough that it cannot be discovered by surprise in production",
and the escape hatch is recorded: unsetting `REDIS_URL` reverts every store to in-memory with no
code change.

## Risks

| Risk | Mitigation |
|---|---|
| Command budget exhausted mid-month; limiters silently stop enforcing | Documented in RI5; recommend descoping R3. Fail-open is a deliberate, recorded choice |
| Shared cache widens staleness window (A4) | Admin writes already do not bust these caches; unchanged TTL. Recorded as pre-existing |
| Two Redis clients against one free DB | Connection count is well within free-tier limits; options differ for good reason (D1) |
| `rate-limit-redis` version coupling to `express-rate-limit` v7 | Official package tracking the v7 `Store` interface; pinned at install |
