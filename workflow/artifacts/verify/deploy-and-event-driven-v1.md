---
slug: deploy-and-event-driven
version: 1
artifact: verify
status: blocked-for-user
created: 2026-08-21
updated: 2026-08-29
manifest_ids: [R1, R2, R3, R4, RI1, RI2, RI3, RI4, RI5, RI6, RI7, RI8, RI9, RI10, RI11]
upstream:
  - workflow/artifacts/briefs/deploy-and-event-driven-v1.md
  - workflow/artifacts/plans/deploy-and-event-driven-v1.md
  - workflow/artifacts/tasks/deploy-and-event-driven-v1.md
  - workflow/artifacts/reviews/deploy-and-event-driven-v1.md
orchestration:
  phase: test
  status: blocked-for-user
  next_phase: ship
  blockers:
    - Render requires GitHub OAuth authorization before an API service can be created.
    - TiDB, Upstash, and R2 or Cloudinary production configuration is unavailable.
    - Vercel project configuration requires the API and image-host values at build time.
  resolved_blockers:
    - "Root lint command failed its pre-existing baseline. Remediated 2026-08-29; `npm run lint` exits 0."
  user_checkpoint: deployment-authorization
---

# Production Deployment + Event-Driven API - Verification

## Inputs

- `workflow/artifacts/briefs/deploy-and-event-driven-v1.md`
- `workflow/artifacts/plans/deploy-and-event-driven-v1.md`
- `workflow/artifacts/tasks/deploy-and-event-driven-v1.md`
- `workflow/artifacts/reviews/deploy-and-event-driven-v1.md`
- `workflow/config/verification.yaml`
- At Test entry, the current branch was `deploy-and-event-driven`, clean, and three commits ahead of its remote tracking branch.

## Automated Checks

| Command | Outcome | Evidence |
|---|---|---|
| `npm run build` | pass | Run from repository root on 2026-08-21. Server typecheck and both Next.js production builds completed successfully. |
| `npm test --workspace=server` | blocked | Run on 2026-08-21. The test harness requires MySQL at `localhost:3306`; no local database is reachable. |
| `npm run lint` | pass | Re-run from repository root on 2026-08-29, exit 0. The seven pre-existing `apps/web` errors are fixed and the root script now uses `--if-present` so the two workspaces without a lint script are skipped instead of aborting the run. `no-restricted-syntax` W-08 warnings remain by design — they are tracked in `workflow/artifacts/tasks/frontend-security-a11y-v1.md`, not by this chain. |
| `npm run db:migrate` | blocked | Requires a configured production database. No TiDB credentials or service exist in the available deployment context. |

## Manifest Coverage

| Manifest ID | How Verified | Evidence | Result | Notes |
|---|---|---|---|---|
| R1 | command and documentation inspection | 2026-08-21 root build; `docs/deployment.md` | pass | Both frontends build from their workspace roots with the documented environment-variable contract. |
| R2 | live manual QA | No Vercel deployment exists for this chain. | blocked | Requires two live Vercel origins and a customer/admin session check in one browser. |
| R3 | live deployment and command | Render GitHub OAuth authorization is pending; TiDB is unprovisioned. | blocked | Requires Render service creation, TiDB TLS configuration, and successful migration/health evidence. |
| R4 | live queue round-trip | Upstash is unprovisioned. | blocked | Requires a real producer/worker/retry observation after the API deployment. |
| RI1 | review evidence | `workflow/artifacts/reviews/deploy-and-event-driven-v1.md`, Requirement Coverage RI1 | pass | Production storage guard and development fallback were reviewed and tested in the upstream chain. |
| RI2 | review evidence and live manual QA | Review Requirement Coverage RI2; no live origins yet. | blocked | Static rewrite/cookie evidence is covered, but host-only cookie behavior still needs production confirmation. |
| RI3 | deployment configuration check | `docs/deployment.md`; no Vercel projects yet. | blocked | `R2_PUBLIC_URL` must be saved as a Vercel build-time value in both projects and proven by deployed images. |
| RI4 | upstream characterization tests and live queue QA | Review Requirement Coverage RI4; live Upstash/Render unavailable. | blocked | Existing webhook characterization evidence is retained; real asynchronous completion remains unverified. |
| RI5 | upstream service tests | Review Requirement Coverage RI5 | pass | Sweeper behavior was covered by the four-test upstream service suite. |
| RI6 | configured commands | 2026-08-29 root `npm run build` pass and root `npm run lint` pass (both exit 0) | pass | Both configured non-database gates are green. `npm run db:migrate` remains blocked on an unprovisioned database. |
| RI7 | artifact and documentation inspection | This artifact and `docs/deployment.md` reference variable names only. | pass | No secret values were recorded. |
| RI8 | documentation inspection | `docs/deployment.md` Operational behaviour section | pass | Render cold starts and worker sleep behavior are documented. |
| RI9 | deployment configuration check | `docs/deployment.md` Environment variables; API service unavailable. | blocked | Real Vercel and Render origins must be configured in the API allowlist. |
| RI10 | review evidence and provider observation | Review Requirement Coverage RI10; Upstash unavailable. | blocked | Polling configuration is reviewed; real command-volume monitoring is unavailable until deployment. |
| RI11 | upstream code and tests | Review Requirement Coverage RI11 | pass | All selected call sites were reviewed with queue-job regression coverage. |

