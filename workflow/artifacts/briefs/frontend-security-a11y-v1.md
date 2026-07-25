---
slug: frontend-security-a11y
version: 1
artifact: brief
status: draft
created: 2026-07-20
updated: 2026-07-20
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5]
upstream: []
related_chains:
  - slug: arb-remediation
    relationship: sibling — owns the server money-path findings this brief excludes
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
---

# Frontend Security, Correctness & Accessibility Remediation — Brief

## Source Links

- `docs/product/architecture-audit-and-refactor-plan.md` — authoritative findings for this chain. Parts I–IV; the Part IV register (§16.1–16.3) carries the stable IDs (`S-*`, `W-*`, `A-*`) used below.
- `docs/product/architecture-review-board-assessment-2026-07-19.md` — the *other* audit, already owned by the `arb-remediation` chain.
- `workflow/artifacts/briefs/arb-remediation-v1.md` — sibling chain; its Non-Goals explicitly defer "any accessibility, styling, or frontend-architecture work from the prior audit" to a later chain. This is that chain.
- `workflow/artifacts/briefs/frontend-architecture-assessment-v1.md` — a documentation-only assessment (no frontmatter, no manifest, no downstream plan). Treated as a source, not an active lifecycle chain.
- Repo policy: `.claude/CLAUDE.md` — protected paths, branch policy.

## Problem

The audit registers 56 findings. The `arb-remediation` chain took the server money-path subset and is currently mid-Build, blocked on its own base-branch question (B1). Everything else in the audit — the entire frontend security surface, the frontend data-layer debt, and the whole WCAG register — has no owner and no chain.

Three of those unowned items are live and cheap: an unauthenticated open image proxy (`W-01`), an open redirect fired at the highest-trust moment in the session (`W-02`), and a toast system that is completely silent to screen readers on the paths that carry every login and registration error (`A-03`). Two colour tokens fail WCAG AA outright and are applied to real content, not decoration (`A-01`, `A-02`).

Underneath those sits one structural cause the audit names directly (§16.4): a correct implementation exists in `shared/`, and a second copy was written next to it instead of being reused. That is why the toast-id collision is fixed in web and still broken in admin, why a broken modal sits next to an accessible one, and why the `fetcher` is defined three times with the third missing `credentials`. Until `shared/` is a real package, this list regenerates itself.

## Findings Re-verified Against This Branch

The audit is dated 2026-07-19 and was written against a tree whose base the `arb-remediation` chain later found to be `feat/homepage-redesign`, not `main`. I re-checked a representative sample on the current branch before scoping. **Most findings are live; three are materially stale and one is worse than documented.**

| ID | Audit claim | Verified state on `arb-remediation` | Delta |
|---|---|---|---|
| W-01 | wildcard `hostname: '**'` both apps | live — `web/next.config.js:18`, `admin/next.config.js:12` | none |
| W-02 | unvalidated `redirect` param | live — `login/page.tsx:23,26,36` | none |
| W-08 | 3 `fetcher` defs, ~50 raw fetches | 3 defs confirmed; **32** raw `fetch(` sites, not ~50 | count overstated |
| W-12 | 29 tsx files mix Tailwind + `.scss` | **8 of 26** scss-importing files still mix | substantially better; migration is progressing |
| A-01/A-02 | tokens unchanged | live — `#A1A1AA` / `#71717A` / `#1D4ED8` at `globals.css:35,36,7` | none |
| A-03 | toast container bare | live — `toast.context.tsx:31`, no `role`/`aria-live` | none |
| A-08 | "**no skip link exists**" in admin | **stale** — skip link present at `(dashboard)/layout.tsx:40` | half the finding is already fixed; the `<nav>` at `sidebar.tsx:54` still has no `aria-label` |
| A-09 | admin omits global `*:focus-visible` | live — zero matches in admin `globals.css` | none |
| W-19 | `sandbox="allow-scripts allow-same-origin"` | **worse** — `TrackingModal.tsx:161` also carries `allow-forms` | broader than documented |
| S-01/S-02/S-06 | server P0/P1s | all still live | `arb-remediation` landed tests only; no fixes yet |

