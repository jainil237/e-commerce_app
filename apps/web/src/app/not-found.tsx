import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Page not found</h2>
      <p className="text-gray-500 mb-6">The route you requested does not exist.</p>
      <Link href="/products" className="btn btn-primary">
        Browse products
      </Link>
    </div>
  )
}
