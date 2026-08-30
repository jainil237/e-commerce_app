import type { RequestHandler } from 'express'
import { clerkMiddleware, getAuth } from '@clerk/express'

/**
 * Clerk session verification for the Express API — currently PASSIVE.
 *
 * Mirrors the frontend phase: this attaches Clerk auth context to every request
 * but protects nothing. The existing JWT-cookie auth in auth.middleware.ts is
 * still the system of record, and requiring a Clerk session here would reject
 * every user who is legitimately signed in through it.
 *
 * How the session reaches this process: the browser talks only to its own Next.js
 * origin, and next.config.js rewrites /api/* server-side to this API. Next
 * forwards the incoming Cookie header, so Clerk's __session cookie arrives here
 * without the browser ever making a cross-origin authenticated call. That is what
 * keeps the web/admin host-only cookie isolation intact — see docs/deployment.md.
 */

const secretKey = process.env.CLERK_SECRET_KEY
const publishableKey = process.env.CLERK_PUBLISHABLE_KEY

/**
 * BOTH keys are required. @clerk/express's clerkMiddleware() throws
 * "Publishable key is missing" on every request when only the secret is present —
 * and because it is mounted app-wide, that turns into a 500 on every route,
 * including /health. Gating on the secret alone made a half-configured Clerk
 * break the entire API instead of disabling itself.
 */
// Clerk is PARKED until the auth migration is planned properly — see
// docs/drafts/clerk-auth-plan.md. Set to false to resume; the key checks below
// are left intact so it picks up where it left off.
const CLERK_PARKED = true

export const isClerkConfigured = !CLERK_PARKED && Boolean(secretKey && publishableKey)

/** One line for the startup banner, so "disabled" always says which kind. */
export function clerkStatusLine(): string {
  if (CLERK_PARKED) return '🔐 Clerk: PARKED pending planned auth migration (docs/drafts/clerk-auth-plan.md)'
  if (isClerkConfigured) return '🔐 Clerk: session verification active (passive — JWT auth is still authoritative)'
  return '🔐 Clerk: keys not configured — session verification disabled'
}

/**
 * Mount once, before routes. No-ops when CLERK_SECRET_KEY is unset so the API
 * still boots and serves during the migration — the same degraded-mode contract
 * Redis and storage already follow in this codebase.
 */
export function clerkSession(): RequestHandler {
  if (!isClerkConfigured) {
    // Half-configured is a mistake worth shouting about: it looks like Clerk is
    // set up, but no session will ever be verified. Silent while parked, since
    // then it is disabled on purpose rather than by accident.
    if (!CLERK_PARKED && (secretKey || publishableKey)) {
      console.warn(
        `⚠️  Clerk is half-configured — ${secretKey ? 'CLERK_PUBLISHABLE_KEY' : 'CLERK_SECRET_KEY'} is missing. ` +
        'Session verification is DISABLED. Both keys are required.'
      )
    }
    return (_req, _res, next) => next()
  }
  return clerkMiddleware({ secretKey, publishableKey })
}

/**
 * The Clerk user id on this request, or null.
 *
 * Returns the Clerk-issued id (`user_...`), NOT this database's `User.id`. The
 * two are deliberately different: `User.id` stays the foreign key for orders,
 * addresses, wishlists, RMAs and audit logs, and a `clerkUserId` column will map
 * between them. Nothing should treat this value as a local user id.
 */
export function getClerkUserId(req: Parameters<RequestHandler>[0]): string | null {
  if (!isClerkConfigured) return null
  try {
    return getAuth(req as never)?.userId ?? null
  } catch {
    // getAuth throws when clerkMiddleware did not run for this request.
    return null
  }
}
