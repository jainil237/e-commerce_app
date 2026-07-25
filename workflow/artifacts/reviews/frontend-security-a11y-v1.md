---
slug: frontend-security-a11y
version: 1
artifact: review
status: draft
created: 2026-07-20
updated: 2026-07-20
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5]
upstream:
  brief: workflow/artifacts/briefs/frontend-security-a11y-v1.md
  plan: workflow/artifacts/plans/frontend-security-a11y-v1.md
  task: workflow/artifacts/tasks/frontend-security-a11y-v1.md
orchestration:
  phase: review
  status: ready-for-next-phase
  next_phase: test
  blockers: []
architecture_notes:
  role: Staff Reviewer
---

# Frontend Security, Correctness & Accessibility Remediation — Review

## Review Target

`feat/homepage-redesign..HEAD` on branch `frontend-security-a11y` — 11 commits, 57 files changed. Reviewed the full diff, not just the task artifact's claims.

## Findings

### P1 — Razorpay SDK throw could permanently disable the pay button (found and fixed in this review)

`apps/web/src/app/checkout/page.tsx`, `script.onload` handler.

The W-04 fix (commit `ea7f2ba`'s ancestor) correctly removed the blanket `setIsLoading(false)` at the end of `createOrder` so the pay button stays disabled through the async Razorpay flow. That removal had a side effect nobody caught at the time: `new Razorpay(options).open()` runs inside `script.onload`, a callback that fires after `createOrder` has already returned — outside the function's own `try/catch`. Before the W-04 fix, the blanket reset ran synchronously right after `appendChild`, before `onload` could even fire, so a throw here was silently absorbed by an already-reset UI. After the fix, with that blanket reset gone, a throw in this callback (malformed options, an ad-blocker, the SDK bundle failing) would leave `orderInFlight` and `isLoading` stuck `true` forever, with the pay button permanently disabled and no error shown — recoverable only by a page reload.

**Status: fixed in this review pass**, commit `f9edaf4`. Wrapped the constructor call in its own `try/catch`, releasing the guard and surfacing an error on throw. New test (`Review finding: releases the guard if the Razorpay SDK throws on open()`) drives it deterministically by intercepting `document.createElement` to capture the injected script element (jsdom does not execute injected scripts) and firing `onload` by hand with `window.Razorpay` stubbed to throw. Verified failing against the pre-fix code before restoring the fix.

This is exactly the class of thing Review exists to catch: a locally-correct fix (W-04) with a non-obvious interaction at a boundary (an event-handler callback outside the function's own error handling) that unit tests focused on the happy path didn't exercise.

## Requirement Coverage

| Manifest ID | Status | Evidence |
|---|---|---|
| R1 — Frontend security quick tier | **covered** | `f9a9890`. W-01/02/18/19 closed; redirect-guard unit tests, greps for wildcard/`allow-same-origin`, both builds |
| R2 — Accessibility AA/AAA tier | **covered** | `401576e` (role check), `45ea8d2` (A-03), `d1f0837` (A-01/A-02, computed against real backgrounds not the audit's optimistic numbers), `d7a59fc` (A-04, A-06–A-09, A-12). `scripts/verify-contrast.mjs` is a re-runnable gate, not a one-time claim |
| R3 — Accessibility structural (A-10, A-11) | **covered** | `d7a59fc`. Heading order fixed; blanket reduced-motion rule in both apps |
| R4 — Server findings outside arb-remediation scope | **partial** | S-02, S-06, S-07 (partial — magic bytes added; `fileFilter` itself was already present, audit was stale), admin role check all done and runtime-verified (`401576e`). S-08 (cookie-parser), S-20 (webhook rate limit), S-17 (`optionalAuth` collapse) explicitly deferred — first two touch `server/src/index.ts`, contested with the parallel `arb-remediation` chain; S-17 is a pure refactor with no server test harness on this branch to catch a mistake. Documented, not silently dropped |
| R5 — Frontend correctness defects | **covered, one item deferred** | `f8ab357`, `e9926a0`. W-03 through W-07, W-14, W-15, W-17 done with tests. W-16 (three syncing effects on the products page) deferred — needs a browser to verify back-button behavior, Low severity, editing blind risks a worse regression than the bug it fixes |
| R6 — `shared/` package + RTK Query data layer | **partial, by deliberate scope decision** | `85bd86f` (package, behavior-neutral — P5's tests pass unmodified), `8e79381`+`e9926a0` (RTK Query foundation + products migrated end-to-end), `a4c999b` (lint rules, real but at `warn` not `error`). **~60 raw `fetch()` sites remain outside `shared/api/`** — cart, checkout's other calls, wishlist, auth, all of admin. The plan's literal exit-gate text (`grep -rc 'fetch(' ... returns 0`) is not met. This was a considered decision, not a shortfall discovered late: converting five dozen call sites with no live backend to verify any of them against is the exact failure mode the audit warns about twice. The brief's own R6 acceptance criteria (single baseQuery, real lint rules, one distinguishable error state, tag-scoped invalidation) **is** met |
| RI1 — No collision with arb-remediation | **covered** | File-ownership diff (`comm -12`) against `arb-remediation`'s changed-file list is empty except `package-lock.json`, which both chains regenerate independently via `npm install` — expected merge friction, not a real conflict, and not something either chain can avoid short of one waiting for the other |
| RI2 — Branch and PR policy | **partial** | Non-default branch (`frontend-security-a11y`) confirmed; nothing pushed, no PRs opened yet — pending explicit user go-ahead at Ship, per repo policy on external-write actions |
| RI3 — Findings re-verified before fixing | **covered** | Documented staleness across the chain: `A-05`, `A-08` (half), `S-07`, `W-08`'s count, `W-12`'s count, `W-19` (worse than documented), plus this review's own Razorpay finding. Roughly one register entry in five didn't match the code by the time it was touched |
| RI4 — Evidence policy | **covered** | Every phase in the task artifact cites command output; S-02 and S-06 were proven at runtime (a live Express app, a real JWT sign/verify), not inferred from source reading; every accessibility claim that static analysis cannot prove (VoiceOver, keyboard flow, 320px reflow) is explicitly marked unproven pending this Test phase |
| RI5 — No secrets in artifacts | **covered** | Scanned all three chain artifacts for secret-shaped strings (`sk_live`, `rzp_live_<10+ chars>`, AWS keys, PEM blocks) — none found. The `rzp_live_abc123` string in the new test is an obvious fixture, ten characters, not a real key pattern |

## Verification Reviewed

- `npx tsc --noEmit` (web, admin) — both clean at every commit boundary checked.
- `npx vitest run --root apps/web` — 14 tests, 4 files, all passing after this review's fix (13 before).
- `npm run build --workspace=apps/web` and `--workspace=apps/admin` — both exit 0. Noted in the task artifact: this required fixing a self-inflicted regression mid-phase (adding a real ESLint config turned `next build`'s previously-inert lint step into a build-breaking one on pre-existing unrelated errors) — the fix (`eslint.ignoreDuringBuilds: true`) was applied in the same commit that introduced the regression, not left dangling.
- `node scripts/verify-contrast.mjs` — re-run in this review, passes. The script is checked in, so this is a repeatable gate.
- `node scripts/verify-no-tailwind-with-scss.mjs` — re-run, passes against the 8-file baseline with 0 new violations.
- W-04/W-07/W-06 fixes were demonstrated failing-before by reverting source and re-running tests, not just passing-after. W-03's test does **not** reproduce the original bug (documented honestly in the task artifact rather than smoothed over) — it depends on `CartProvider`'s real unstable identity, which the test's stable mock replaces.

## Residual Risk

- **`server/src/index.ts` deferrals (S-08, S-20).** Both are one-line-scale fixes sitting in a file `arb-remediation` is actively editing. Low technical risk, real scheduling risk if nobody picks them up after both chains merge — worth a tracked follow-up, not a blocker here.
- **`no-restricted-syntax` fetch rule at `warn`.** Real and visible, but not enforced. Someone could add fetch call #61 and nothing stops them. Acceptable for now given the alternative (a build-breaking `error` on 60 pre-existing sites) is worse; escalate once the migration is materially further along.
- **W-13 (`inventory-snapshot.ts`) is still live.** The RTK Query tag-invalidation mechanism that will eventually replace it is built and tested, but nothing invalidates through it yet — no mutation endpoint exists. `forceRefreshSnapshot` still clears every cached snapshot to refresh one. Unchanged by this chain; will close when cart/checkout migrate.
- **`--brand-primary` changed across the whole storefront** (`#1D4ED8` → `#1E40AF`, approved at brief checkpoint). This is a visible design change shipping inside a security/correctness/accessibility PR bundle. Worth flagging for whoever reviews the PR that the diff will include this even though it reads as "just a hex value" — it changes every button and link.
- **Runtime accessibility claims are unverified pending Test.** Toast `aria-live` behavior, modal focus trap under a real screen reader, and 320px reflow are all structurally correct per source and automated checks, but none of that is proof a screen reader announces correctly. This is the explicit next phase, not a gap being hidden.

## Architecture Notes

- role: Staff Reviewer
- decision: reviewed by reading full diffs per file rather than trusting the task artifact's per-commit summaries — this is what surfaced the Razorpay finding, which no test in the original P5/P8 work exercised.
- decision: fixed the one P1 finding found (Razorpay throw) directly in this pass rather than only recording it, since it was small, self-contained, in code from earlier in this same chain, and leaving a known stuck-button bug in reviewed code serves no one. Recorded transparently as a review-phase fix, not folded silently into an earlier commit.
- tradeoff: R6's partial status is accepted rather than treated as a blocking gap, because the brief's actual acceptance criteria (not the plan's more aggressive exit-gate text) is what R6 promised the user, and that is met. The plan's stricter language was itself a planning-time overreach the Plan artifact should probably have caught — noting it here so Reflect can consider whether Plan is systematically too aggressive on migration-scale phases.
- assumption for Test to verify: that the manual QA scenarios the audit says static analysis cannot close (keyboard-only checkout, VoiceOver toast/modal announcement, 320px reflow) are actually run with real tooling where available, and honestly marked unrunnable where a genuine environment limit exists (VoiceOver specifically cannot be driven by browser automation).
- downstream: Ship must not push or open PRs without explicit user confirmation — this is an externally-visible, hard-to-reverse action under the repo's own policy, and the user's "proceed with P8" authorized review/test work, not necessarily six PRs against a real remote.

## Recommendation

**pass-with-risk.**

No P0 findings. One P1 found and fixed within this review pass, with evidence. R4 and R6's partial coverage are both documented, deliberate scope decisions with clear reasoning and follow-up paths, not silent gaps — Ship should carry them forward as explicit deferred items, not block on them. Residual risk is enumerated above and none of it is a reason to hold.

Test may start.
