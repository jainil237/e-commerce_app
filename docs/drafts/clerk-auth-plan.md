# Draft — Clerk authentication, parked

**Status:** Parked, not abandoned. The code is still in the tree and disabled by
a single `CLERK_PARKED` constant in each place it mounts. This records what is
broken, why it was parked, and what a real implementation has to decide.

## How to resume

Set `CLERK_PARKED = false` in each of these, and set the keys:

| File | What it gates |
|---|---|
| `apps/web/src/app/layout.tsx` | `ClerkProvider` |
| `apps/web/src/middleware.ts` | `clerkMiddleware` |
| `apps/web/src/components/ClerkAuthControls.tsx` | Sign in / sign up buttons |
| `apps/admin/src/app/layout.tsx`, `middleware.ts`, `ClerkAuthControls.tsx` | Same, for admin |
| `server/src/middleware/clerk.middleware.ts` | API session verification |

## Why it was parked

It looked functional and was not. The Clerk modal opened, accepted a sign-up and
created a Clerk session — and the customer stayed logged out, because the API
never saw them. Presenting a working-looking sign-in that does nothing is worse
than presenting none.

## What is actually broken

**1. The server never turns Clerk on.** `clerk.middleware.ts` reads
`process.env.CLERK_PUBLISHABLE_KEY`. Every `.env` in this repo defines
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. The names never matched, so
`isClerkConfigured` was always false and the API logged
"Clerk is half-configured" on every boot — including in production. **This is a
one-line fix and should be the first thing done on resume.**

**2. A Clerk session does not authenticate.** `authenticate` in
`auth.middleware.ts` accepts only the JWT access cookie (or a refresh cookie).
It has no branch for a Clerk session, so `/auth/me` returns 401 for a
Clerk-signed-in user and `AuthContext` keeps showing them as logged out.

**3. There is no local user for a Clerk account.** Nothing maps a Clerk `user_…`
onto a `User` row, so a Clerk user has no cart, no orders, no wishlist.

## The schema change this needs

Prepared and then reverted, because leaving an unapplied migration in the repo
would fire on someone else's deploy while the feature is parked:

```sql
ALTER TABLE `User` ADD COLUMN `clerkId` VARCHAR(191) NULL;
ALTER TABLE `User` MODIFY `phone` VARCHAR(191) NULL;
ALTER TABLE `User` MODIFY `passwordHash` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `User_clerkId_key` ON `User`(`clerkId`);
CREATE INDEX `User_clerkId_idx` ON `User`(`clerkId`);
```

`phone` and `passwordHash` must become nullable: a Clerk email or social sign-up
supplies neither. Both stay unique — MySQL allows repeated NULLs in a unique
index. `User.id` stays the foreign key for orders, addresses, wishlists, RMAs and
audit logs, so linking an existing customer to Clerk preserves their history.

## Decisions to make before writing code

- **Which is the system of record?** Today it is JWT cookies, with Clerk beside
  it. Two live sign-in paths on one page is the source of the confusion. Pick
  one and plan the cutover, rather than running both indefinitely.
- **Sync strategy: lazy or webhook?** Lazy (upsert the local user on the first
  authenticated request) needs no public URL and works in local dev. Webhooks
  (`user.created`) are cleaner but need a public endpoint and a signing secret,
  so local development needs tunnelling.
- **Existing customers.** A backfill script was written and removed with this
  park. Passwords cannot be migrated — Clerk will not import a bcrypt hash it did
  not create — so existing users would have to reset. That is a product decision,
  not a technical one.
- **Admin.** `apps/admin` has its own JWT auth and its own sign-in. Whether admin
  moves to Clerk at the same time, later, or never should be decided explicitly.
- **Session isolation.** `docs/deployment.md` calls the host-only cookie split
  between `web` and `admin` load-bearing. Clerk sets its own `__session` cookie;
  confirm that does not undo the split before enabling on both apps.

## Findings worth keeping

- The API's `/auth/reset-password` Zod schema already enforces exactly the five
  password rules now shared in `shared/utils` (min 8, upper, lower, number,
  symbol). Any Clerk password policy should match, or the two will disagree.
- Production TiDB had **no Prisma migration history** — `migrate deploy` failed
  with `P3005` because the schema existed but Prisma had no record of it. The six
  pre-existing migrations have since been baselined with `migrate resolve
  --applied`, so `migrate status` is now clean and reports only genuinely pending
  work. The documented deploy step had never actually run.
