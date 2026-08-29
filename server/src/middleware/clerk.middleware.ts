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

export const isClerkConfigured = Boolean(process.env.CLERK_SECRET_KEY)

/**
 * Mount once, before routes. No-ops when CLERK_SECRET_KEY is unset so the API
 * still boots and serves during the migration — the same degraded-mode contract
 * Redis and storage already follow in this codebase.
 */
export function clerkSession(): RequestHandler {
  if (!isClerkConfigured) {
    return (_req, _res, next) => next()
  }
  return clerkMiddleware()
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
