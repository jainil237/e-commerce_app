---
slug: redis-shared-state
version: 1
artifact: ship
status: blocked-for-user
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/redis-shared-state-v1.md
  - workflow/artifacts/plans/redis-shared-state-v1.md
  - workflow/artifacts/tasks/redis-shared-state-v1.md
  - workflow/artifacts/reviews/redis-shared-state-v1.md
  - workflow/artifacts/verify/redis-shared-state-v1.md
orchestration:
  phase: ship
  status: blocked-for-user
  next_phase: reflect
  blockers:
    - Pushing the branch and opening a PR is an external write and needs explicit user approval.
  user_checkpoint: ship-review
---

# Ship — Move per-instance state to Redis

## Branch and commits

Branch `deploy-and-event-driven` (non-default — branch policy satisfied). Working tree clean,
six commits ahead of `origin/deploy-and-event-driven`. Three were created by this chain:

| Commit | Subject |
|---|---|
| `ecffab0` | `feat(server): back rate limits, OTPs, and response cache with Redis` |
| `be2c491` | `docs(env): make env examples match the code exactly` |
| `a5d328f` | `fix(lint): clear pre-existing web lint errors and unblock root run` |

The latter two close out Test-phase remediation for the earlier `deploy-and-event-driven` chain
(RI6 lint gate, R1/RI7 env completeness) and were recorded in that chain's task artifact scope
before committing.

## Release gate

| Gate | Result |
|---|---|
| `npm run build` (root) | pass, exit 0 — post-commit |
| `npm run lint` (root) | pass, exit 0 — post-commit |
| `npm test --workspace=server` | pass — 101 tests, 12 files, post-commit |
| Upstream artifact chain | brief → plan → task → review → verify, all `ready-for-next-phase` |
| Protected paths | none modified. `webhook.routes.ts`, `schema.prisma`, `shared/types/**` untouched |
| Branch policy | satisfied — non-default branch, no direct commit to `main` |
| Commit-coverage validator | passed on every commit; no `--no-verify` used |
| New dependencies | none. `package-lock.json` matches its pre-Build state |
| Secrets in artifacts | none — names only, no values |

## Blast radius

| Area | Effect |
|---|---|
| `POST /api/v1/auth/forgot-password`, `/reset-password` | OTPs now persist across restarts. Response shapes and `INVALID_OTP` unchanged |
| Every `/api/v1/*` route | Rate-limit counters read/written in Redis when configured. `RATE_LIMITED` shape unchanged |
| `GET /api/v1/products*`, `/categories*` | Cache reads/writes move to Redis. Response bodies unchanged |
| Upstash command consumption | **Increases substantially.** ~1 command per API request, ~2 per product/category request |
| Behaviour with `REDIS_URL` unset | Identical to before this change |

## Known risk carried into production

The command ceiling — roughly 1,800 page views/day on Upstash's free tier — is documented in
`docs/deployment.md` and `server/.env.example`. It is an accepted trade: the user was shown the
budget analysis with a recommendation to descope the response cache and chose the full scope.

Revert path requires no code change: unset `REDIS_URL` and every store returns to in-process
memory. Partial revert (drop the response cache only, keeping the OTP fix and shared limiters) is
a small change confined to `product.routes.ts` and `category.routes.ts`.

## Blocked — approval required

Pushing the branch and opening a pull request are external writes. The commits are local and
nothing has left this machine.

Awaiting a decision on: push `deploy-and-event-driven` to origin and open a PR against `main`.
