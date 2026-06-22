import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@/scss/index.scss'
import { Providers } from '@/components/providers'
import { Topbar } from '@/components/organisms/Topbar/Topbar'
import { Footer } from '@/components/layout/footer'
import { BottomNav } from '@/components/organisms/BottomNav/BottomNav'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'MyStore — Fresh picks, delivered fast',
  description: 'Shop the best products at MyStore. Free delivery above ₹499.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased bg-[var(--surface-1)] text-[var(--text-primary)] transition-colors duration-200" suppressHydrationWarning>
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
      </body>
    </html>
  )
}
