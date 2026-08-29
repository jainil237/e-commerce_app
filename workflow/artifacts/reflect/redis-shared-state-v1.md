---
slug: redis-shared-state
version: 1
artifact: reflect
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/ship/redis-shared-state-v1.md
orchestration:
  phase: reflect
  status: ready-for-next-phase
  next_phase: done
  blockers: []
---

# Reflect — Move per-instance state to Redis

## What the request asked for versus what existed

The request was to "strongly refactor the code according to `docs/deployment.md`". The audit found
the code already satisfied all 13 of that document's claims, so there was no conformance gap and no
refactor derivable from the document's requirements.

**A deployment document describes topology and operations, not code architecture.** The useful
scope was not in what the doc *requires* but in what it *concedes* — its "Operational behaviour to
expect" section, which records five deliberately accepted weaknesses. Reading that section as a
backlog rather than as documentation is what produced actionable work.

## What running things caught that reading them would not

1. **`enableOfflineQueue: false` (plan D1) was wrong.** It reads as the obviously correct fail-fast
   setting and survived plan review. Six tests then failed because it rejects commands issued
   before the connection is established — including the first request after boot and every request
   during a reconnect. As designed, the change would have silently degraded every store to memory
   during exactly the windows the stores exist for.
2. **`rate-limit-redis` (plan D3) was wrong.** Its constructor issues `SCRIPT LOAD` and caches the
   SHA as a promise, so an unreachable Redis at boot leaves a permanently rejected promise and
   disables shared counting for the process lifetime — while appearing to work.
3. **`commandstats` is not a billing meter.** The measured 4.1 commands/request looked like a 2×
   budget overrun until the Upstash billing model was checked: nested `redis.call()`s inside a Lua
   script are not separately billed.

Each would have shipped as a silent production degradation. None would have been caught by reading
the diff.

## What review caught that tests did not

Finding V1: `getOtp` treated an empty Redis read as authoritative, so an OTP written during an
outage became unverifiable once Redis recovered — contradicting the dual-write that existed
specifically to survive that case. **The full suite passed with the defect present.** It was found
by reading the write path against the read path and asking whether they agreed.

Tests prove the cases you thought of. Reading two halves of a contract against each other finds the
case you did not.

## Where the estimate was wrong

The plan predicted ~2 commands per product/category request. Measurement said 4.1 raw, then 2
billable. The prediction was right, but partly by luck — the plan had not considered that inner Lua
commands are instrumented separately, so a future re-measurement without that context would have
concluded the budget was blown. The verify artifact records this explicitly to prevent that.

## Scope discipline

The user was twice given an evidence-backed recommendation to narrow scope — once before Think,
once at the Plan gate with the budget math — and chose the broader scope both times. That is
recorded as an accepted trade in the plan and ship artifacts rather than as an oversight, with the
revert path documented in two places. The right response to disagreeing with a scope is to make the
consequence legible and reversible, then build what was asked.

## Carry-forward

| Item | Where |
|---|---|
| Cache invalidation on admin write — admin edits invisible for up to 60s. Pre-existing, orthogonal to where the cache lives, an explicit non-goal here | New brief |
| `localKeys` not updated after a runtime Redis failure (review V2, P3) | Accepted; revisit only if the double-count warning matters |
| `decrement` can go below zero (review V3, P3) | Unreachable — neither limiter configures `skip` |
| Live Upstash command metering | Blocked on provisioning; carried from the `deploy-and-event-driven` chain |
| Migration baseline drift (finding F1 — tests use `db push` because migrations are broken) | Pre-existing, owned by a later chain, unchanged here |

## Chain status

brief → plan → task → review → verify → ship, all with evidence. Ship is `blocked-for-user`
pending approval to push and open a PR; nothing has left this machine.
