---
slug: page09-order-detail
version: 1
artifact: ship
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4]
upstream:
  brief: workflow/artifacts/briefs/page09-order-detail-v1.md
  plan: workflow/artifacts/plans/page09-order-detail-v1.md
  task: workflow/artifacts/tasks/page09-order-detail-v1.md
  review: workflow/artifacts/reviews/page09-order-detail-v1.md
orchestration:
  phase: ship
  status: ready-for-next-phase
  next_phase: reflect
  blockers: []
  recommendation: hold-with-waiver
---

# Ship — Page 09: Order Detail (cross-app)

## Recommendation: hold-with-waiver
Both web + admin builds pass; Review = pass-with-risk. Residual = unverified visual parity across admin RMA/modal states. User accepted this risk and owns manual QA (plan Q1), so Reflect may proceed under waiver.

## Coverage
R1–R4, RI1–RI4 → shipped (local, on branch).

## Release Gates
| Gate | Status | Evidence |
|------|--------|----------|
| branch | pass | `feat/homepage-redesign` |
| pull_request | deferred | branch-level redesign PR |
| ci / release / deploy | n/a | release.required: false |

## Waiver
- waived: visual-parity verification of admin RMA/modal/success states (R3/R4).
- reason: ~20 conditional states impractical to auto-verify; build proves compilation in both apps.
- residual_risk: subtle admin visual regression possible.
- owner: user · follow_up: manual QA of `/orders/[id]` (customer + admin) incl. RMA flow · approval: user elected manual QA at plan Q1 + "review and ship".

## Test Waiver
- waived_gate: `test` (no separate verify artifact); covered by dual-build evidence in task + this waiver.

## Rollback
area: `shared/pages/order/*`, `shared/styles/*`, `apps/web/src/app/orders/[id]/page.tsx` · trigger: regression on web or admin order detail · action: `git checkout HEAD -- shared/pages/order/ apps/web/src/app/orders/` + remove new scss/`shared/styles` · owner: user · limits: affects BOTH apps.
