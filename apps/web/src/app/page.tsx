import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ProductCard } from '@/components/molecules/ProductCard/ProductCard'
import { CategoryCard } from '@/components/category/category-card'
import { Button } from '@/components/atoms/Button/Button'
import styles from './page.module.css'

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
      <section className={styles.promoBanner}>
        <div className={styles.container}>
          <p className={styles.promoText}>
            🎉 FREE delivery on orders above ₹499 · Use code <strong>WELCOME10</strong> for 10% off your first order
          </p>
        </div>
      </section>

      {/* Hero Banner */}
      <section className={styles.hero}>
        <div className={styles.heroBackground} />
        <div className={styles.heroContent}>
          <div className="max-w-2xl">
            <h1 className={styles.heroTitle}>
              Discover Amazing Products
            </h1>
            <p className={styles.heroSubtitle}>
              Experience the best shopping curated just for you. Quality materials, stunning designs, and fast delivery over ₹499.
            </p>
            <Link href="/products">
              <Button size="lg" variant="secondary" rightIcon={<ArrowRight className="w-5 h-5" />}>
                Shop Collection
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Shop by Category</h2>
              <Link href="/products" className={styles.viewAllLink}>
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className={styles.layoutGrid}>
              {categories.slice(0, 4).map((category: { id: string; name: string; slug: string; imageUrl?: string }) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className={styles.sectionAlternate}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Featured Curations</h2>
              <Link href="/products?featured=true" className={styles.viewAllLink}>
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className={styles.layoutGrid}>
              {featuredProducts.map((product: { id: string; slug: string; name: string; price: string; mrp: string; images: Array<{ url: string }>; category?: { name: string } }) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust Badges */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.trustGrid}>
            <div className={styles.trustItem}>
              <div className={styles.trustIcon}>🚚</div>
              <h3 className={styles.trustTitle}>Free Delivery</h3>
              <p className={styles.trustDesc}>On orders above ₹499</p>
            </div>
            <div className={styles.trustItem}>
              <div className={styles.trustIcon}>🔒</div>
              <h3 className={styles.trustTitle}>Secure Payment</h3>
              <p className={styles.trustDesc}>100% secure checkout</p>
            </div>
            <div className={styles.trustItem}>
              <div className={styles.trustIcon}>↩️</div>
              <h3 className={styles.trustTitle}>Easy Returns</h3>
              <p className={styles.trustDesc}>7-day return policy</p>
            </div>
            <div className={styles.trustItem}>
              <div className={styles.trustIcon}>📄</div>
              <h3 className={styles.trustTitle}>GST Invoice</h3>
              <p className={styles.trustDesc}>For all orders</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
