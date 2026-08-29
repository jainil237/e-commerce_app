---
slug: redis-shared-state
version: 1
artifact: verify
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/redis-shared-state-v1.md
  - workflow/artifacts/plans/redis-shared-state-v1.md
  - workflow/artifacts/tasks/redis-shared-state-v1.md
  - workflow/artifacts/reviews/redis-shared-state-v1.md
orchestration:
  phase: test
  status: ready-for-next-phase
  next_phase: ship
  blockers: []
  user_checkpoint: none
---

# Verification — Move per-instance state to Redis

## Environment

Unlike the prior `deploy-and-event-driven` chain, both dependencies were reachable for this run:
MySQL on `localhost:3306` and a local `redis-server` on `localhost:6379`. Every check below is a
current-run measurement, not a citation.

## Automated checks

| Command | cwd | Outcome | Evidence |
|---|---|---|---|
| `npm run build` | `.` | **pass**, exit 0 | Server tsc + both Next.js production builds |
| `npm run lint` | `.` | **pass**, exit 0 | Both apps lint; `server`/`shared` skipped via `--if-present` |
| `npm test --workspace=server` | `.` | **pass** — 101 tests, 12 files | 18 new in `tests/services/shared-state.test.ts`, 83 pre-existing, zero regressions |
| `npm run db:migrate` | `.` | not run | No schema change in this chain — no model, field, or index touched. Running a migration would be a no-op at best |

## Manual QA

| Scenario | Environment | Steps | Expected | Observed | Outcome | Evidence | Manifest IDs |
|---|---|---|---|---|---|---|---|
| Boot with Redis | Local, `REDIS_URL` set, port 4123 | Start built server, read startup log | Boots, worker starts, no Redis error | `✅ Database connected` / `👷 Queue worker started` / `🚀 Server running on port 4123`. No Redis error | **pass** | Startup log | RI1, RI3 |
| Boot without Redis | Local, `REDIS_URL` unset, port 4124 | Same | Boots, queue disabled, no error | `📭 Queue disabled (REDIS_URL unset) — jobs run inline` / `🚀 Server running on port 4124` | **pass** | Startup log | RI1 |
| Live rate-limit counting | Local server + Redis, port 4125 | `flushdb`, then 3 × `GET /api/v1/categories` | Counter in Redis = 3, TTL = window | `rl:general:::1 = 3`, `ttl=900` (matches the 15-min `windowMs`) | **pass** | `redis-cli --scan`, `get`, `ttl` | R2 |
| Live response caching | Same | Same 3 requests | One shared cache entry with 60s TTL | `categories:all`, `ttl=60`, `strlen=312` | **pass** | `redis-cli ttl`, `strlen` | R3 |
| Response unchanged | Same | Observe HTTP status of the 3 requests | 200, identical shape | `200 200 200` | **pass** | curl status codes | RI2 |
| No runtime Redis noise | Same | grep server log for redis/error | Nothing | No matches | **pass** | Server log | RI3 |

## RI4 — measured, not just derived

The plan derived the command budget arithmetically. This run measured it and then verified the
billing model that the arithmetic depends on.

**Measurement.** 50 × `GET /api/v1/categories` against a local Redis with `config resetstat`
first. `INFO commandstats` after:

| Command | Calls | Source |
|---|---|---|
| `evalsha` | 49 | Rate limiter (one per request) |
| `eval` | 1 | First call, before the script SHA was cached |
| `get` | 50 | Response cache read |
| `pttl` | 50 | **Inside** the rate-limiter Lua script |
| `setex` | 1 | Response cache write — one miss, then 49 hits |

Raw total ≈ 4.1 commands/request, which initially looked like double the plan's estimate.

**Billing model verified.** Redis's `commandstats` counts every `redis.call()` executed inside a
Lua script separately; that is internal instrumentation, not a billing meter. Upstash counts an
`EVAL`/`EVALSHA` as **one** command regardless of how many nested operations the script performs
(<https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http>). The
`incr` and `pttl` lines above are therefore not separately billable.

**Billable cost per request:**

| Request type | Billable commands |
|---|---|
| Any `/api/v1/*` request | 1 (rate limiter `EVALSHA`) |
| Product/category cache hit | 2 (`EVALSHA` + `GET`) |
| Product/category cache miss | 3 (`EVALSHA` + `GET` + `SETEX`) |

This confirms the plan's ~1.5 blended estimate and therefore the ~9,200 API requests/day and
~1,800 page views/day ceiling recorded in `docs/deployment.md`.

**It also validates the design choice.** The naive `INCR` + `PTTL` + conditional `PEXPIRE` store
would have cost 3 billable commands per request instead of 1 — tripling the cost of the
highest-volume path in the application. The Lua script is load-bearing for RI4, not a micro-optimisation.

## Manifest coverage

| ID | How verified | Result | Notes |
|---|---|---|---|
| R1 | automated test | **pass** | `survives a process restart` — OTP set, module graph reset (fresh NodeCache, as on a woken Render instance), OTP still verifies |
| R2 | automated test + live QA | **pass** | Cross-instance sharing in tests; `rl:general:::1 = 3` after 3 real HTTP requests |
| R3 | automated test + live QA | **pass** | Cross-instance sharing in tests; `categories:all` present with a 60s TTL after real requests |
| RI1 | automated test + live QA | **pass** | Three `REDIS_URL`-unset tests; server boots and serves without Redis |
| RI2 | review + live QA | **pass** | Guard shapes unchanged; 200s with identical shape; `INVALID_OTP`/`RATE_LIMITED` untouched |
| RI3 | automated test + live QA | **pass** | Four fail-open tests against an unreachable port; no Redis error reached a request |
| RI4 | measurement + source | **pass** | Measured above; billing model cited |
| RI5 | inspection | **pass** | `docs/deployment.md` quota section rewritten with the ceiling and the revert path; `.env.example` states the trade inline |
| RI6 | inspection | **pass** | No env values, connection strings, or secrets in any artifact |

## Skipped checks

| Check | Manifest IDs | Why skipped | Risk | Owner | Blocks ship |
|---|---|---|---|---|---|
| `npm run db:migrate` | — | No schema change in this chain | none | — | no |
| Live Upstash command metering | RI4 | No Upstash instance is provisioned. Local Redis measurement plus Upstash's documented billing model covers the requirement | Low — the arithmetic is confirmed by measurement; only the provider's meter is unobserved | user | no |
| Multi-instance deployment test | R2, R3 | Sharing is proven between two store instances in-process; a genuine two-instance deployment needs paid Render | Low — the store is the unit under test and Redis is the shared medium | user | no |

## Findings

1. The review's V1 (P1) defect was fixed before this run and carries a regression test.
2. `commandstats` is a misleading proxy for Upstash billing. Recorded here because the raw figure
   (4.1/request) would otherwise look like a 2× budget overrun on any future re-measurement.
3. No new runtime dependency ships. `package-lock.json` is unchanged from its pre-Build state.

## Sign-off

- Verifier: Claude
- Date: 2026-08-29
- Recommendation: **ship**. All nine manifest rows pass with current-run evidence. The remaining
  unobserved item is the provider's own meter, which cannot be read without a provisioned Upstash
  instance and does not gate this change.
