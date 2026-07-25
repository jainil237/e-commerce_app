---
slug: frontend-security-a11y
version: 1
artifact: plan
status: draft
created: 2026-07-20
updated: 2026-07-20
manifest_ids: [R1, R2, R3, R4, R5, R6, RI1, RI2, RI3, RI4, RI5]
upstream:
  brief: workflow/artifacts/briefs/frontend-security-a11y-v1.md
related_chains:
  - slug: arb-remediation
    relationship: parallel — disjoint file ownership, see §File Ownership Split
orchestration:
  phase: plan
  status: ready-for-next-phase
  next_phase: build
  blockers: []
  user_checkpoint: plan-review
---

# Frontend Security, Correctness & Accessibility Remediation — Plan

## Summary

Eight phases, ordered so the cheapest exploitable defects close first and the structural work lands last behind a test net. Phase 1 is a ~30-minute security PR that should not wait for the rest of this plan. Phases 3–4 take accessibility to the AAA contrast bar approved at brief review, and are deliberately sequenced **before** the `shared/` package move so the toast, modal, and layout fixes migrate with the code rather than conflicting with it. Phase 5 introduces frontend test tooling, which the audit makes a hard prerequisite for touching checkout state. Phases 6–7 are the RTK Query architecture. Shipped as stacked PRs so a regression in one does not block the others.

## Inputs

- Approved brief: `workflow/artifacts/briefs/frontend-security-a11y-v1.md` — Q1–Q3 answered at the 2026-07-20 checkpoint; Q4/Q5 resolved by the defaults recorded there.
- Findings source: `docs/product/architecture-audit-and-refactor-plan.md`, Part IV register (`S-*`, `W-*`, `A-*`).
- `workflow/config/verification.yaml` — configured commands: `npm run build` (required, phases build+ship), `npm run lint` (optional), `npm run db:migrate` (optional, not applicable to this chain).
- `workflow/config/repo-profile.yaml` — **`shared/types/**` is a protected path** (see B2); `server/src/routes/**` is a public contract; `test_roots: []`; generated outputs `apps/{web,admin}/.next`.
- `workflow/config/release.yaml` — PR gate required, CI provider `none`, deploy targets vercel (web, admin) + cloud-server (server).
- Repo inspection, this branch, recorded in the brief's re-verification table: `W-01` `W-02` `A-01` `A-02` `A-03` `A-09` `W-19` live; `A-08` half-fixed (skip link exists at `(dashboard)/layout.tsx:40`); `W-12` 8-of-26 not 29; `W-08` 32 raw `fetch(` sites not ~50; admin sidebar is at `apps/admin/src/components/layout/sidebar.tsx`, not the path the audit cites.
- Repo inspection: `package.json:5-8` — workspaces are `apps/*` and `server`; `shared` is absent, confirming `W-11`.
- Repo inspection: `git status` — working tree carries `arb-remediation`'s uncommitted Phase 1 work (`server/src/index.ts`, `server/package.json`, `server/tests/`, `.github/`, `docker-compose.test.yml`).

## Requirement Coverage

| Manifest ID | Covered by phases | Notes |
|---|---|---|
| R1 Frontend security quick tier | **P1 (owns)** | `W-01` `W-02` `W-18` `W-19` — ships first, independently |
| R2 Accessibility AA/AAA tier | P3, **P4 (owns)** | Tokens+live regions in P3; modals/focus/targets in P4 |
| R3 Accessibility structural | **P4 (owns)** | `A-10` heading order, `A-11` blanket reduced-motion |
| R4 Server findings outside arb scope | **P2 (owns)** | `S-19` removed — owned by `arb-remediation` per brief Q1(c) |
| R5 Frontend correctness defects | **P5 (owns)**, P7 | Test tooling lands here; `W-04`–`W-07` fixed here, cart/checkout re-verified in P7 |
| R6 Package + RTK Query data layer | P6, **P7 (owns)** | P6 is the package foundation (behavior-neutral); P7 is the data layer |
| RI1 No collision with arb-remediation | P0, all phases, **P8 (owns)** | Ownership split fixed at P0; diffed at P8 |
| RI2 Branch and PR policy | P0, **P8 (owns)** | Base confirmed at P0; PRs at P8 |
| RI3 Findings re-verified before fixing | every phase, **P8 (owns)** | Each phase opens with a current-state check |
| RI4 Evidence policy | every phase, **P8 (owns)** | Runtime-only a11y claims marked unproven until P8 manual QA |
| RI5 No secrets in artifacts | every phase | Env var names only |

