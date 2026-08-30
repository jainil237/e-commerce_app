import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

/**
 * Clerk middleware — currently PASSIVE.
 *
 * clerkMiddleware() with no `protect()` call attaches auth context and lets every
 * request through. That is deliberate for this stage: the existing JWT-cookie auth
 * is still the system of record, so protecting routes here would lock out users
 * who are legitimately signed in through it.
 *
 * Mounted only when a publishable key is configured. Clerk throws on a missing
 * key, and because this integration is passive, that would take down a build or
 * a request for a feature that does nothing yet — the storefront is fully
 * functional without it. This mirrors the API, which likewise mounts Clerk only
 * when both keys are present. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to enable.
 *
 * Route protection gets added when the server side is migrated — see
 * workflow/artifacts/ for the clerk-auth chain.
 */
export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next()

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API routes. Note these are rewritten to the Express API by next.config.js;
    // middleware runs before the rewrite, and passing through is what we want.
    '/(api|trpc)(.*)',
    // Clerk's auto-proxy path.
    '/__clerk/:path*',
  ],
}
