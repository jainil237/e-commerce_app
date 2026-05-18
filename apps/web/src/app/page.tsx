import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ProductCard } from '@/components/molecules/ProductCard/ProductCard'
import { CategoryCard } from '@/components/category/category-card'
import { Button } from '@/components/atoms/Button/Button'

async function getFeaturedProducts() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/products/featured`, {
    next: { revalidate: 60 },
  })
  const data = await res.json()
  return data.data || []
}

async function getCategories() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/categories`, {
    next: { revalidate: 60 },
  })
  const data = await res.json()
  return data.data || []
}

export default async function HomePage() {
  const [featuredProducts, categories] = await Promise.all([
    getFeaturedProducts(),
    getCategories(),
  ])

  return (
    <div className="min-h-screen">
      {/* Promotional Banner */}
      <section className="bg-[var(--brand-primary)] text-white py-2 px-4 text-center">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <p className="text-sm font-medium tracking-wide">
            🎉 FREE delivery on orders above ₹499 · Use code <strong>WELCOME10</strong> for 10% off your first order
          </p>
        </div>
      </section>

      {/* Hero Banner */}
      <section className="relative py-24 lg:py-32 overflow-hidden bg-[var(--surface-1)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-1)] z-0" />
        <div className="relative z-10 container mx-auto px-4 md:px-6 lg:px-8 flex flex-col items-center text-center">
          <div className="max-w-3xl flex flex-col items-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--text-primary)] mb-6">
              Discover Amazing Products
            </h1>
            <p className="text-lg sm:text-xl text-[var(--text-secondary)] mb-8 max-w-2xl">
              Experience the best shopping curated just for you. Quality materials, stunning designs, and fast delivery over ₹499.
            </p>
            <Link href="/products" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg">
              <Button size="lg" variant="secondary" rightIcon={<ArrowRight className="w-5 h-5" />}>
                Shop Collection
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-16 md:py-24 bg-[var(--surface-0)]">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
            <div className="flex flex-row justify-between items-end mb-8 md:mb-12">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">Shop by Category</h2>
              <Link href="/products" className="flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-md px-2 py-1 -mr-2">
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
              {categories.slice(0, 4).map((category: { id: string; name: string; slug: string; imageUrl?: string }) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="py-16 md:py-24 bg-[var(--surface-1)]">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
            <div className="flex flex-row justify-between items-end mb-8 md:mb-12">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-primary)]">Featured Curations</h2>
              <Link href="/products?featured=true" className="flex items-center gap-1 text-sm font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-md px-2 py-1 -mr-2">
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
              {featuredProducts.map((product: { id: string; slug: string; name: string; price: string; mrp: string; images: Array<{ url: string }>; category?: { name: string } }) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust Badges */}
      <section className="py-16 md:py-24 bg-[var(--surface-0)]">
        <div className="container mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            <div className="flex flex-col items-center text-center p-6 bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4 bg-[var(--surface-2)] w-16 h-16 flex items-center justify-center rounded-full text-[var(--brand-primary)]">🚚</div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Free Delivery</h3>
              <p className="text-sm text-[var(--text-secondary)]">On orders above ₹499</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4 bg-[var(--surface-2)] w-16 h-16 flex items-center justify-center rounded-full text-[var(--brand-primary)]">🔒</div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Secure Payment</h3>
              <p className="text-sm text-[var(--text-secondary)]">100% secure checkout</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4 bg-[var(--surface-2)] w-16 h-16 flex items-center justify-center rounded-full text-[var(--brand-primary)]">↩️</div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Easy Returns</h3>
              <p className="text-sm text-[var(--text-secondary)]">7-day return policy</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] shadow-sm hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4 bg-[var(--surface-2)] w-16 h-16 flex items-center justify-center rounded-full text-[var(--brand-primary)]">📄</div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">GST Invoice</h3>
              <p className="text-sm text-[var(--text-secondary)]">For all orders</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