## File Ownership Split (RI1)

`arb-remediation` runs in parallel on its own branch. The two chains must not touch the same files.

| Owner | Files |
|---|---|
| **arb-remediation** | `server/src/routes/order.routes.ts`, `webhook.routes.ts`, `cart.routes.ts`, `server/src/services/**`, `server/src/jobs/**`, `server/prisma/schema.prisma`, `server/tests/**`, `docker-compose.test.yml`, `server/src/index.ts` (env/boot + `express.raw` mount) |
| **this chain** | `apps/web/**`, `apps/admin/**`, `shared/**`, both `next.config.js`, `server/src/middleware/error.middleware.ts`, `server/src/middleware/auth.middleware.ts`, `server/src/routes/admin.routes.ts` (multer only), root `package.json` (workspaces) |
| **contested — resolved** | `server/src/index.ts`: arb owns the boot/env/raw-body changes; this chain needs only the webhook rate limiter (`S-20`, one line at `:121`) and the `cookie-parser` swap (`S-08`, `:36-52`). **Both deferred into P2 and applied last, after arb's Phase 2 merges**, to avoid a conflict in a file arb is actively editing. If arb has not merged when P2 runs, `S-08` and `S-20` slip to P8 as a follow-up PR. |
| **contested — resolved** | `.github/workflows/ci.yml`: arb creates it. This chain **appends** frontend jobs in P5 rather than authoring the file, and does so only after arb's file exists. If it does not exist at P5, this chain creates it with frontend jobs only and arb merges its server jobs in. |

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `apps/web/next.config.js`, `apps/admin/next.config.js` | modify | R1 | `W-01` — replace `hostname: '**'` with an allowlist |
| `apps/web/src/app/account/login/page.tsx` | modify | R1 | `W-02` — same-origin redirect guard incl. `//` |
| `apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx` | modify | R1, R2 | `W-18` encode AWB, `W-19` drop `allow-same-origin` (and re-assess `allow-forms`, present but undocumented); `A-04` route through shared Modal |
| `server/src/middleware/error.middleware.ts` | modify | R4 | `S-02` — ZodError → 400 branch |
| `server/src/middleware/auth.middleware.ts` | modify | R4 | `S-06` pin algorithm/issuer; `S-17` collapse `optionalAuth`; drop the duplicate cookie parser with `S-08` |
| `server/src/routes/admin.routes.ts` | modify | R4 | `S-07` multer `fileFilter` + magic bytes. **Public contract** — upload rejection is a client-visible behavior change |
| `server/src/index.ts` | modify | R4 | `S-08` `cookie-parser`, `S-20` webhook rate limit. **Contested file — see split above** |
| `apps/admin/src/components/providers.tsx` | modify | R4, R2, R6 | Admin role check on `checkAuth`; `W-10` toast-id drift; provider removal in P6 |
| `apps/admin/src/app/(dashboard)/layout.tsx` | modify | R4, R2 | Layout guard tests role; `A-08` skip link **already present** — verify only |
| `apps/web/src/app/globals.css`, `apps/admin/src/app/globals.css` | modify | R2, R3 | `A-01` AAA tokens, `A-02` badges + size floor, `A-09` admin `*:focus-visible`, `A-11` blanket reduced-motion |
| `apps/web/src/contexts/toast.context.tsx` | modify | R2, R5 | `A-03` live region, `W-17` timeout cleanup, `W-06` `useCallback` |
| `shared/components/UIPrimitives.tsx` | read, then modify | R2 | Conversion target for 4 modals (verify A2 first); toast/theme land beside it in P6 |
| `apps/admin/src/app/(dashboard)/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx` | modify | R2 | `A-05` three modals → shared Modal |
| `apps/admin/src/components/layout/sidebar.tsx` | modify | R2 | `A-08` `aria-label="Main"` — corrected path |
| `apps/web/src/components/atoms/Input/Input.tsx`, `Select.tsx` | modify | R2 | `A-06` `aria-describedby` |
| `apps/web/src/**/*.scss` (product-card, button, topbar) | modify | R2 | `A-07` 44px hit areas |
| `apps/web/src/app/products/products-client.tsx` | modify | R2, R5 | `A-10` heading order; `W-16` derived searchParams read |
| `apps/web/src/app/checkout/page.tsx`, `cart/page.tsx` | modify | R5 | `W-03`–`W-05`, `W-07`. **Gated behind P5 test tooling** |
| `apps/web/src/contexts/{cart,auth,wishlist,theme}.context.tsx` | modify | R5 | `W-06` memoization, `W-14` `Promise<boolean>`, `W-15` cart effect merge |
| `apps/web/src/lib/inventory-snapshot.ts` | delete or modify | R5, R6 | `W-13` — replaced by RTK Query tag invalidation in P7 |
| `package.json` (root) | modify | R6 | `W-11` add `shared` to workspaces |
| `shared/package.json` | create | R6 | `@ecom/shared` |
| `shared/types/index.ts` | modify | R6 | **PROTECTED PATH — see B2.** Derive from Prisma; delete duplicate `User`/`CartProduct` |
| `shared/state/**`, `shared/api/**` | create | R6 | RTK store, `createApi`, slices |
| `apps/web/src/components/providers.tsx` | modify | R6 | Replace SWR global config with RTK provider |
| `apps/web/vitest.config.ts`, `apps/web/src/**/*.test.tsx` | create | R5 | New — `test_roots` is empty |
| `.eslintrc` / flat config, both apps | modify | R6 | Lint rules: no `fetch(` outside api module; no Tailwind in `.scss`-importing files |
| `.github/workflows/ci.yml` | modify | R5 | Append frontend jobs — see ownership split |

