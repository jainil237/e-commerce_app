---
slug: payment-integrity
version: 1
artifact: ship
status: blocked-for-user
created: 2026-07-25
updated: 2026-07-25
manifest_ids: [R1, R2, R3, R4, R5, RI1, RI2, RI3, RI4, RI5, RI6]
upstream:
  - workflow/artifacts/briefs/payment-integrity-v1.md
  - workflow/artifacts/plans/payment-integrity-v1.md
  - workflow/artifacts/tasks/payment-integrity-v1.md
  - workflow/artifacts/reviews/payment-integrity-v1.md
  - workflow/artifacts/verify/payment-integrity-v1.md
orchestration:
  phase: ship
  status: blocked-for-user
  next_phase: reflect
  blockers: [B2]
  user_checkpoint: ship-review
---

# Payment Integrity & Fraud Prevention — Ship

## Inputs

- Task: `ready-for-next-phase`, all six Build phases (R1–R5, RI1–RI6) complete, 54/54 tests passing, full monorepo build clean
- Review: `pass-with-risk` — two P1 findings caught and fixed in-place, one P3 informational
- Test: `ship` — 54/54 automated checks pass; one manual-QA item (R3 real Razorpay webhook) waived by explicit user decision, recorded in `workflow/artifacts/verify/payment-integrity-v1.md`'s `## Waivers`
- `workflow/config/release.yaml`: `pull_request.required: true`, `create_policy: user_requested_or_configured` (not auto-create); `ci.required: false`; `source_of_truth.required: when_configured`
- `workflow/config/source-of-truth.yaml`: both Notion providers `update: false` — handoff only, never a direct write
- Repo state inspected this phase: branch `payment-integrity`, already pushed to `origin/payment-integrity` (pre-existing before this Ship pass — pushed either by the graphify skill's own commit or directly by the user, not by this lifecycle chain); no open PR (`gh pr list --head payment-integrity` → empty)

## Ship Status

- Recommendation: **hold** (B1 resolved; only B2 — explicit PR-creation confirmation — remains)
- Review result: pass-with-risk (2 P1 fixed in-review, 1 P3 informational, no unresolved P0/P1)
- Verification recommendation: ship (with one user-approved waiver on R3 manual QA)
- PR / CI: not opened yet — `pull_request.create_policy: user_requested_or_configured` requires explicit go-ahead (B2), separate from the merge-conflict resolution
- Source-of-truth: not required to block Ship (`update: false` on both providers) — handoff drafted in task artifact, ready for the user to apply
- Release: not required (`release.required: false` per `release.yaml`)

## Requirement Coverage

| Manifest ID | Status | Evidence | Notes |
|---|---|---|---|
| R1 | shipped (pending B1) | `payment-confirmation.test.ts`, `payment-binding.test.ts` SEC-1 block | Order↔Razorpay binding + amount verification — live-verified against a real Razorpay test-mode account this session, not just mocks |
| R2 | shipped (pending B1) | `payments-config.test.ts` | Fail-closed mock mode |
| R3 | shipped (pending B1), manual QA waived | `webhook.test.ts` R3 block; waiver in verify artifact | Raw-body HMAC — live-verified against the real webhook secret this session |
| R4 | shipped (pending B1) | `money-correctness.test.ts`, `rma-refund.test.ts` | Money correctness, including the `perUserLimit` gap Review caught |
| R5 | shipped (pending B1) | `payment-confirmation.test.ts` entry-point-equivalence test | Audit trail on both confirmation paths |
| RI1 | shipped (pending B1) | Full server test harness, `server/tests/**` | |
| RI2 | shipped (pending B1) | Response-shape audit in review artifact | One intentional contract change (`coupon.routes.ts`) shipped with its coordinated frontend update |
| RI3 | shipped (pending B1) | Brief Q1 approval cited in task/review artifacts | Protected-path (`webhook.routes.ts`) approval on record |
| RI4 | shipped (pending B1) | Secret-value grep audit, re-run in Test | |
| RI5 | shipped (pending B1) | `git ls-remote` (Test); this phase confirms branch pushed but **no PR** yet | Branch push predates this Ship pass and was not performed by this lifecycle chain |
| RI6 | shipped (pending B1) | `validation-error.test.ts` | |

Every active R/RI has passing evidence. Coverage is not the blocker — merge-readiness against `main` is.

## PR / CI Readiness

**Not opened.** `release.yaml` sets `pull_request.create_policy: user_requested_or_configured`. The instruction this phase received was "if the test phase is done then proceed with ship phase" — that authorizes the Ship *evaluation*, not PR creation, which is an external, visible action (opens something other people can see) per this session's operating rules. B1 (the merge conflict) is now resolved and is no longer what's blocking PR creation — **B2** is simply the still-open request for explicit confirmation to push the merge and open the PR.

No CI is configured (`ci.required: false`, `provider: none`) — not applicable.

### B2 — Awaiting explicit confirmation to push and open the PR

The merge commit (`294182c`) exists locally only. `origin/payment-integrity` still points at the pre-merge tip (`74236dc`). Two remaining actions, both external/visible, neither performed yet:
1. `git push` — updates the already-existing remote branch with the merge commit.
2. `gh pr create` — opens the PR against `main`.

Owner: user. Exact action needed: confirm to proceed with both, or decline and handle manually.

### B1 — RESOLVED — `main` had diverged with a conflicting, independent fix to the same money-path file

Fetched `origin/main` and compared. `payment-integrity` was **20 commits ahead, 8 commits behind** `origin/main`. Per the Ship workflow's step 4a, this was surfaced explicitly rather than absorbed silently.

The 8 commits main gained include a separate, already-merged lifecycle chain — **`oversell-race-fix`** (PR #3) — that fixes exactly the P0-1 overselling bug this chain's own brief listed as "deliberately still open, Epic 2, out of scope" (see task artifact and the Notion Epic 1 register). Their fix:
- Replaces the raw-SQL `FOR UPDATE` lock + stale-read stock check in `order.routes.ts` with a single atomic conditional `updateMany` (functionally the same class of fix the earlier architecture audit recommended).
- Adds a DB-level `CHECK (stock >= 0)` constraint migration as defense-in-depth.
- Adds `server/scripts/oversell-race-check.ts`, a standalone concurrency repro script.

`git merge-tree` against the merge-base (`30acc5a`) shows **3 files with real conflicts**:

| File | Conflict shape | Severity |
|---|---|---|
| `server/src/routes/order.routes.ts` | Both branches independently rewrote the same stock-check block — their conditional-`updateMany` rewrite vs. this chain's untouched-but-adjacent discount-clamp and `confirmPayment()` delegation edits in the same file. **Not a mechanical conflict** — needs a human/agent to read both versions and reconcile, since both are money-path logic. | High |
| `workflow/config/repo-profile.yaml` | `definitions_root: /Users/jainil/.agentsmyth/workflow` (this branch, absolute) vs `definitions_root: ~/.agentsmyth/workflow` (main, tilde) | Trivial — take theirs, it's more portable |
| `workflow/config/pending-setup.yaml` | Both sides independently resolved different subsets of pending-setup items (this branch: PS-1–3; main: PS-1,2,6,7,8) | Trivial — union of both, no actual disagreement |

**Resolution (user-directed):** presented three concrete options plus "stop, I'll handle it." User selected **"Merge main into payment-integrity"** (verbatim). Executed as a Build-shaped fix-pass, not silently inside Ship:

1. `git merge origin/main --no-edit` — `order.routes.ts` **auto-merged with zero conflict markers**, confirming the pre-merge diff inspection was correct: main's stock-check rewrite and this chain's changes touch non-overlapping regions.
2. `workflow/config/pending-setup.yaml` (add/add conflict) — resolved as a union of both sides' independently-resolved items (PS-1/2/3 here, PS-1/2/6/7/8 on main); no actual disagreement between them.
3. `workflow/config/repo-profile.yaml` (content conflict) — took main's `definitions_root: ~/.agentsmyth/workflow` (portable) over this branch's machine-specific absolute path.
4. Re-ran full verification post-merge: `npx tsc --noEmit` clean, `npm run test --workspace=server` → 54/54 passing (unchanged from pre-merge), full monorepo `npm run build` → clean.
5. Committed as `294182c`. `payment-integrity` is now **21 ahead, 0 behind** `origin/main`.

No implementation logic was written or altered by this reconciliation — every line that landed came from one side or the other of the merge, chosen deliberately, then proven with the same evidence bar as every other phase in this chain.

## Release Readiness

Not applicable — `release.yaml` sets `release.required: false`. No deployment gate evaluated for the same reason (`deployment.required: false`), and it would be premature before B1 resolves regardless.

## Source-of-Truth Status

**Not required to block** (`update: false` on both Notion providers — `source-of-truth.yaml`). Handoff already drafted, copy-ready, in `workflow/artifacts/tasks/payment-integrity-v1.md` (§52): which Epic 1 checklist items this chain closes (R1–R5), the one item already closed before this chain started (S-02 ZodError→400), and the explicit note that Epic 2/Epic 3 remain open. That handoff is now **more urgent** given B1 — the user should know Epic 2's overselling bug (P0-0/P0-1) has *also* been independently fixed on `main` via `oversell-race-fix`, which the Notion register does not yet reflect either.

## Risk And Rollback

- **Residual risk (pre-existing, carried from Test):** R3's raw-body HMAC mechanism is proven against real wire bytes and a real webhook secret, but not against an actual Razorpay-delivered event. Waived by the user in Test; follow-up action stands: verify against a real webhook before production traffic.
- **Residual risk (new, this phase):** none remaining from B1 — resolved and re-verified (54/54 tests, clean build) after merge.
- **Rollback trigger:** post-merge, if `order.routes.ts`'s reconciled stock-check + payment-confirmation logic misbehaves (unexpected 5xx rate on `/orders` or `/orders/verify-payment`, or a confirmed order failing to decrement stock / a stock check passing when it shouldn't).
- **Rollback action:** revert the merge commit on `main` (`git revert -m 1 <merge-sha>`); no data migration to undo, since this chain made no schema changes (`server/prisma/schema.prisma` untouched — confirmed via `git status` throughout Build).
- **Rollback owner:** user.
- **Limits:** a rollback after real payment traffic has flowed through the reconciled code does not undo any Razorpay-side charges/refunds already processed; those would need manual reconciliation against Razorpay's dashboard, same as any payment-code rollback.

## Blocked Handoff

- **Provider/source type:** git (this repository, not an external tracker)
- **Source item:** local branch `payment-integrity` (merge commit `294182c`) vs `origin/payment-integrity` (still at pre-merge tip `74236dc`)
- **Fields/sections needing resolution:** none — B1 resolved. Only B2 (push + PR creation confirmation) remains.
- **Owner:** user
- **Exact handoff:** confirm `git push` and `gh pr create`, or decline
- **Risk:** none identified — merge re-verified with full test suite and build
- **Affected manifest IDs:** none (B2 is procedural, not a requirement gap)
- **Ship impact:** blocks final `ship` recommendation until user confirms

## Architecture Notes

- role: Senior DevOps
- decision: recommendation is `hold`, not `ship` or `hold-with-waiver` — B1 is not a residual risk the user can simply accept and move past (that's what `hold-with-waiver` is for); it's an unresolved merge conflict in payment-critical code that has no safe default resolution. A waiver would mean shipping without knowing which stock-check logic actually runs.
- decision: did not attempt an automatic `git merge`/`git rebase` to "see what happens" — for a file this sensitive, generating a conflict marker file and asking the user to resolve it blind is worse than presenting the two versions and the reconciliation options directly, which is what this artifact does.
- constraint: PR creation is gated on explicit user request per `release.yaml`; even absent B1, Ship would not have opened one unprompted.
- downstream — if the user picks reconciliation via this chain: that is Build-shaped work (a new phase or a small follow-up task), not something Ship performs; Ship would re-run after that lands.
- downstream — Reflect: cannot start meaningfully until B1 resolves, since Reflect's job is to close out a shipped or accepted chain, and this one is neither yet.

## Checkpoint Approval

- Checkpoint: ship-review
- Status: pending — awaiting user decision on B1.

## Exit Gate

- [x] Recommendation is ship / hold / hold-with-waiver. — `hold`
- [x] Every R and RI has a coverage row.
- [x] Rollback trigger and action defined.
- [x] All configured gates checked or marked not applicable with config reference.

## Next Phase

Blocked — awaiting user decision on B1 before Ship can re-evaluate.
