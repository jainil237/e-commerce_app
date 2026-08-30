'use client'

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs'

/**
 * Clerk sign-in / sign-up / account controls.
 *
 * SignedIn / SignedOut are the v6 API. The newer `<Show when="signed-out">` form
 * exists in later majors, but this app is pinned to @clerk/nextjs@6 because
 * @clerk/nextjs@latest requires Next.js 15.2.8+ and this monorepo runs Next 14.2.
 *
 * NOTE: this renders ALONGSIDE the existing JWT-cookie auth, which is still the
 * system of record. Signing in here creates a Clerk session; it does not yet log
 * you into the API. Both are visible on purpose during the migration so the two
 * can be compared — this component goes away, or the old one does, when the
 * server side is cut over.
 */
// Renders nothing when Clerk is not configured. Without a publishable key there
// is no ClerkProvider above this component (see the root layout), and these
// components throw outside a provider. The JWT-cookie controls remain either way.
// Clerk is PARKED until the auth migration is planned properly — see
// docs/drafts/clerk-auth-plan.md. It currently creates a Clerk session that does
// not authenticate against the API, so the controls look functional and are not.
// Set CLERK_PARKED to false to resume; the env check below is left intact.
const CLERK_PARKED = true
const clerkEnabled = !CLERK_PARKED && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export function ClerkAuthControls() {
  if (!clerkEnabled) return null

  return (
    <div className="flex items-center gap-2" data-testid="clerk-auth-controls">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="ms-btn ms-btn--ghost ms-btn--sm">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="ms-btn ms-btn--primary ms-btn--sm">
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  )
}
