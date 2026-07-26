---
slug: inventory-reservation
version: 1
artifact: ship
status: final
created: 2026-07-26
updated: 2026-07-26
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/inventory-reservation-v1.md
  - workflow/artifacts/plans/inventory-reservation-v1.md
  - workflow/artifacts/tasks/inventory-reservation-v1.md
  - workflow/artifacts/reviews/inventory-reservation-v2.md
  - workflow/artifacts/reviews/inventory-reservation-v3.md
  - workflow/artifacts/verify/inventory-reservation-v1.md
orchestration:
  phase: ship
  status: ready-for-next-phase
  next_phase: reflect
  blockers: []
  user_checkpoint: ship-review
---

# Inventory Reservation — Ship

## Inputs

- Verify recommendation: `ship` (`workflow/artifacts/verify/inventory-reservation-v1.md`) — 72/72 automated tests, live curl-based concurrency + payment-confirmation walkthrough against real MySQL, `tsc` clean, no migration drift.
- Review recommendation: `pass` (`inventory-reservation-v2.md`, full R1-R6/RI1-RI6 chain) and `pass` (`inventory-reservation-v3.md`, scoped re-review of the R1 deadlock-fix delta) — no unresolved P0/P1 findings.
- `workflow/config/release.yaml`: `pull_request.required: true`, `create_policy: user_requested_or_configured`; `ci.required: false`; `release.required: false`; `deployment.required: false`; `docs.required: false`; `package.required: false`.
- `workflow/config/source-of-truth.yaml`: `mode: optional`, `default_required: false` — this chain's brief/plan did not depend on the configured Notion source, so no read/update obligation applies.
- `workflow/config/repo-profile.yaml`: `require_non_default_branch_for_changes: true` (satisfied — branch `inventory-reservation`); protected paths `server/prisma/schema.prisma`, `server/src/routes/webhook.routes.ts` — neither touched by this chain's diff.

## Ship Status

- Branch: `inventory-reservation`, 5 commits ahead of `origin/main`, 0 behind (fetched and compared this pass — no divergence, no rebase needed).
- Pushed to `origin/inventory-reservation` this phase (`git push -u origin inventory-reservation`).
- PR opened: **https://github.com/jainil237/e-commerce_app/pull/6** — title `feat(server): reserve stock at order creation`, body follows the user's standing PR template (Intent/Summary, Major/Minor changes, Impact, Evidence, Review notes/Risks).
- No CI configured on this repo (`ci.provider: none`) — nothing to check.
- No release, deployment, docs, or package gate configured as required.

## Requirement Coverage

| Manifest ID | Status | Evidence | Notes |
|---|---|---|---|
| R1 | shipped | verify v1 row R1; review v3 | Reserve-not-decrement + deadlock-safe lock ordering |
| R2 | shipped | verify v1 row R2; review v2 | Single availability source, consistent exclusion semantics |
| R3 | shipped | verify v1 row R3 | Conversion at payment confirmation, single decrement point |
| R4 | shipped | verify v1 row R4; review v2 | Release/restore wired into cancel + both webhook events |
| R5 | shipped | verify v1 row R5; review v2 | Re-validation before conversion (active-product + availability) |
| R6 | shipped | verify v1 row R6; review v2 | CLAUDE.md accurately describes the reservation-based flow |
| RI1 | shipped | verify v1 row RI1 | 72/72 tests, re-run fresh this phase's upstream Test pass |
| RI2 | shipped | verify v1 row RI2 | Zero `apps/web`/`apps/admin` diff, confirmed directly |
| RI3 | shipped | verify v1 row RI3 | `schema.prisma` untouched by this chain; migration status clean |
| RI4 | shipped | verify v1 row RI4 | No secrets/credentials in diff or artifacts |
| RI5 | shipped (superseded) | this phase pushed the branch and opened PR #6 | Verify's "nothing pushed" observation was true at Test time; Ship's job is exactly to push + open PR, which happened this phase with user approval |
| RI6 | shipped | verify v1 row RI6 | Live regression guard against real MySQL, in addition to the suite's regression test |

## PR / CI Readiness