## Source-of-Truth Strategy

`docs/product/architecture-audit-and-refactor-plan.md` is the finding source and is **read-only** in this chain. No external tracker is configured (`source-of-truth.yaml` names none), so no ticket sync is attempted.

Two documentation update targets, both owned by P8:
- `.claude/CLAUDE.md` — its styling rule ("do not mix Tailwind and BEM") is currently unenforced; P6's lint rule makes it true. Its `shared/` description ("not a workspace package — apps import via relative paths") becomes false at P6 and must be corrected.
- The audit document itself is **not** edited. The re-verification deltas (`A-08`, `W-12`, `W-08`, `W-19`, the sidebar path) are recorded in this chain's brief and task artifacts, not by rewriting the source.

## Approach

Three ordering constraints drive the sequence, and each comes from evidence rather than preference.

**Security first, and unbundled.** `R1` is four edits across three files with no dependency on anything else in this plan. The audit says ship it this week; bundling it behind eight phases of structural work would be the plan actively making things worse. It ships as its own PR.

**Accessibility before the package move, not during.** Audit §14 warns that `A-03`, `A-05`, and `A-08` touch code that the `shared/` migration relocates, and that doing them during the move means resolving conflicts for no reason. P3 and P4 therefore complete all accessibility work before P6 touches the directory structure; the fixes migrate as content.

**Tests before checkout.** The audit gates checkout state changes behind tests twice (§8 Step 5, §16.6), and `arb-remediation`'s harness covers the server only. P5 introduces Vitest + Testing Library and writes the checkout state tests *before* `W-04`–`W-07` change behavior, so each fix is failing-then-passing.

The AAA decision (Q3) has a consequence worth stating in the plan rather than discovering in Build: collapsing `--text-tertiary` into `--text-secondary` removes a hierarchy level that components currently use. The token edit is 30 minutes; re-establishing that hierarchy through weight and size across the consuming components is the real work, and P3's exit gate covers both.

## Phases

### Phase 0 — Branch setup and ownership fix

- Manifest IDs: RI1, RI2
- Touches: none (git only)
- Work: confirm the `feat/homepage-redesign` base determination from brief Q1(b) by checking that the files this chain edits exist there and match the re-verification table; cut `frontend-security-a11y` from it; confirm `arb-remediation`'s uncommitted work is on its own branch and not carried in.
- Exit gate: `git rev-parse --abbrev-ref HEAD` returns `frontend-security-a11y`; `git status --porcelain` shows no file from the arb-remediation ownership column; `git merge-base --is-ancestor feat/homepage-redesign HEAD` exits 0.

### Phase 1 — Frontend security quick tier

