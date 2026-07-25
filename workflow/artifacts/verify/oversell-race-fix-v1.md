---
slug: oversell-race-fix
version: 1
artifact: verify
status: ready-for-next-phase
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, RI1, RI2]
upstream:
  brief: workflow/artifacts/briefs/oversell-race-fix-v1.md
  plan: workflow/artifacts/plans/oversell-race-fix-v1.md
  task: workflow/artifacts/tasks/oversell-race-fix-v1.md
  review: workflow/artifacts/reviews/oversell-race-fix-v1.md
orchestration:
  phase: test
  status: ready-for-next-phase
  next_phase: ship
  blockers: []
  user_checkpoint: none
---

# Fix the overselling race — Verification

## Inputs

- Plan artifact: `workflow/artifacts/plans/oversell-race-fix-v1.md` (status: ready-for-next-phase)
- Task artifact: `workflow/artifacts/tasks/oversell-race-fix-v1.md` (status: complete)
- Review artifact: `workflow/artifacts/reviews/oversell-race-fix-v1.md` (recommendation: pass, 1 non-blocking P2)
- Verification items: 5 manifest IDs (R1, R2, R3, RI1, RI2)
- Branch: `fix/oversell-race`

Build/Review phases already exercised the concurrency case repeatedly. This phase's new work:
running the **non-concurrent** paths that RI1 claims are unchanged — those had only been
code-reviewed until now, never actually executed.

## Automated Checks

| Command | Outcome | Evidence |
|---|---|---|
| `server/scripts/oversell-race-check.ts 20` | PASS | `successes=1 insufficient_stock=19 other=0 final_stock=0` |
| Single-order happy path (ad hoc script, see below) | PASS | 5 → 2 units ordered → stock 3; order created |
| Over-quantity single request (ad hoc script) | PASS | 400 `INSUFFICIENT_STOCK`; stock untouched; zero order rows created |
| Multi-item order (ad hoc script) | PASS | Two line items, both decremented correctly in one transaction (10→7, 4→3) |
| `npm run build --workspace=server` | PASS | `tsc` — no errors |
| `npm run lint --workspace=server` | N/A | No `lint` script (V1-10, pre-existing repo-wide gap) |
| `npm run build` (root, all 3 workspaces) | N/A — unrelated failure | `apps/web`/`apps/admin` `next build` fail with `ECONNREFUSED` during static generation because no API server was running to fetch from. Confirmed pre-existing and unrelated: `server`'s build step runs first in the chain and completed cleanly (silent `tsc` success) before the Next.js steps failed; this diff touches no frontend code |

The three non-concurrent cases were run via a throwaway script
(`server/scripts/_single-order-check.ts`, not committed — same spawn-isolated-server pattern as
`oversell-race-check.ts`) and deleted after the evidence below was captured.

```
[case 1] PASS — single order succeeds, stock 5 -> 3
[case 2] PASS — over-quantity request rejected, stock untouched, no order row
[case 3] PASS — multi-item order decrements both line items correctly
[single-order-check] ALL PASS
```

## Manifest Coverage

| Manifest ID | How Verified | Evidence | Result | Notes |
|---|---|---|---|---|
| R1 | command | `oversell-race-check.ts` run against pre-fix code (recorded in task artifact): 10 concurrent → 10 successes, stock -9 | PASS | Race reproduced and confirmed broken before any fix code existed |
| R2 | command | `oversell-race-check.ts` run at N=10 (×4), N=15 (×1), N=20 (×1) against fixed code — every run: exactly 1 success, final stock 0 | PASS | Stable across 6 independent runs, concurrency up to 20 |
| R3 | command | Direct `UPDATE Product SET stock = -1` on a fixture row, rejected by MySQL | PASS | Constraint verified live, not just present in migration file |
| RI1 | command (new this phase) | Single-order, over-quantity, and multi-item cases all run against a live server | PASS | Previously only code-reviewed; now has execution evidence. Response shape, `INSUFFICIENT_STOCK` code, and per-item decrement all behave as before the fix |
| RI2 | command | Pre-flight (`COUNT(stock<0)=0`, `VERSION()=9.6.0`) recorded in task artifact before migration authored; `prisma migrate deploy` succeeded; `migrate status` confirms schema current | PASS | No destructive action; migration is a pure additive `ALTER … ADD CONSTRAINT` |

## Findings

No new findings this phase. F1 from the review (CHECK constraint's effect on
`rma.service.ts`'s unguarded replacement-decrement, P2, non-blocking) stands — not re-verified
here since it's explicitly out of this story's scope and was not touched by this diff.

## Skipped Checks

| Check | Why Skipped | Risk | Owner | Blocks Ship |
|---|---|---|---|---|
| Root `npm run build` (Next.js apps) | Requires a running API server for static-generation fetches; this diff is server-only and touches no frontend code | None | — | No |
| RMA-approval replacement decrement under low stock (F1's scenario) | Out of this story's approved scope — no code here changes that path | Low (documented in review as a follow-up) | Follow-up story | No |
| CI wiring for `oversell-race-check.ts` | No test runner configured in this repo (V1-9/6.5, separate open item in the parent brief) | Low — script is committed and runnable on demand | Story 6.5 | No |

## Architecture Notes

- role: QA Verifier
- decision: prioritized running the one thing Review flagged as unverified (RI1's non-concurrent
  paths) rather than re-running what Build/Review already proved repeatedly.
- constraint: verification scripts that create real DB rows always clean up their own fixtures,
  including on the assertion-failure path (cleanup runs before the `assert` calls in both scripts).
- downstream: `server/scripts/oversell-race-check.ts` stays committed as a standing regression
  guard for this race, per the plan. The ad hoc single-order script was intentionally not
  committed — it duplicates setup/teardown patterns already in the committed script and existed
  only to produce this phase's evidence.

## Sign-Off

- Verifier: Claude Sonnet 5
- Date: 2026-07-25
- Recommendation: **ship**

### Justification

All 5 manifest IDs verified with execution evidence, not just code review:
- **R1**: race reproduced and confirmed broken pre-fix (required gate, satisfied)
- **R2**: race fixed, stable across 6 runs up to concurrency 20
- **R3**: DB constraint verified to actually reject negative stock, live
- **RI1**: newly executed this phase — single order, over-quantity rejection, and multi-item
  order all behave identically to pre-fix expectations
- **RI2**: migration applied cleanly with pre-flight evidence recorded before it was written

One non-blocking finding from Review (F1) carries forward as a recorded follow-up, not a Ship
blocker — it's a net data-integrity improvement in a file outside this story's scope.

**No blockers remain.**
