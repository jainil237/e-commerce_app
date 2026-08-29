---
slug: redis-shared-state
version: 1
artifact: task
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/redis-shared-state-v1.md
  - workflow/artifacts/plans/redis-shared-state-v1.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  task_class: complex
changed_files:
  - server/src/utils/redis.ts
  - server/src/utils/otp.store.ts
  - server/src/utils/response.cache.ts
  - server/src/utils/rate-limit.store.ts
  - server/src/index.ts
  - server/src/routes/auth.routes.ts
  - server/src/routes/product.routes.ts
  - server/src/routes/category.routes.ts
  - server/tests/services/shared-state.test.ts
  - docs/deployment.md
  - server/.env.example
---

# Build — Move per-instance state to Redis

## Summary

All seven planned steps are complete. R1, R2, and R3 are implemented behind one shared
fallback so the "no `REDIS_URL`" path and the "Redis is down" path are the same code.

**No new runtime dependency.** The plan's D3 specified `rate-limit-redis`; it was installed,
found defective for this use (below), and removed. `package-lock.json` is byte-identical to
its pre-Build state.

## Changed Files

**New modules:**
- `server/src/utils/redis.ts`
- `server/src/utils/otp.store.ts`
- `server/src/utils/response.cache.ts`
- `server/src/utils/rate-limit.store.ts`

**Call-site conversions:**
- `server/src/index.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/routes/product.routes.ts`
- `server/src/routes/category.routes.ts`

**Tests:**
- `server/tests/services/shared-state.test.ts`

**Documentation:**
- `docs/deployment.md`
- `server/.env.example`

**Upstash verification addendum, 2026-08-29:**
- `server/src/utils/redis.ts`
- `server/src/queues/index.ts`
- `server/src/index.ts`
- `server/tests/services/shared-state.test.ts`
- `docs/deployment.md`
- `server/.env.example`

## Upstash verification addendum (2026-08-29)

Follow-up on a request to confirm the Redis layer actually targets Upstash. The code was
provider-agnostic — it read `REDIS_URL` and nothing more — so a wrong value produced silent
degradation rather than a visible error. Three gaps closed:

**1. A malformed `REDIS_URL` could crash the server at boot (P1-1 violation).**
`new IORedis(url)` throws synchronously on some malformed connection strings, and both
`utils/redis.ts` and `queues/index.ts` construct their client at module scope — modules that
`index.ts` imports. A typo would therefore kill the deploy, directly contradicting the P1-1
decision that Redis is a degraded-mode dependency and never a boot dependency. Both constructions
are now wrapped; a bad value disables Redis, logs an error, and the app serves on memory.

Found by a test, not by review: the existing suite passed with the defect present.

`isQueueEnabled` now derives from the constructed client rather than from `Boolean(process.env.REDIS_URL)`,
since a malformed URL leaves the variable set but the connection undefined.

**2. No visible confirmation of the Redis target.** `reportRedisTarget()` logs one line at startup —
`🔴 Redis: <host> (Upstash|non-Upstash, TLS|PLAINTEXT)` — with credentials stripped. Verified
against six configurations: unset, local plaintext, Upstash plaintext, Upstash TLS, malformed, and
production with a non-Upstash host.

Two self-inflicted defects were found and fixed during that verification: the malformed case
originally reported "not configured" (conflating unset with unparseable, while a client had in fact
been created and the worker started), and the TLS warning originally fired on plaintext localhost,
which is the normal local-dev setup — training the reader to ignore the line. The TLS warning is
now scoped to Upstash hosts and to production.

**3. Upstash-specific operational settings were undocumented.** `docs/deployment.md` §2 now records
that TLS is mandatory, that eviction must stay disabled (it is off by default; it is designed for
cache data, and this database also holds BullMQ job state), and Upstash's own published guidance
that BullMQ polls continuously and suits a Fixed plan over Pay-As-You-Go.

Verification: root `npm run build` exit 0, root `npm run lint` exit 0, `npm test --workspace=server`
109 passing across 12 files (8 new here, zero regressions).

## Steps

| # | Step | Manifest | Status | Evidence |
|---|---|---|---|---|
| 1 | `utils/redis.ts` — dedicated client | RI1, RI3 | done | Boots with and without `REDIS_URL`; 17/17 store tests |
| 2 | `utils/otp.store.ts` + 3 auth call sites | R1, RI1, RI2 | done | 6 OTP tests pass |
| 3 | OTP restart-survival test | R1 | done | `survives a process restart` passes |
| 4 | Rate-limit store + both limiters | R2, RI1, RI3 | done | 5 rate-limit tests pass |
| 5 | `utils/response.cache.ts` + 10 call sites | R3, RI2 | done | 6 cache tests pass |
| 6 | Outage simulation | RI3 | done | 3 fail-open tests against an unreachable port |
| 7 | Docs + env example | RI5 | done | `docs/deployment.md`, `server/.env.example` |