The audit's file path for the admin sidebar (`sidebar.tsx`) is also wrong — the file is at `apps/admin/src/components/layout/sidebar.tsx`.

**Implication for Plan:** the register cannot be executed as written. Every item needs a re-verify step before its fix, and `W-12`'s effort estimate should be revised down.

## Goals

Close the audit findings that `arb-remediation` does not own, sequenced so the cheap high-impact fixes ship first and the structural work is gated behind a safety net.

1. Frontend security defects that are exploitable today (`W-01`, `W-02`, `W-18`, `W-19`).
2. The accessibility register (`A-01`–`A-12`), graded to **AAA 7:1** for contrast per the Q3 answer, AA elsewhere, plus AAA `2.3.3` (motion).
3. Server-side findings outside the money paths that `arb-remediation` left unowned (`S-02`, `S-06`, `S-07`, `S-08`, `S-17`, `S-19`, `S-20`, and the admin role check).
4. Frontend correctness defects clustered in checkout and the contexts (`W-03`–`W-07`, `W-13`–`W-17`).
5. The structural fix: `shared/` becomes a real workspace package (`W-11`), then a single data layer (`W-08`–`W-10`, `W-12`).

## Non-Goals

- Every finding owned by `arb-remediation`: `S-01`, `S-03`, `S-04`, `S-05`, `S-09`, `S-10`, `S-11`, `S-12`, `S-13`, `S-14`, `S-15`, `S-16`, `S-21`, `S-22`. This chain must not touch payment verification, webhooks, reservations, or refund math.
- The AAA criteria the audit itself argues against adopting (§11): 1.4.8, 2.4.9, 3.3.5, 1.2.6, 3.1.5.
- Breadcrumbs (`2.4.8`) — recommended by the audit but a product/IA decision, not remediation.
- Performance profiling, CSP design, dependency audit, deployment/infra — all listed as out of scope by the audit itself (§5, §10, §15).
- Runtime accessibility verification (screen-reader pass, 320px reflow) is **planned but not performed** by this chain's Build phase; it is a Test-phase item requiring a real browser and a human.

## User Impact

- **Shoppers using assistive tech:** login and registration errors become audible for the first time; the tracking modal becomes keyboard-operable; table headers and placeholders become readable.
- **All shoppers:** the checkout stops hammering the API continuously (`W-03`), the pay button stops re-enabling mid-payment (`W-04`), and add-to-cart stops silently reporting success when validation failed (`W-14`).
- **The business:** the open image proxy stops serving attacker-supplied content from the origin and CDN; the post-login open redirect stops being a ready-made phishing landing.

## Success Metrics

- `/_next/image` refuses a URL on a host not in the allowlist, in both apps.
- `?redirect=https://evil.com` and `?redirect=//evil.com` both land on `/account`.
- Every computed contrast ratio for text tokens meets the agreed bar (AA 4.5:1 or AAA 7:1 per Q3) on **all three** surface levels, not just the page background.
- A toast raised by a failed login is announced by VoiceOver.
- Tracking modal is fully operable and dismissable with the mouse unplugged.
- No `fetch(` outside the API module, enforced by lint.

## Constraints

- **`arb-remediation` is mid-Build and blocked on B1.** It has uncommitted work on this branch (`server/src/index.ts`, `server/package.json`, `server/tests/`, `.github/`). This chain cannot cut a branch or stage anything until B1 is settled — see Q1.
- Protected paths: `server/prisma/schema.prisma` and `server/src/routes/webhook.routes.ts`. Nothing in this chain's scope requires either; if Plan finds otherwise it must stop.
- `S-19` (boot-time env assertion) overlaps `arb-remediation`'s `R1` fail-closed work. Ownership must be assigned once, not implemented twice — see Q1.
- Branch policy: non-default branch, PR to the agreed base.
- The audit's own caveat stands: nothing in it was reproduced at runtime. `S-16`-class findings that depend on production env config remain **[unverified]** and this chain must not claim otherwise.

