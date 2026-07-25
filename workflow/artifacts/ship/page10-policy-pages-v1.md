---
slug: page10-policy-pages
version: 1
artifact: ship
status: ready-for-next-phase
created: 2026-06-24
updated: 2026-06-24
manifest_ids: [R1, R2, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/page10-policy-pages-v1.md
  plan: workflow/artifacts/plans/page10-policy-pages-v1.md
  task: workflow/artifacts/tasks/page10-policy-pages-v1.md
  review: workflow/artifacts/reviews/page10-policy-pages-v1.md
orchestration:
  phase: ship
  status: ready-for-next-phase
  next_phase: reflect
  blockers: []
  recommendation: ship
---

# Ship — Page 10: Static / Policy Pages

## Recommendation: ship
Local, verified (web build, 7 routes static), style-only. Review = pass, no findings.

## Coverage
R1, R2, RI1, RI2 → shipped (local, on branch).

## Release Gates
| Gate | Status | Evidence |
|------|--------|----------|
| branch | pass | `feat/homepage-redesign` |
| pull_request | deferred | branch-level redesign PR (pages 01–10 stacked) |
| ci / release / deploy | n/a | release.required: false |

## Test Waiver
- waived_gate: `test`; reason: static pages, build+grep sufficient; residual: ~4px contact gap (negligible); owner: user; approval: "review and ship page 08, 09, 10".

## Rollback
area: `apps/web/src/styles/policy.scss` + 7 policy `page.tsx` · trigger: visual regression · action: `git checkout HEAD -- apps/web/src/app/{cancellation,shipping,contact,faq,returns,privacy,terms}/` + delete `policy.scss` · owner: user.