## Deviations from plan

### D3 reversed — `rate-limit-redis` removed, hand-rolled with `ioredis.defineCommand`

The plan chose `rate-limit-redis` for its single-`EVAL` Lua script, since command count is the
binding RI4 constraint. Two defects surfaced during Build, both found by tests rather than review:

1. **Its constructor issues commands eagerly.** `new RedisStore(...)` calls `SCRIPT LOAD` twice
   from the constructor body, outside any caller's try/catch. With Redis unreachable this
   produced an *unhandled promise rejection*, which would have surfaced in production, not just
   in tests.
2. **It caches the failure permanently.** The resulting SHA is stored as a promise field. If
   Redis is unreachable at construction, that promise stays rejected for the life of the object,
   so a transient blip at boot would silently disable shared counting until the next deploy —
   defeating R2 entirely while appearing to work.

`ioredis.defineCommand` performs the same single-command increment, manages EVALSHA/NOSCRIPT
reloading internally, does no eager work, and caches no failure. It also removes the dependency
and its `express-rate-limit >= 8.6.0` peer constraint, which had already forced a downgrade to
`rate-limit-redis@4` (peer `>= 6`) to avoid an unplanned `express-rate-limit` v7→v8 upgrade.

Net: the plan's *goal* for D3 (one Redis command per request) is met; its chosen *mechanism* is not.

### `enableOfflineQueue: false` reversed

The plan's D1 specified `enableOfflineQueue: false` for fail-fast behaviour. Tests showed this
rejects any command issued **before the connection is established** — including the first request
after boot and every request during a reconnect. Six tests failed because writes never reached
Redis at all.

Replaced with the ioredis default (`true`) plus `commandTimeout: 1_000`, which bounds how long a
command may wait whether it is queued during connect or stuck against a dead server. Fail-fast is
preserved; the startup hole is not.

This was a real defect, not a test artifact: as written, the plan's design would have silently
degraded every store to memory during exactly the windows that matter.

## Verification

| Command | Outcome | Evidence |
|---|---|---|
| `npm run build` (root) | pass | Exit 0. Server tsc + both Next.js production builds |
| `npm run lint` (root) | pass | Exit 0 |
| `npm test --workspace=server` | pass | **100 tests, 12 files, all passing.** 17 new, 83 pre-existing, zero regressions |

Local MySQL (`:3306`) and a local `redis-server` (`:6379`) were both reachable for this run, so
the suite executed for real rather than being blocked as in the prior chain.

## Manifest coverage

| ID | Result | Evidence |
|---|---|---|
| R1 | pass | `survives a process restart` — OTP set, module graph reset (fresh NodeCache, as on a woken instance), OTP still verifies. The complementary test documents the old behaviour: without Redis the same sequence returns null |
| R2 | pass | `counts hits in Redis and shares them across instances` — second store instance sees the first's count |
| R3 | pass | `is shared across instances`; corrupt entries degrade to a miss rather than a 500 |
| RI1 | pass | Three tests with `REDIS_URL` unset; all stores behave as before Redis existed |
| RI2 | pass | No response shape, status, or error code changed. Cache guard is still `if (cached)`; `cacheGet` returns `undefined` on miss exactly as `NodeCache.get` did. `INVALID_OTP` and `RATE_LIMITED` untouched |
| RI3 | pass | Three tests against `redis://127.0.0.1:1`: OTP, cache, and limiter all fall back without throwing |
| RI4 | pass (documented, not measured) | Budget recorded in `docs/deployment.md`. Live measurement requires a provisioned Upstash instance — see Review |
| RI5 | pass | `docs/deployment.md` quota section rewritten with the ceiling; `.env.example` carries the trade-off inline |
| RI6 | pass | No env values, connection strings, or secrets in any artifact |

## Notes

- `resetTime` guards `PTTL == -1` (key present, no expiry) rather than reporting a reset time in
  the past.
- The OTP store dual-writes; the response cache does not. A cache miss just re-queries the
  database, so a second write buys nothing there — reasoning recorded in each module's header.
- No graceful-shutdown hook was added for the new client: `server/src/index.ts` has no
  `SIGTERM`/`SIGINT` handler to attach to, and inventing one is outside this scope.
