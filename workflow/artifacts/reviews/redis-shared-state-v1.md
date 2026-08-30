---
slug: redis-shared-state
version: 1
artifact: review
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/redis-shared-state-v1.md
  - workflow/artifacts/plans/redis-shared-state-v1.md
  - workflow/artifacts/tasks/redis-shared-state-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
  user_checkpoint: none
---

# Review — Move per-instance state to Redis

Review target: the working-tree diff for this chain — 4 new modules, 1 new test file, 4 modified
source files, 2 documentation files. `package-lock.json` is unchanged from its pre-Build state.

## Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| V1 | P1 | OTP written during an outage was unreachable after Redis recovered | **fixed** |
| V2 | P3 | `localKeys` stays `false` after a runtime Redis failure | accepted |
| V3 | P3 | `decrement` can drive a counter below zero | accepted |
| V4 | P2 | `commandTimeout` may clip the first command behind a cold TLS connect | accepted, documented |

### V1 (P1) — fixed

`getOtp` treated any successful Redis read as authoritative, including an empty one. Because
`setOtp` dual-writes, a code created while Redis was unreachable exists only in process memory.
If Redis recovered before the user submitted that code, `getOtp` would read `null` from Redis and
return it without consulting memory — rejecting a valid, unexpired OTP.

This is the precise mid-flow outage the dual-write was introduced to survive, so the read path
contradicted the write path's intent. Fixed: memory is now consulted whenever Redis returns empty.
Regression test added (`still verifies a code written during an outage after Redis recovers`).

Found by reading the write path against the read path, not by a failing test — the original suite
passed with the defect present.

### V2 (P3) — accepted

`FailOpenRedisStore.localKeys` is set `false` when Redis is configured and only flipped to `true`
when it is absent at construction. After a *runtime* failure the store counts per-instance while
still advertising shared keys. The flag feeds only express-rate-limit's double-count
misconfiguration warning, so the consequence is a possibly-absent dev warning, never incorrect
enforcement. Tracking it accurately would mean mutating the flag on every failure and recovery for
no behavioural gain.

### V3 (P3) — accepted

`decrement` issues a bare `DECR`, which can go negative if called without a matching increment.
express-rate-limit only calls it for requests excluded by `skip`/`skipSuccessfulRequests`, neither
of which is configured on either limiter, so the path is currently unreachable. Flooring at zero
would add a branch to dead code.

### V4 (P2) — accepted, documented

`commandTimeout: 1_000` bounds a command whether it is queued during connect or hung against a
dead server. A cold TLS handshake to Upstash from a just-woken Render instance could in principle
exceed 1s, timing out the first command and degrading that single request to memory.

Accepted because: the failure mode is one degraded request, not an error; Render cold starts
already cost ~50s, so one more degraded request is not material; and raising the timeout would make
every request wait longer before falling back during a genuine outage — a worse trade on the
general limiter, which runs on every API call. Measured behaviour against an unreachable port was
68ms and 602ms, so retry exhaustion, not the timeout, is the usual fail-fast path.

## Requirement coverage

| ID | Verdict | Basis |
|---|---|---|
| R1 | pass | Restart-survival test passes; the paired test documents the pre-change behaviour it replaces |
| R2 | pass | Cross-instance count sharing proven by a second store instance observing the first's count |
| R3 | pass | Cross-instance cache sharing proven; corrupt entries degrade to a miss |
| RI1 | pass | Three `REDIS_URL`-unset tests; all stores match pre-Redis behaviour |
| RI2 | pass | Guard shapes unchanged (`if (cached)`); `cacheGet` returns `undefined` on miss as `NodeCache.get` did. Date fields round-trip to identical JSON either way, since `res.json()` already serialised them to ISO strings |
| RI3 | pass | Four fail-open tests, including V1's recovery case |
| RI4 | **pass-with-risk** | Budget is derived and documented, not measured. No Upstash instance exists to observe real command volume — see Test |
| RI5 | pass | Quota ceiling is now the most prominent item in the deployment doc's operational section; `.env.example` states the trade inline |
| RI6 | pass | No env values, connection strings, or secrets in any artifact |

## Design review

**The Build deviations are improvements, and both were caught by evidence rather than opinion.**
Dropping `rate-limit-redis` removed a dependency whose constructor did eager I/O and cached its
own failure permanently — a defect that would have manifested in production as silently-disabled
shared counting after any boot-time blip. Reversing `enableOfflineQueue: false` fixed a hole that
made six tests fail for the right reason: the plan's design would have degraded every store to
memory during connect and reconnect windows.

Both deviations are recorded in the task artifact with the reasoning, so the plan's D1/D3 are
superseded rather than silently ignored.

**The single fallback shape is the right call.** Routing every store through `tryRedis` means the
"unset" path and the "down" path cannot drift apart, which is why RI1 and RI3 are provable with
the same tests.

**One asymmetry is deliberate and documented:** the OTP store dual-writes; the response cache does
not. A cache miss re-queries the database and costs nothing but latency, whereas a lost OTP strands
a user mid-flow. Each module's header states its own reasoning.

## Verification reviewed

| Command | Outcome | Date |
|---|---|---|
| `npm run build` (root) | pass, exit 0 | 2026-08-29 |
| `npm run lint` (root) | pass, exit 0 | 2026-08-29 |
| `npm test --workspace=server` | pass — 100/100 before V1's test, 101 after | 2026-08-29 |

## Recommendation

**pass-with-risk.** The code is correct and covered. The single unproven requirement is RI4: the
command budget is arithmetic derived from Upstash's published limit and this codebase's request
shape, not a measurement. It cannot be measured without a live Upstash instance, and the ceiling it
predicts is the accepted consequence of a scope the user confirmed with the analysis in hand.
