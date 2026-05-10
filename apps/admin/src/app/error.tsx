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
      <p className="text-gray-500 mb-6">Please try again or go back to dashboard.</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={reset} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
          Try again
        </button>
        <Link href="/" className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50">
          Dashboard
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
