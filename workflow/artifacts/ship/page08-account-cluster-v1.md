---
slug: page08-account-cluster
version: 1
artifact: ship
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, RI1, RI2, RI3]
upstream:
  brief: workflow/artifacts/briefs/page08-account-cluster-v1.md
  plan: workflow/artifacts/plans/page08-account-cluster-v1.md
  task: workflow/artifacts/tasks/page08-account-cluster-v1.md
  review: workflow/artifacts/reviews/page08-account-cluster-v1.md
orchestration:
  phase: ship
  status: ready-for-next-phase
  next_phase: reflect
  blockers: []
  recommendation: ship
---

# Ship — Page 08: Account Cluster

## Recommendation: ship
Local, verified (web build), style-only. Review = pass.

## Coverage
R1, R2, R3, RI1–RI3 → shipped (local, on branch).

## Release Gates
| Gate | Status | Evidence |
|------|--------|----------|
| branch | pass | `feat/homepage-redesign` |
| pull_request | deferred | branch-level redesign PR (pages 01–10 stacked) |
| ci / release / deploy | n/a | release.required: false |

## Test Waiver
- waived_gate: `test`; reason: style-only, build+grep sufficient; residual: visual parity (low); owner: user; approval: "review and ship page 08, 09, 10".

## Rollback
area: `apps/web/src/app/account/{page,orders/page,addresses/page}.tsx` + 3 scss · trigger: visual regression · action: `git checkout HEAD -- apps/web/src/app/account/` + delete new scss · owner: user.