- Manifest IDs: R1 (owns), RI3
- Touches: both `next.config.js`, `login/page.tsx`, `TrackingModal.tsx`
- Work: `W-01` allowlist image hosts (`res.cloudinary.com` plus the R2 public host — read from config, not hardcoded, and if the R2 host cannot be determined from `Store.config.json` or env var *names*, record it as an open item rather than guessing); `W-02` reject redirects not matching `^/(?!/)`; `W-18` `encodeURIComponent` the AWB; `W-19` drop `allow-same-origin`, and drop `allow-forms` unless a courier page is shown to need it.
- Exit gate: `npm run build` exits 0; a test asserts `?redirect=https://evil.com` and `?redirect=//evil.com` both resolve to `/account`; `grep -c "hostname: '\*\*'" apps/*/next.config.js` returns 0; `grep -c "allow-same-origin" TrackingModal.tsx` returns 0.

### Phase 2 — Server findings outside the arb-remediation scope

- Manifest IDs: R4 (owns), RI3
- Touches: `error.middleware.ts`, `auth.middleware.ts`, `admin.routes.ts`, `admin/providers.tsx`, `(dashboard)/layout.tsx`, and — last, conditionally — `server/src/index.ts`
- Work: `S-02` ZodError → 400 with `err.flatten().fieldErrors`; `S-06` pin `algorithms: ['HS256']` and issuer; `S-07` multer `fileFilter` allowlisting image MIME types with magic-byte validation, plus `Content-Disposition: attachment` on `/uploads`; `S-17` one `authenticate` implementation behind a flag; admin role check on both `checkAuth` and the layout guard. Then, only if `arb-remediation`'s Phase 2 has merged: `S-08` `cookie-parser` (removing both hand-rolled parsers) and `S-20` webhook rate limit.
- Exit gate: `npm run build` exits 0; a request with a malformed body returns 400 with field errors, not 500 (manual QA or test, recorded); a token signed HS512 is rejected; a `.svg` upload is refused; a CUSTOMER-role session loading `/dashboard` does not render the admin shell. `S-08`/`S-20` either done with `grep -c "cookie-parser" server/src/index.ts` returning 1, or explicitly deferred to P8 with the reason recorded.

### Phase 3 — Accessibility: contrast tokens and live regions

- Manifest IDs: R2, RI3
- Touches: both `globals.css`, `toast.context.tsx`, `admin/providers.tsx`, plus components consuming `--text-tertiary`
- Work: ship the audit §12.1 AAA palette (light `secondary`/`tertiary` `#52525B`, `brand` `#1E40AF`; dark `#B4B4BC` / `#7CB0FB`), keeping the `--text-tertiary` name pointed at the secondary value; re-establish the lost third hierarchy tier through font weight and size in the components that relied on it; `A-02` badge colours to the AAA values plus 10px → 12px; `A-03` `role="status" aria-live="polite" aria-atomic="true"` on both toast containers, `assertive` for the error variant.
- Exit gate: a script computing WCAG relative-luminance ratios for every text and badge token against `--surface-0/1/2` reports ≥7:1 for text and ≥4.5:1 for badges in both themes, and its output is recorded in the task artifact; `grep -c 'aria-live' ` returns ≥1 in both toast containers; `npm run build` exits 0.

### Phase 4 — Accessibility: semantics, focus, targets, motion

- Manifest IDs: R2 (owns), R3 (owns), RI3
- Touches: `TrackingModal.tsx`, three admin modal sites, `OrderDetailsPage.tsx`, `Input.tsx`, `Select.tsx`, `sidebar.tsx`, admin `globals.css`, `product-card.scss`, `button.scss`, `products-client.tsx`
- Work: first verify brief assumption A2 by reading `UIPrimitives.tsx` and confirming the Modal has the focus trap, Escape, and restore the audit describes; then route `A-04` TrackingModal and `A-05`'s three admin modals through it, adding `htmlFor`/`id` on TrackingModal's two fields; `A-06` `aria-describedby`; `A-08` sidebar `aria-label="Main"` (**skip link already exists — verify, do not re-add**); `A-09` port web's `*:focus-visible` into admin and replace border-colour-only focus treatments with the `focus-ring` mixin; `A-07` 44px hit areas; `A-10` heading order; `A-11` blanket reduced-motion rule per app; `A-12` move `aria-label="Main navigation"` onto the `<nav>`.
- Exit gate: `npm run build` exits 0; every converted modal renders `role="dialog"`, `aria-modal`, and an `aria-labelledby` resolving to a present `id`; each closes on Escape (manual QA, recorded per `manual_qa` required fields); `grep -c 'prefers-reduced-motion: reduce'` returns ≥1 per app `globals.css`; zero `<label>` without `htmlFor` in the touched files.

### Phase 5 — Frontend test tooling and correctness defects

