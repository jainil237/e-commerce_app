'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Admin page failed to load</h2>
      <p className="text-[var(--text-secondary)] mb-6">Please try again or go back to dashboard.</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary btn-md">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary btn-md border border-[var(--border-base)]">
          Dashboard
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 text-left text-xs bg-[var(--surface-2)] p-3 rounded-md max-w-3xl overflow-x-auto text-[var(--text-primary)]">
          {error.message}
        </pre>
      )}
    </div>
  )
}
