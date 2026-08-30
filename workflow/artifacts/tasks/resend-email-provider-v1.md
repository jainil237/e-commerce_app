---
slug: resend-email-provider
version: 1
artifact: task
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [E1, E2, E3]
upstream:
  - docs/deployment.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  task_class: standard
---

# Build — Resend as the email provider

## Changed Files

- `server/src/services/email.service.ts`
- `server/tests/services/email-provider.test.ts`
- `server/.env.example`
- `docs/deployment.md`
- `server/package.json`

## Requirements

| ID | Requirement |
|---|---|
| E1 | Resend becomes the email provider, with SMTP retained as a fallback and the dev mock unchanged |
| E2 | The From address is configurable independently of the transport credential |
| E3 | No change to the seven send functions' behaviour or to queued-job retry semantics |

## What changed

**E2 was the structural part.** All seven send sites interpolated
`process.env.SMTP_USER` directly into `from:`. That only worked because SMTP_USER happens to be a
mailbox. Resend sends from a verified *domain*, not from the credential, so the two are no longer
the same value. Introduced `getFromAddress(displayNameSuffix?)` reading `EMAIL_FROM` and falling
back to `SMTP_USER`; all seven sites now call it. One site used a `"<store> Support"` display name,
which is why the helper takes a suffix.

**E1**: `getActiveEmailProvider()` returns `resend | smtp | mock`, mirroring
`storage.service.ts`'s precedence chain rather than inventing a new pattern. `ResendTransporter`
exposes the same `sendMail` shape as Nodemailer, so no send function changed.

Attachment translation is the one real adapter: Nodemailer distinguishes `path` (local file) from
`href` (remote URL); Resend takes `path` for a URL and `content` for bytes. Production always has a
remote invoice URL because the storage guard forbids local storage there, so the `readFileSync`
branch only runs in local dev.

Resend reports failures in the response body rather than throwing. `ResendTransporter` throws on
`error` deliberately — these sends run inside BullMQ jobs, and a job must throw to be retried.

## Verification

| Check | Result |
|---|---|
| `npm run build` (root) | pass, exit 0 |
| `npm run lint` (root) | pass, exit 0 |
| `tests/services/email-provider.test.ts` | pass, 5/5, run in isolation before the environment broke |
| Full `npm test --workspace=server` | **blocked** — see below |

**Blocker is external and pre-dates nothing in this change.** `server/.env` was edited during this
session to define `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE` instead of
`DATABASE_URL`. No code reads those names, and `schema.prisma` declares
`url = env("DATABASE_URL")`, so Prisma, the server, and the test harness all have no database URL.
The suite fails in `global-setup` before any test runs. Not caused by this change; recorded in the
response to the user with the fix.

## Risk

`RESEND_API_KEY` set without a verified domain in Resend means every send is rejected. The queue
retries three times with backoff and then the job fails — a late or missing email, not a failed
order. Documented in `docs/deployment.md` §3 and in `.env.example`.