## Risks

- **Brand colour change.** `A-01` recommends darkening `--brand-primary` to `#1E40AF`. That is a visual identity decision, not a technical one, and it changes every button and link in the storefront. Blocking — see Q3.
- **Collapsing the text scale.** At 7:1 the three-tier text scale converges to two. If AAA is chosen, hierarchy must move to weight and size, which is a design change across many components.
- **RTK Query is an innovation token.** The audit recommends it (§8) but explicitly offers SWR — already installed, already configured — as the 6/10 answer for a third of the effort. Wrong choice here is expensive to unwind. Blocking — see Q2.
- **Sequencing collision.** Audit §14 warns that `A-03`, `A-05`, and `A-08` touch code that the `shared/` package move relocates. Doing them *during* the move creates conflicts for no reason. Plan must order these deliberately.
- **No frontend tests exist.** `arb-remediation` landed a server harness only. Rewriting checkout state (`W-04`–`W-07`) without frontend tests is the failure mode the audit names twice (§8 Step 5, §16.6).

## Requirement Manifest

### Explicit (R)

- **R1 — Frontend security quick tier (`W-01`, `W-02`, `W-18`, `W-19`).**
  Allowlist image hosts in both `next.config.js`; reject non-same-origin login redirects including protocol-relative; `encodeURIComponent` the AWB; drop `allow-same-origin` (and re-assess `allow-forms`) from the tracking iframe.
  Acceptance: a request to `/_next/image` for an off-allowlist host returns non-200 in both apps; `?redirect=https://evil.com` and `?redirect=//evil.com` both resolve to `/account`; an AWB containing `&` and `#` reaches the courier URL encoded; the iframe `sandbox` attribute no longer contains `allow-same-origin`.

