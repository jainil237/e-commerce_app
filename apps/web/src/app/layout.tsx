import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Topbar } from '@/components/organisms/Topbar/Topbar'
import { Footer } from '@/components/layout/footer'
import { BottomNav } from '@/components/organisms/BottomNav/BottomNav'
import { ErrorBoundary } from '@shared/components/ErrorBoundary'
import { ClerkProvider } from '@clerk/nextjs'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'MyStore — Fresh picks, delivered fast',
  description: 'Shop the best products at MyStore. Free delivery above ₹499.',
}

// Clerk mounts only when a publishable key is configured. Clerk throws on a
// missing key, which failed the production prerender of every static page for
// an integration that is still passive — the JWT-cookie auth is the system of
// record and the storefront is fully functional without Clerk. Mirrors the API,
// which likewise mounts Clerk only when its keys are present.
// Clerk is PARKED until the auth migration is planned properly — see
// docs/drafts/clerk-auth-plan.md. It currently creates a Clerk session that does
// not authenticate against the API, so the controls look functional and are not.
// Set CLERK_PARKED to false to resume; the env check below is left intact.
const CLERK_PARKED = true
const clerkEnabled = !CLERK_PARKED && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tree = (
    <ErrorBoundary>
      <Providers>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-brand-primary focus:text-white">
          Skip to main content
        </a>
        <div className="min-h-screen flex flex-col">
          <Topbar />
          <main id="main-content" className="flex-1 pb-20 md:pb-0 focus:outline-none" tabIndex={-1}>
            {children}
          </main>
          <Footer />
          <BottomNav />
        </div>
      </Providers>
    </ErrorBoundary>
  )

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-200" suppressHydrationWarning>
        {/* Inside <body>, not wrapping <html> — ClerkProvider renders elements. */}
        {clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree}
      </body>
    </html>
  )
}
