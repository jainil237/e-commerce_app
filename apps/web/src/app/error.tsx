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
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
      <p className="text-gray-500 mb-6">We could not load this page right now.</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-6 text-left text-xs bg-gray-100 p-3 rounded-md max-w-3xl overflow-x-auto">
          {error.message}
        </pre>
      )}
    </div>
  )
}