- Manifest IDs: R5 (owns), RI3
- Touches: `apps/web/vitest.config.ts` + tests (new), `checkout/page.tsx`, `cart/page.tsx`, all five contexts, `products-client.tsx`, `.github/workflows/ci.yml`
- Work: Vitest + Testing Library in `apps/web`, scoped to checkout state and the contexts; write the failing tests first for `W-03` (bounded request count), `W-04` (no second order on double click), `W-05` (cart cleared on confirmed server state), `W-07` (one subtotal source); then fix. `W-06` memoization with `showToast` `useCallback` **first**, since cart's `addItem`/`updateQuantity` depend on it. Then `W-14` `Promise<boolean>` with callers branching, `W-15` single auth-transition cart effect, `W-16` derived searchParams read, `W-17` timeout cleanup. Append frontend jobs to CI per the ownership split.
- Exit gate: `npx vitest run` in `apps/web` exits 0 with ≥1 test per finding ID `W-03` `W-04` `W-05` `W-07`, each demonstrated failing before its fix and passing after (both recorded); no context value is a fresh object literal per render (assert via a render-count test); `npm run build` exits 0.

### Phase 6 — `shared/` becomes a workspace package

- Manifest IDs: R6, RI3
- Touches: root `package.json`, `shared/package.json` (new), `shared/types/index.ts` (**protected — B2**), the four admin relative-escape imports, `cart/page.tsx`, `checkout/page.tsx`, `auth.context.tsx`, `admin/providers.tsx`
- Work: behavior-neutral by design, per audit §8 Step 1 — this is the "make the change easy" step and lands as its own PR. Add `shared` to workspaces as `@ecom/shared`; move Theme and Toast providers in, parameterized by storage key, and delete admin's copies (closing `W-10`'s toast-id drift structurally); replace the four `../../../../../../shared/` escapes; delete the duplicate `User` and `CartProduct` declarations and derive the shared types from Prisma's generated types.
- **Blocked on B2** — `shared/types/**` is a protected path.
- Exit gate: `npm ls @ecom/shared` resolves in both apps; `grep -rc '\.\./\.\./\.\./\.\./\.\./\.\./shared' apps/` returns 0; exactly one `User` and one `CartProduct` declaration repo-wide; `npm run build` exits 0 and `npx vitest run` still passes with **zero test changes** — the proof that this phase changed no behavior.

### Phase 7 — RTK Query data layer

- Manifest IDs: R6 (owns), R5, RI3
- Touches: `shared/api/**`, `shared/state/**` (new), `apps/web/src/components/providers.tsx`, `admin/providers.tsx`, page components migrated one resource at a time, `inventory-snapshot.ts` (delete), lint config
- Work: strangler fig per audit §8 Steps 3–6. Store + one `createApi` with a single `/api/v1` `baseQuery` (`credentials: 'include'` non-optional) in `@ecom/shared`; migrate **products first** to prove the pattern end to end; then reads (orders, addresses, wishlist, categories, admin dashboard), one resource per commit; cart and checkout **last**, re-verifying P5's tests still pass; RTK slices for client state only (ui, toast, guestCart, checkout wizard); `W-13` closed by tag invalidation and `inventory-snapshot.ts` deleted rather than patched; `ErrorBoundary` per app root with loading/error/empty as three distinct branches (`W-09`); lint rules banning `fetch(` outside the api module and Tailwind utilities in `.scss`-importing files (`W-12`).
- Exit gate: exactly one `baseQuery` definition repo-wide and it sets `credentials: 'include'`; `grep -rc 'fetch(' apps/*/src --include=*.tsx --include=*.ts` returns 0 outside `shared/api/`; both lint rules fail a deliberately-violating fixture and pass the tree; `npx vitest run` exits 0 including P5's checkout tests unmodified; a forced address-fetch failure renders an error state distinguishable from empty (manual QA, recorded); `npm run build` exits 0.

### Phase 8 — Review, verify, ship