## Manual QA

| Scenario | Environment | Steps | Expected | Observed | Outcome | Evidence | Manifest IDs |
|---|---|---|---|---|---|---|---|
| Session isolation | Two deployed Vercel projects and seeded customer/admin accounts | Log in to web and admin in separate tabs, reload both, inspect cookie attributes. | Both sessions remain valid and each cookie is host-only. | Deployment origins do not yet exist. | blocked | `docs/deployment.md` Verification after deploying | R2, RI2 |
| API and queue health | Render, TiDB, Upstash, R2/Cloudinary | Apply migrations, call `/health`, trigger a queue producer and observe asynchronous completion/retry. | Healthy API, durable queue activity, and failed job retry. | Infrastructure has not been provisioned. | blocked | `docs/deployment.md` Provisioning | R3, R4, RI3, RI4, RI9, RI10 |

## Generated Output Evidence

Not applicable. The configured generated output directories are build products. Their declared regeneration command is covered by the successful root `npm run build` run on 2026-08-21.

## Findings

1. Production hosting cannot proceed without authorizing Render and provisioning the dependency services named in the approved plan.
2. ~~The configured root lint command remains failing on the documented pre-existing baseline.~~ **Resolved 2026-08-29.** The user selected remediation over a waiver. Six JSX entity escapes across five files, one stale `@typescript-eslint/no-explicit-any` disable comment for a rule this ESLint config does not define, and `--if-present` on the root lint script. `npm run lint` and `npm run build` both exit 0.
3. `docs/deployment.md` was audited claim-by-claim against the code on 2026-08-29. Every documented behaviour is implemented; no drift was found and no code change was required to satisfy the document. Details in the Documentation Conformance Audit below.

## Skipped Checks

| Check | Manifest IDs | Why Skipped | Risk | Owner | Blocks Ship |
|---|---|---|---|---|---|
| TiDB migration and concurrency verification | R3 | No TiDB instance or database credentials are available. | Migration or TiDB locking behavior could fail after deployment. | user | yes |
| Render API deployment and health check | R3, RI9 | Render requires GitHub OAuth authorization and service creation. | No API endpoint or CORS configuration can be proven. | user | yes |
| Vercel web/admin deployment and image build configuration | R2, RI2, RI3 | The required API and image-host deployment configuration is unavailable. | Frontends could build against incomplete production configuration. | user | yes |
| Upstash queue round-trip and quota observation | R4, RI4, RI10, RI11 | No Upstash database is provisioned. | Queue delivery, retries, and measured command use remain unproven. | user | yes |
| Server test suite | R4, RI5, RI11 | Required local MySQL instance is unreachable. | Current test execution cannot independently revalidate database-backed behavior. | user | no |
| ~~Root lint command~~ | RI6 | **No longer skipped.** Remediated 2026-08-29; the command passes. | none | — | no |

## Architecture Notes

- role: Senior QA
- decision: Preserve the approved split deployment topology: Vercel for `apps/web` and `apps/admin`; Render for `server`; TiDB, Upstash, and R2 or Cloudinary supply the API dependencies.
- constraint: Vercel requires the production API and image-host configuration at build time, while Render must be authorized before it can create the API service.
- quality-gates-validator: ran. Type/build and lint bars are met as of 2026-08-29. The database integration bar remains inadequate because no reachable database exists in this context.
- performance-optimizer: skipped. No hot-path or performance-specific behavior changed in this Test pass; no measurement is needed to determine the deployment blocker.
- downstream: Do not begin Ship until the live provisioning checks are resolved with evidence or a complete user-approved waiver. The lint decision is resolved.

## Documentation Conformance Audit (2026-08-29)

`docs/deployment.md` was read end to end and each of its claims checked against the
implementation. No drift was found; no code change was required.

