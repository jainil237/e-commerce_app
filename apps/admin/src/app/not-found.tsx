import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Route not found</h2>
      <p className="text-[var(--text-secondary)] mb-6">This admin route does not exist.</p>
      <Link href="/" className="btn btn-primary btn-md">
        Go to dashboard
      </Link>
    </div>
  )
}
