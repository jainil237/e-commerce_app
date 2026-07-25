---
slug: oversell-race-fix
version: 1
artifact: ship
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/oversell-race-fix-v1.md
  plan: workflow/artifacts/plans/oversell-race-fix-v1.md
  task: workflow/artifacts/tasks/oversell-race-fix-v1.md
  review: workflow/artifacts/reviews/oversell-race-fix-v1.md
  verify: workflow/artifacts/verify/oversell-race-fix-v1.md
orchestration:
  phase: ship
  status: ready-for-next-phase
  next_phase: reflect
  blockers: []
  recommendation: ship
---

# Ship — Fix the overselling race (Story 1.2)

## Recommendation: ship

Review = pass (1 non-blocking P2). Test = ship, with fresh execution evidence for every manifest
ID including the previously code-reviewed-only RI1. No open blockers.

## Coverage

R1–R3, RI1–RI2 → verified with execution evidence, all passing.

## Release Gates

| Gate | Status | Evidence |
|---|---|---|
| branch | pass | `fix/oversell-race`, cut from `main` (current with `origin/main` at time of cut) |
| build | pass | `npm run build --workspace=server` — clean |
| lint | n/a | No `lint` script in `server` (V1-10, pre-existing repo-wide gap, not introduced here) |
| db:migrate | pass | `20260725000000_add_product_stock_check` applied; pre-flight (0 violating rows, MySQL 9.6.0) recorded before authoring |
| pull_request | pending | opened as part of this Ship step |
| ci | n/a | no CI configured in this repo |

## Waiver

None required. All plan requirements (R1, R2, R3, RI1, RI2) verified with passing evidence; no
skipped gate needed a waiver.

## Known non-blocking follow-up (from Review, F1)

The new `CHECK (stock >= 0)` constraint is table-wide and also covers
`server/src/services/rma.service.ts:183` (RMA-replacement approval decrement, no floor guard,
never in this story's scope). Previously that path could silently drive stock negative; it will
now hard-fail with a raw Prisma/MySQL error surfaced to the admin (caught, so no crash — just an
unpolished message). Net improvement, not a regression, but recommend a follow-up story to give
that path a proper `INSUFFICIENT_STOCK`-style error.

## Rollback

area: `server/src/routes/order.routes.ts`, `server/prisma/migrations/20260725000000_add_product_stock_check/`
trigger: unexpected checkout failures in production, or the CHECK constraint blocking a
legitimate write path not caught in this review
action:
- App-level revert: `git revert` the code commit (`2eb6953`) restores the old compare-then-decrement.
- Migration revert (only if the constraint itself is the problem): `ALTER TABLE Product DROP CONSTRAINT Product_stock_non_negative;` — write as a new down-migration, do not hand-edit history.
owner: on-call engineer
limits: reverting the code change alone re-opens the oversell race; reverting the migration alone
is safe on its own (the app-level fix stands without it, per the plan's defense-in-depth framing).

## Approvals on record

- Checkout logic (`order.routes.ts`): approved at story selection (2026-07-25), reconfirmed at
  Build gate per plan.
- DB migration (non-destructive `ALTER … ADD CONSTRAINT`): approved via plan review; pre-flight
  evidence gate satisfied before it ran.