- Manifest IDs: RI1 (owns), RI2 (owns), RI3 (owns), RI4 (owns), R5
- Touches: `.claude/CLAUDE.md`, PR bodies
- Work: diff this chain's touched files against the `arb-remediation` ownership column and confirm disjoint; run the manual QA the audit says static analysis cannot cover — keyboard pass on checkout with the mouse unplugged, VoiceOver on login → PDP → cart → checkout re-verifying the `A-03` fix, 320px reflow on PLP/PDP/cart and the admin tables; correct `.claude/CLAUDE.md`'s now-false `shared/` and styling statements; open the stacked PRs using the user's template.
- Exit gate: `npm run build` and `npm run lint` both exit 0 at repo root; the file-ownership diff is empty; all five manual QA scenarios recorded with the `manual_qa` required fields and an explicit pass/fail (a fail here blocks ship, it does not get waived silently); PR URLs exist for each stacked PR; `.claude/CLAUDE.md` contains no statement contradicted by this chain.

## Branch and Commit Strategy

- Base: `feat/homepage-redesign` (brief Q1(b) determination, re-confirmed at P0). If `arb-remediation`'s B1 resolves toward `main`, both chains rebase together — nothing in this plan depends on branch history.
- Branch: `frontend-security-a11y`, cut at P0. Never commit to `main` (`repo-profile.yaml` requires a non-default branch).
- Stacked PRs, in phase order: **PR-1** security (P1) — opened immediately and not held for the rest; **PR-2** server hardening (P2); **PR-3** accessibility (P3+P4); **PR-4** tests + correctness (P5); **PR-5** package foundation (P6); **PR-6** RTK Query (P7).
- `preserve_unrelated_changes: true` — the pre-existing untracked user work in this tree (`.vscode/`, `.rtk/`, the zip, `docs/product/`) is never staged.
- `stage_only_approved_scope: true` — each commit stages only files in that phase's touch list.

## Verification Plan

| Manifest ID | Evidence type | Method | Owning phase |
|---|---|---|---|
| R1 | command + test | `npm run build`; redirect-guard test; greps for the wildcard and `allow-same-origin` | P1 |
| R2 | command + generated-output + manual | contrast-ratio script output recorded; modal attribute greps; Escape-to-close manual QA | P3, P4 |
| R3 | command | heading-order check; `prefers-reduced-motion` grep | P4 |
| R4 | command + manual | `npm run build`; 400-not-500 check; HS512 rejection; `.svg` upload refusal; role-guard walkthrough | P2 |
| R5 | command | `npx vitest run` in `apps/web`, with failing-before/passing-after recorded per finding ID | P5 |
| R6 | command | `npm ls @ecom/shared`; escape-import grep; single-`baseQuery` grep; lint-rule fixtures; unmodified P5 tests still green | P6, P7 |
| RI1 | review | file-ownership diff against the arb column | P8 |
| RI2 | command | `git status`, branch name, PR URLs | P8 |
| RI3 | review | per-finding current-state check recorded in the task artifact | every phase |
| RI4 | review | every gate cites command output; runtime-only claims marked unproven until P8 | P8 |
| RI5 | review | artifact scan for values vs names | every phase |

**Not provable by command, and recorded as such:** screen-reader announcement quality, focus order, and 320px reflow. These are `manual_qa` items owned by P8 and the audit is explicit (§15) that static analysis cannot close them. No phase may claim them from source reading.

**`npm run db:migrate`**: not applicable — this chain makes no schema change.

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|---|
| K1 | `shared/types/**` is protected; P6 requires editing it | certain | blocks P6 | **B2** — approval requested at this checkpoint. P1–P5 proceed regardless | user | R6 |
| K2 | Brand colour change is visible across the whole storefront | certain | high visibility | Approved at brief review (Q3). P3 ships it as its own reviewable commit so it can be reverted independently of the other token changes | user | R2 |
| K3 | Collapsing the text scale removes a hierarchy level components rely on | high | medium | P3's scope explicitly includes re-establishing hierarchy via weight/size, and its exit gate covers the consuming components, not just the tokens | build | R2 |
| K4 | RTK Query is a new concept for this codebase | high | medium | Strangler fig — products first to prove the pattern, one resource per commit, cart/checkout last and only behind P5's tests. Contexts and RTK coexist through P7 | build | R6 |
| K5 | Conflict with `arb-remediation` in `server/src/index.ts` and `ci.yml` | medium | medium | Ownership split above; both contested items deferred to the end of their phase and slippable to P8 | build | RI1 |
| K6 | Base-branch determination (Q1b) is wrong | low | high — rework | P0's exit gate verifies the files exist and match the re-verification table before any edit | build | RI2 |
| K7 | Register staleness beyond the sampled findings | medium | low | RI3 makes a current-state check mandatory per finding; already-fixed items close as no-op with evidence rather than being "fixed" twice | build | RI3 |
| K8 | Multer `fileFilter` rejects uploads real admins currently make | medium | medium | `server/src/routes/**` is a public contract. P2 records the current accepted-type behavior before narrowing it, and the allowlist covers the four formats the audit names | build | R4 |
| K9 | Frontend tests land after `arb-remediation` changes CI | medium | low | P5 appends rather than authors; creates the file only if absent | build | R5 |