- PR: https://github.com/jainil237/e-commerce_app/pull/6 (open, base `main`, head `inventory-reservation`).
- CI: not configured for this repository (`ci.provider: none`) — not applicable.

## Release Readiness

- `release.required: false` — no release/version/tag action is in scope for this chain.
- `deployment.required: false` — no deployment gate configured; this chain introduces no new env var, dependency, or infra, so there is nothing for a deploy step to pick up beyond the normal merge-to-main pipeline (external to this lifecycle).
- `docs.required: false`, `package.required: false` — not applicable.
- `generated_output.required: when_changed_or_configured` — no generated output in scope (no `.next` build artifacts committed, no codegen touched).

## Source-of-Truth Status

not required — `source_of_truth.mode: optional`, `default_required: false`, and neither the brief nor the plan for this chain declared a dependency on the configured Notion source.

## Risk And Rollback

- Residual risk (carried from Test, unchanged): expired `ACTIVE` `StockReservation` rows are never physically swept in this chain — lazy expiry only, by explicit product decision (brief Q1). Accepted; not a ship blocker.
- Residual risk (carried from brief, unchanged, pre-existing and unrelated to this PR's code): `Store.config.json` (15 min) vs `config/store.config.json` (30 min) diverge; this chain reads the one actually loaded at runtime (30 min) but does not fix the duplicate-file issue itself.
- Rollback trigger: production order-creation failures, reservation-related deadlocks (MySQL 1213) in logs, or incorrect stock decrements observed after this PR merges to `main`.
- Rollback action: `git revert` the merge commit for PR #6 on `main` (single PR, no schema migration to unwind — `StockReservation` model predates this chain, no new migration shipped) and redeploy `server`. No data backfill or manual DB repair is required since no destructive migration or irreversible data transform is part of this diff.
- Rollback owner: user (repo owner / on-call for `server`).
- Rollback limits: a revert restores decrement-at-creation behavior, which reintroduces the original P0-0 abandoned-cart stock-lock bug this chain was built to fix — acceptable as a temporary rollback state, not a long-term one.

## Blocked Handoff

none

## Architecture Notes

- role: Senior DevOps
- decision: recommend `ship` — every configured required gate (branch, PR) has evidence; CI/release/deployment/docs/package/source-of-truth are all `not required` per this repo's own release config, not skipped by omission.
- constraint: `pull_request.create_policy: user_requested_or_configured` gated the push/PR-creation action behind explicit user approval (per this session's own action-authorization rules, not just the workflow config) — obtained this turn before pushing or opening PR #6.
- constraint: rollback plan assumes a single-PR revert is sufficient because this chain shipped no schema migration and no irreversible data transform — verified via RI3 (schema untouched) across both review rounds.
- tradeoff: Ship did not independently re-run the test suite or re-verify concurrency behavior — it relies on Test's `ship`-recommending verify artifact and Review's two `pass` recommendations, per the normal phase-gate separation of duties (Test verifies, Ship gates release readiness).
- assumption Reflect must preserve: two follow-ups are still open and un-actioned — (1) a physical sweeper for stale `ACTIVE` reservation rows (deferred to Epic 10 per the brief), (2) the duplicate `Store.config.json`/`config/store.config.json` files with divergent values (tracked as TD-11 per the brief). Neither blocks this ship; both should surface in Reflect as carried-forward work, not be treated as resolved by this PR.
- downstream — Reflect: once PR #6 merges, Reflect should confirm the merge landed on `main` cleanly and close out RI5's "not yet pushed" note from the original brief/plan as fully resolved by this Ship phase.

## Checkpoint Approval

- Checkpoint: ship-review
- Status: approved
- User's own words (verbatim, this turn): "Push branch + open PR" (selected in response to being asked how to handle the required-but-uncreated PR gate), preceded by "proceed to ship phase" starting this phase.

## Exit Gate

- [x] Recommendation is ship / hold / hold-with-waiver.
- [x] Every R and RI has a coverage row.
- [x] Rollback trigger and action defined.
- [x] All configured gates checked or marked not applicable with config reference.

## Next Phase

Reflect