| Documented claim | Implementation | Result |
|---|---|---|
| Browser requests use a relative `/api/*` path rewritten server-side | `apps/web/next.config.js`, `apps/admin/next.config.js` `rewrites()` | pass |
| No browser-side authenticated fetch uses an absolute cross-origin API URL | Three `NEXT_PUBLIC_API_URL` readers in `apps/web/src`: two are async server components (SSR, permitted); `components/ui/fallback-image.tsx` builds an image `src` for legacy `/uploads/` paths only and sends no credentials. `shared/api/apiSlice.ts` documents the constraint. | pass |
| No isolation-level hint; RMA uses explicit row locks | `server/src/services/rma.service.ts:172,284,329` use `SELECT ... FOR UPDATE`; no `isolationLevel`, `Serializable`, or `tidb_skip_isolation_level_check` occurs anywhere in `server/src` or `server/prisma` | pass |
| Documented migration command exists | `db:migrate:deploy` in `server/package.json` | pass |
| Unset `REDIS_URL` degrades to inline execution rather than dropping jobs | `server/src/queues/index.ts` `enqueue` / `enqueueOrRun` | pass |
| Production refuses to boot without cloud storage | `server/src/index.ts` startup guard, `process.exit(1)` when `NODE_ENV=production` and the active provider is `local` | pass |
| `R2_PUBLIC_URL` is build-time and feeds the image optimizer allowlist | `remotePatterns` derived from it in both `next.config.js` files | pass |
| Render start command and health check path | `start` → `node dist/index.js`; `GET /health` in `server/src/index.ts` | pass |
| `drainDelay: 30` caps idle Upstash polling | `server/src/queues/worker.ts` | pass |
| Queue startup must not delay port binding | `void startQueue()` runs after `app.listen` and swallows its own errors | pass |
| `PAYMENTS_MOCK` must be unset in production | `server/src/config/payments.ts` hard-disables mock mode when `NODE_ENV=production` — stricter than the document requires | pass |
| Rate limiting is per-instance; OTPs are in-memory | `express-rate-limit` default memory store; `NodeCache` in `server/src/routes/auth.routes.ts` | pass |
| Env var tables match the example files | All three example files annotate every key `[REQUIRED]` / `[REQUIRED-PROD]` / `[OPTIONAL]` / `[BUILD-TIME]` | pass |

The document's own "Verification after deploying" steps — `/health`, `prisma migrate status`,
and the two-tab host-only cookie walkthrough — remain unexecuted for the reasons recorded
under Skipped Checks. They are deployment-time checks, not code checks.

### Environment Variable Completeness (2026-08-29)

Every `process.env` read under `server/`, `apps/web/`, `apps/admin/`, and `shared/` was
inventoried and diffed against the three example files. The sets are now exactly equal —
no variable is read without being documented, and no documented variable is unread.

| Scope | Keys | Missing from example | Documented but unread |
|---|---|---|---|
| `server/.env.example` | 27 | none | none (was `CLOUDINARY_FOLDER`, removed) |
| `apps/web/.env.local.example` | 2 | none | none |
| `apps/admin/.env.local.example` | 2 | none | none |

Four accuracy defects were corrected rather than adding anything, since nothing was absent:

1. `CLOUDINARY_FOLDER` was documented but read nowhere; removed.
2. `SERVER_BASE_URL` was marked `[REQUIRED-PROD]`. Its only reader is the local-disk branch
   of `storage.service.ts`, which the production startup guard makes unreachable. Downgraded
   to `[OPTIONAL]` here and in `docs/deployment.md`.
3. `LOGISTICS_WEBHOOK_SECRET` was marked plain `[OPTIONAL]`, which read as "works without it".
   `verifyWebhookSignature` fails closed, so while it is unset that endpoint rejects every
   request. Stated explicitly in both files.
4. `SMTP_USER` / `SMTP_PASS` carried placeholder values. `email.service.ts` detects
   "unconfigured" by matching a fixed list of placeholder strings, and the file's
   `SMTP_PASS` placeholder was not on that list — a real user plus a dummy password would
   read as configured and fail at send time. Both are now blank.

A "REQUIRED TO HOST A WORKING STORE" block was added to the server example header covering
the variables that do not fail the boot but break behaviour in production: `NODE_ENV`,
`FRONTEND_URL`, `ADMIN_URL`, `RAZORPAY_WEBHOOK_SECRET`, `REDIS_URL`, `SMTP_*`.

Re-verified after the edits: root `npm run build` exit 0, root `npm run lint` exit 0.

## Sign-Off

- Verifier: Codex
- Date: 2026-08-21
- Recommendation: hold

- Verifier: Claude
- Date: 2026-08-29
- Recommendation: hold. Every check that does not require external infrastructure now passes,
  and the code conforms to `docs/deployment.md` in full. The remaining blockers are all
  provisioning, not implementation: Render GitHub OAuth, TiDB, Upstash, and R2 or Cloudinary.
