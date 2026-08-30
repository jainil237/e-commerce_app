import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { ErrorBoundary } from '@shared/components/ErrorBoundary'
import { ClerkProvider } from '@clerk/nextjs'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'E-commerce admin panel',
}

// Clerk mounts only when a publishable key is configured. Clerk throws on a
// missing key, which failed the production prerender of every static page for
// an integration that is still passive — the JWT-cookie auth is the system of
// record and the app is fully functional without Clerk. Mirrors the API, which
// likewise mounts Clerk only when its keys are present.
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tree = (
    <ErrorBoundary>
      <Providers>
        {children}
      </Providers>
    </ErrorBoundary>
  )

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Inside <body>, not wrapping <html> — ClerkProvider renders elements. */}
        {clerkEnabled ? <ClerkProvider>{tree}</ClerkProvider> : tree}
      </body>
    </html>
  )
}