- **R2 — Accessibility AA tier (`A-01`–`A-09`, `A-12`).**
  Contrast tokens; badge colours and size floor; toast live region in `shared/` so both apps get it; TrackingModal and the three admin modals routed through the existing `UIPrimitives` Modal; `aria-describedby` on field errors; sidebar `<nav>` label; admin global `*:focus-visible`; touch targets.
  Acceptance: computed ratio for every text and badge token meets the Q3 bar on `--surface-0/1/2`; toast container carries `role="status"` + `aria-live` in both apps; each converted modal has `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape-to-close, focus trap and restore; every field error has an `id` referenced by its input's `aria-describedby`; wishlist toggle and `Button --sm` icon-only present a ≥44×44 hit area.

- **R3 — Accessibility structural tier (`A-10`, `A-11`).**
  Heading order on the products page; blanket `prefers-reduced-motion: reduce` rule per app to cover the Tailwind animations the SCSS `motion` mixin cannot reach.
  Acceptance: products-page outline has no h1→h3 jump; with reduced motion requested, no Tailwind-declared transition or keyframe animation runs.

- **R4 — Server findings outside the `arb-remediation` scope (`S-02`, `S-06`, `S-07`, `S-08`, `S-17`, `S-20`, admin role check).**
  `S-19` was removed from this requirement at the brief-review checkpoint — see Q1(c). It is owned by `arb-remediation`'s `R1`.
  `ZodError` → 400 branch; pin JWT algorithm and issuer; multer `fileFilter` with magic-byte validation and safe `/uploads` serving; replace both hand-rolled cookie parsers with `cookie-parser`; collapse `optionalAuth` into `authenticate` behind a flag; rate-limit the webhook route; admin `checkAuth` and layout guard both test `role === 'ADMIN'`.
  Acceptance: a malformed body returns 400 with field errors, not 500; a token signed with a different algorithm is rejected; a non-image upload is refused and a `.svg`/`.html` cannot be served inline from `/uploads`; a request carrying a malformed `%` cookie does not 500; a CUSTOMER-role cookie loading `/dashboard` is redirected, not rendered.

- **R5 — Frontend correctness defects (`W-03`–`W-07`, `W-13`–`W-17`).**
  Stable dep key for the checkout and cart effects; ref-guarded pay handler held until the Razorpay callback settles; `freshSubtotal` as the single source for summary and coupon call; memoize every context value and callback, `showToast` first; keyed snapshot invalidation; `addItem` typed `Promise<boolean>` with callers branching; single auth-transition cart effect; toast timeout cleanup; derived searchParams read on the products page.
  Acceptance: the checkout page issues a bounded number of `validate-checkout` and `coupons/available` requests on load, not a continuous stream; a second pay click while the Razorpay modal is open creates no second order; the coupon call and the displayed summary use the same subtotal; a failed add-to-cart surfaces failure in the UI; no context value is a fresh object literal per render.

- **R6 — Structural: `shared/` as a real workspace package, then an RTK Query data layer (`W-08`–`W-12`).**
  `@ecom/shared` in the workspaces list; the four relative-path escapes and the duplicate `User`/`CartProduct` declarations deleted; Theme and Toast providers moved in. Then, per Q2: one `createApi` with a single `/api/v1` `baseQuery` in `@ecom/shared`, consumed by both apps; RTK slices for genuine client state only (ui, toast, guestCart, checkout wizard); `ErrorBoundary` per app root with loading/error/empty as three distinct branches; lint rules banning `fetch(` outside the API module and Tailwind utilities in `.scss`-importing files. `W-13` is closed by tag invalidation rather than patched.
  Acceptance: `npm ls @ecom/shared` resolves in both apps; zero `../../../../../../shared/` imports; exactly one `baseQuery` definition and it sets `credentials: 'include'`; both apps read the same `createApi`; the two lint rules fail a deliberately-violating fixture; `checkout/page.tsx` renders a distinguishable error state when the addresses query fails; refreshing one product's data does not invalidate every other product's cache.

### Implicit (RI)

- **RI1 — No collision with `arb-remediation`.** This chain touches no file that chain owns, and `S-19` is implemented exactly once.
  Acceptance: Plan records a file-ownership split; Review diffs the two chains' touched sets and finds them disjoint.
- **RI2 — Branch and PR policy.** Non-default branch, PR using the user's template, base per Q1.
  Acceptance: PR exists against the agreed base; no direct push to `main`.
- **RI3 — Findings re-verified before fixing.** Given the staleness documented above, each finding is confirmed live immediately before its fix.
  Acceptance: the task artifact records a current-state check per finding ID; already-fixed items are closed as no-op with evidence.
- **RI4 — Evidence policy.** Every completion claim carries command output or an artifact citation; runtime-only claims (screen reader, reflow) are marked unproven until a human runs them.
  Acceptance: verify artifact cites runs; no accessibility claim rests on static reading alone where the audit says it cannot.
- **RI5 — No secrets in artifacts.** Env var names only.
  Acceptance: artifacts contain no values, connection strings, or keys.

### Assumptions (A)

- **A1** — The audit document is the finding source of truth for this chain; no re-audit, but per RI3 every item is re-verified before its fix.
- **A2** — The `UIPrimitives` Modal is correct as the audit describes (focus trap, Escape, restore) and is a suitable target for the four modal conversions. Plan verifies before committing R2 to it.
- **A3** — `shared/` has no runtime dependency that blocks it from becoming a workspace package. Plan verifies.
- **A4** — Frontend test tooling does not exist yet; R5 and R6 will need it, and the audit gates checkout work behind it. Plan decides whether this chain introduces it or depends on a prior one.

### Open Questions (Q)

- **Q1 — Relationship to `arb-remediation`, and the base branch. ANSWERED 2026-07-20: run in parallel on a separate branch.**
  Sub-parts (b) and (c) were not separately answered and are resolved by determination, recorded as decisions rather than left open:
  - **(b) Base branch — `feat/homepage-redesign`.** Rationale: `arb-remediation`'s B1 established that `main` lacks the RMA subsystem, `OrderAuditLog`, and the logistics webhook. Every finding in this brief's re-verification table was confirmed against `arb-remediation`, which is cut from `feat/homepage-redesign`. Basing on `main` would mean fixing findings against a tree where several of the referenced files (`TrackingModal`, `OrderDetailsPage`) differ or are absent. Plan must re-confirm this before cutting the branch; if the user settles B1 the other way (merge `feat/homepage-redesign` into `main` first), this chain rebases with no dependency on branch history.
  - **(c) `S-19` owner — `arb-remediation`.** Its `R1` already requires the server to fail closed on missing Razorpay keys, which is the same boot-time env assertion. This chain drops `S-19` from `R4` and depends on it. The one piece `S-19` covers that `arb-remediation`'s `R1` does not — the `next.config.js` wildcard — is already this chain's `W-01` under `R1`.
  Owner: user. Blocking: resolved.

- **Q2 — RTK Query or SWR for the data layer (`R6`). ANSWERED 2026-07-20: RTK Query.**
  User selected RTK Query over the brief's SWR recommendation. Plan proceeds on the audit's §8 design: one `createApi` with a single `baseQuery` living in `@ecom/shared`, consumed by both apps; RTK slices for genuine client state only (ui, toast, guestCart, checkout wizard); local `useState` for what a reload should discard. Consequences Plan must carry: `R6` grows to the ~600-line / ~1-day-with-CC estimate, `W-13`'s snapshot invalidation is replaced by tag invalidation rather than patched, and the migration follows the audit's strangler-fig steps — store + products endpoint first to prove the pattern, cart and checkout last and only behind tests.
  Owner: user. Blocking: resolved.

- **Q3 — AA or AAA, and the brand colour. ANSWERED 2026-07-20: AAA (7:1), brand change approved.**
  Ship the audit's full §12.1 palette: light `--text-secondary`/`--text-tertiary` → `#52525B`, `--brand-primary` → `#1E40AF`; dark `secondary`/`tertiary` → `#B4B4BC`, `brand` → `#7CB0FB`. The three-tier text scale collapses to two — `--text-tertiary` keeps its name and points at the secondary value so nothing breaks, and hierarchy moves to weight and size. Plan must treat that as a design task across the components that relied on tertiary for contrast-based hierarchy, not just a token edit. Also adopt `2.3.3` (blanket reduced-motion, already `R3`). `2.4.8` breadcrumbs remain a non-goal.
  Owner: user. Blocking: resolved.

- **Q4 — Does this chain introduce frontend test tooling?**
  The audit gates checkout state work behind tests. `arb-remediation` landed a server harness only.
  Owner: user. Blocking: no — Plan defaults to introducing Vitest + Testing Library scoped to the checkout and context work in R5, and says so.

- **Q5 — Scope size.** R1–R4 are roughly one focused week and close every cheap exploitable defect. R5 and R6 are multi-week structural work.
  Owner: user. Blocking: no — Plan defaults to sequencing all six with R5/R6 as separately-shippable later phases, so scope can be cut at a phase boundary without rework.

## Questions For User

Q1–Q3 answered at the brief-review checkpoint, 2026-07-20 (recorded in the manifest above). Outstanding, non-blocking, with the defaults Plan applies:

1. **(Q4)** Frontend test tooling — Plan introduces Vitest + Testing Library scoped to the checkout and context work in `R5`. The audit gates checkout state changes behind tests and `R6`'s RTK Query migration reaches cart and checkout, so this is now a prerequisite rather than a nicety.
2. **(Q5)** Scope — Plan sequences all six requirements with `R5` and `R6` as separately-shippable later phases, so scope can be cut at a phase boundary without rework.

One item Plan must re-confirm rather than assume: the `feat/homepage-redesign` base recorded under Q1(b). If `arb-remediation`'s B1 resolves toward `main`, both chains rebase together.

## Architecture Notes

- role: Architect
- decision: scoped this chain as the complement of `arb-remediation` rather than a re-plan of the whole audit. That chain's brief already declares this work deferred, so the split follows an existing, user-approved boundary rather than inventing one.
- decision: re-verified a sample of findings before scoping rather than trusting the register. This surfaced four deltas — `A-08` half-fixed, `W-12` far better than documented, `W-08` overstated, `W-19` worse — which is enough drift to make RI3 a requirement rather than a nicety.
- decision: `R6` (`shared/` as a package) is stated as the structural fix but sequenced last, because it is the one item with no user-visible payoff and the highest conflict surface. The audit's §16.4 argues it prevents the list regenerating; that is a real argument for doing it, not for doing it first.
- constraint: `arb-remediation` holds uncommitted work in this working tree. Nothing here can be branched or staged until Q1 resolves. This is the hard gate.
- constraint: `S-19` sits in both chains' natural scope. Assigning it once is cheaper than merging two implementations of a boot-time assertion.
- tradeoff considered and rejected: folding this into `arb-remediation` as a scope expansion. Rejected — that chain is mid-Build with a passing Phase 1 gate, and widening it would invalidate its phase plan and its manifest numbering.
- tradeoff considered and rejected: shipping `R1` immediately as a Trivial hotfix outside the lifecycle. Tempting — it is genuinely ~20 minutes and the audit says ship it this week. Rejected only because the working tree is not clean; the moment Q1 resolves, `R1` should be the first PR and it should not wait for the rest of the plan.
- assumption for Plan to verify: A2 (the shared Modal is a sound conversion target), A3 (`shared/` can become a package without a runtime blocker), and whether frontend test tooling is a prerequisite for R5 or can trail it.
- downstream: Plan must produce a file-ownership split against `arb-remediation` before sequencing anything; order `A-03`/`A-05`/`A-08` either wholly before or wholly after the `shared/` move, never during; and treat runtime a11y verification as a Test-phase item needing a human, not a Build-phase claim.
- decision (post-checkpoint): **RTK Query adopted over the SWR recommendation in this brief** (Q2). The user's call, and it changes `R6` from a ~200-line cleanup to the audit's §8 architecture. Plan should treat `R6` as its own multi-phase workstream on the strangler-fig sequence — package foundation, then store + products endpoint to prove the pattern, then reads, then cart/checkout last behind `R5`'s tests. The upside the brief undersold: one `createApi` in `@ecom/shared` is what makes `W-10`'s provider drift structurally impossible rather than merely fixed once.
- decision (post-checkpoint): **AAA (7:1) adopted with the brand change** (Q3). This makes `A-01` larger than the register's "30 min, token change, no component edits" estimate. Collapsing tertiary into secondary removes a contrast-based hierarchy level that components currently rely on, so Plan must budget a design pass over the components using `--text-tertiary` to re-establish hierarchy through weight and size. The token edit is 30 minutes; the visual consequence is not.
- decision (post-checkpoint): `S-19` assigned to `arb-remediation`, base branch determined as `feat/homepage-redesign` pending Plan's re-confirmation (Q1 b/c). Both are determinations, not user answers — Plan owns verifying them.

## Exit Gate

- [x] Goal, scope, and non-goals are concrete, with the boundary against `arb-remediation` stated finding-by-finding.
- [x] Every active R and RI has testable acceptance criteria.
- [x] Findings re-verified against the current branch; drift documented.
- [x] Blocking Q IDs resolved — Q1, Q2, Q3 answered at brief-review checkpoint 2026-07-20; `orchestration.blockers` empty.
- [x] User approved: parallel chain on a separate branch, RTK Query for the data layer, AAA contrast including the `--brand-primary` change.
- [x] Architecture notes capture decisions, constraints, rejected tradeoffs, and downstream impact.
