---
slug: clerk-auth
version: 1
artifact: task
status: ready-for-next-phase
created: 2026-08-29
updated: 2026-08-29
manifest_ids: [C1, C2, C3]
upstream:
  - docs/deployment.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  blocks_test:
    - Clerk publishable and secret keys are required before either app can run or be QA'd.
    - server/.env defines DB_* instead of DATABASE_URL, so the API cannot reach a database.
  user_checkpoint: clerk-keys
  task_class: complex
---

# Build — Clerk authentication, phase 1 (frontend integration)

## Changed Files

- `apps/web/src/middleware.ts`
- `apps/admin/src/middleware.ts`
- `apps/web/src/components/ClerkAuthControls.tsx`
- `apps/admin/src/components/ClerkAuthControls.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/admin/src/app/layout.tsx`
- `apps/web/src/components/organisms/Topbar/Topbar.tsx`
- `apps/admin/src/components/layout/sidebar.tsx`
- `apps/web/.env.local.example`
- `apps/admin/.env.local.example`
- `apps/web/package.json`
- `apps/admin/package.json`
- `server/src/middleware/clerk.middleware.ts`
- `server/src/index.ts`
- `server/.env.example`
- `server/package.json`

## Phase 2 addendum — Express API (2026-08-29)

Added at the user's direction so the Clerk keys could be set on frontend and backend in
one pass, and so `CLERK_SECRET_KEY` is genuinely *read* rather than documented-but-unused
(the `CLOUDINARY_FOLDER` anti-pattern this repo already removed once).

`@clerk/express@2.1.64` — peer range `^4.17.0 || ^5.0.0`, and the repo's
`express: ^5.0.0-beta.1` resolves to **5.2.1 stable**, so it is compatible.

`server/src/middleware/clerk.middleware.ts` mounts `clerkMiddleware()` **passively**,
matching the frontend phase: attaches auth context, protects nothing. It no-ops entirely
when `CLERK_SECRET_KEY` is unset, following the degraded-mode contract Redis and storage
already use in this codebase.

`getClerkUserId()` deliberately returns the Clerk id (`user_...`), never a local
`User.id`. Keeping those distinct is what makes the approved mapping strategy work:
`User.id` remains the FK for orders, addresses, wishlists, RMAs and audit logs, with a
`clerkUserId` column to be added in a later phase.

**How the session reaches Express, and why isolation survives:** the browser only ever
calls its own Next.js origin; `next.config.js` rewrites `/api/*` server-side and Next
forwards the incoming `Cookie` header, so Clerk's `__session` cookie arrives at the API
without any cross-origin authenticated request. The host-only cookie split that
`docs/deployment.md` calls load-bearing is preserved.

**One shared secret key, three consumers.** Both frontends and the API use the same
`CLERK_SECRET_KEY` from a single Clerk application.

## Scope of this phase

Frontend integration only, and deliberately **additive**: the existing JWT-cookie auth
remains the system of record. Nothing is removed, no route is protected, and no user
data changes. That keeps this phase reversible and reviewable on its own.

Phases still to come: Express-side session verification, `clerkUserId` on the `User`
model (protected path — approach approved by the user: keep internal `id` as the FK),
satellite-domain configuration to preserve web/admin session isolation, and retirement
of the old auth once the above is proven.

## Decisions

**`@clerk/nextjs@6`, not `@latest`.** `@clerk/nextjs@latest` requires Next.js
`>=15.2.8`; this monorepo runs Next `14.2.35`. v6 declares `next: ^14.2.25`, so it is
compatible with the installed version and **no Next upgrade was needed**. React 18.3.1
satisfies its peer range.

**`SignedIn` / `SignedOut`, not `Show`.** The `<Show when="signed-out">` form belongs to
a later major. v6 uses the `SignedIn`/`SignedOut` pair.

**`middleware.ts`, not `proxy.ts`.** `proxy.ts` is the Next 15+ convention; Next 14 uses
`middleware.ts`. Placed at `src/middleware.ts` in each app, matching the `src/` layout.

**`clerkMiddleware()` is passive — no `protect()` call.** Protecting routes now would
lock out users legitimately signed in through the existing JWT auth. The matcher includes
`'/(api|trpc)(.*)'` followed by `'/__clerk/:path*'` as required. Note `/api/*` in these
apps is rewritten to the Express API by `next.config.js`; middleware runs before the
rewrite and passes through, which is the intended behaviour.

## Verification

| Check | Result |
|---|---|
| `next build --workspace=apps/web` | pass — `ƒ Middleware 78.5 kB` present |
| `next build --workspace=apps/admin` | pass — `ƒ Middleware 78.5 kB` present |
| `npm run lint` (root) | pass, exit 0 |
| `npm run build --workspace=server` | pass — phase 2 |
| Server startup log for Clerk mode | **not verified** — the API cannot boot, see blocker 2 |

Both builds were run with a **throwaway** publishable key of valid format, purely to get
past `ClerkProvider`'s build-time key requirement and prove the integration compiles and
prerenders. No key was written to any file or committed. Real keys are required before
the apps can actually run — recorded as a blocker above.

## Blocks Test, not Build

The Build phase is complete: both apps compile, prerender, and lint. What cannot happen
yet is *running* either app, which is Test-phase work:

1. **Clerk keys are required.** Supply `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
   `CLERK_SECRET_KEY` in `apps/web/.env.local` and `apps/admin/.env.local`. Owner: user.
2. **`server/.env` has no `DATABASE_URL`.** It defines `DB_HOST`/`DB_PORT`/`DB_USERNAME`/
   `DB_PASSWORD`/`DB_DATABASE`, none of which any code reads; `schema.prisma` declares
   `url = env("DATABASE_URL")`. The API therefore cannot reach a database, so the
   storefront renders but every data call fails. Owner: user. Pre-dates this chain.

## Known consequence

`ClerkProvider` throws during static generation when
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is absent, so `next build` now **fails outright**
without it rather than degrading. Both `.env.local.example` files mark it
`[REQUIRED, BUILD-TIME]` for this reason; on Vercel it must reach the Build step, not
only runtime.
