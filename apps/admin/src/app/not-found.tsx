import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Route not found</h2>
      <p className="text-gray-500 mb-6">This admin route does not exist.</p>
      <Link href="/" className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">
        Go to dashboard
      </Link>
    </div>
  )
}