## Open Questions

- **B2 — Protected-path approval for `shared/types/**`. ANSWERED 2026-07-20: approved.** P6 and P7 unblocked; the exit-gate bound stated below (build passes and P5's tests are unmodified) still applies and is the control on blast radius.
  `repo-profile.yaml` marks `shared/types/**` protected, reason: "shared TypeScript types consumed by all apps — breaking changes propagate everywhere." `R6` requires editing `shared/types/index.ts` to delete the duplicate `User`/`CartProduct` declarations and derive types from Prisma's generated types — which is precisely a change that propagates everywhere, so the protection is doing its job rather than being a formality. Requesting explicit approval to edit it in P6.
  Note this is exactly the risk the protection names: deriving from Prisma will surface type mismatches wherever the hand-mirrored types have drifted from the schema, and those mismatches are real bugs being exposed rather than introduced. P6's exit gate requires the build to pass and P5's tests to be unmodified, which bounds the blast radius.
  Owner: user. Blocking: P6 and P7 only. **P0–P5 need no further approval and can start immediately.**

## Architecture Notes

- role: Principal Engineer
- decision: `R1` ships as PR-1 and is not held behind the plan. Four edits, three files, no dependencies, and the audit says do it this week. A plan that delays a 30-minute security fix behind eight phases of refactoring has misordered itself.
- decision: accessibility (P3, P4) precedes the `shared/` move (P6), following audit §14's explicit warning. The alternative — package first, then a11y — means the toast and modal fixes get written against a directory layout that is changing underneath them.
- decision: P6 is scoped to be **behavior-neutral**, and its exit gate proves it by requiring P5's tests to pass unmodified. This is the audit's Beck framing (make the change easy, then make the easy change) and it is what makes P7's larger diff reviewable.
- decision: `S-19` was dropped from `R4` and assigned to `arb-remediation` (brief Q1c). Two implementations of one boot-time env assertion is worse than a cross-chain dependency.
- constraint: `shared/types/**` protected → B2. `server/src/routes/**` is a public contract → P2's multer change is client-visible and K8 covers it.
- constraint: CI provider is `none` in `release.yaml`, yet `arb-remediation` has authored `.github/workflows/ci.yml`. This plan treats that file as arb's and appends to it, rather than either chain claiming CI ownership. If the user wants CI declared in config, that is a separate change.
- tradeoff considered and rejected: folding P3 and P4 into one accessibility phase. Rejected — the token/brand change (P3) is a visual decision the user may want to review or revert independently of the semantic fixes (P4), and bundling them makes that revert expensive.
- tradeoff considered and rejected: doing `W-06` memoization inside P7 as part of the RTK migration. Rejected — the audit calls it the highest value per hour in the register and it fixes `W-03` at the root. It should not wait for a multi-week migration; it lands in P5 and RTK Query later removes the need for some of it.
- assumption for Build to verify: A2 (the `UIPrimitives` Modal is a sound conversion target — P4 opens by reading it), A3 (`shared/` has no runtime blocker to becoming a package — P6 opens by checking), and the R2 public host for `W-01`'s allowlist, which P1 must read from config rather than guess.
- downstream: Review focuses on the P6 behavior-neutrality claim and the P2 public-contract change; Test owns the five manual QA scenarios that no command can close; Ship opens six stacked PRs and must correct `.claude/CLAUDE.md`, which this chain makes false in two places.

## Exit Gate

- [x] Every active R/RI maps to at least one phase with exactly one owning phase.
- [x] Every phase has a binary, observable exit gate.
- [x] Dependency order explicit — security first, a11y before the package move, tests before checkout.
- [x] Every risk has a mitigation or a named blocker.
- [x] Verification plan covers every R/RI; items no command can prove are marked manual and owned by P8.
- [x] Source-of-truth and release handling explicit.
- [x] Branch strategy explicit and does not target the default branch.
- [ ] **B2 unresolved** — `shared/types/**` protected-path approval needed before P6. P0–P5 are unblocked.
- [ ] User approval of this plan.
