import Link from 'next/link'
import { ArrowRight, Truck, ShieldCheck, RotateCcw, FileText } from 'lucide-react'
import { ProductCard } from '@/components/molecules/ProductCard/ProductCard'
import { Button } from '@/components/atoms/Button/Button'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'

async function getFeaturedProducts() {
  try {
    const res = await fetch(`${API}/products/featured`, { next: { revalidate: 60 } })
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

async function getCategories() {
  try {
    const res = await fetch(`${API}/categories`, { next: { revalidate: 60 } })
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

const TRUST_TILES = [
  { icon: Truck,        title: 'Free Delivery',   sub: 'On orders above ₹499' },
  { icon: ShieldCheck,  title: 'Secure Payment',  sub: '100% secure checkout' },
  { icon: RotateCcw,    title: 'Easy Returns',    sub: '7-day return policy' },
  { icon: FileText,     title: 'GST Invoice',     sub: 'For all orders' },
]

export default async function HomePage() {
  const [featuredProducts, categories] = await Promise.all([
    getFeaturedProducts(),
    getCategories(),
  ])

  return (
    <main id="main-content">
      {/* Promo banner */}
      <div className="ms-promo-banner">
        <p className="ms-promo-banner__text">
          🎉 FREE delivery on orders above ₹499 · Use code <strong>WELCOME10</strong> for 10% off your first order
        </p>
      </div>

      {/* Hero */}
      <section className="ms-hero">
        <div className="ms-hero__inner">
          <h1 className="ms-hero__title">Discover Amazing Products</h1>
          <p className="ms-hero__sub">
            Experience the best shopping curated just for you. Quality materials, stunning designs, and fast delivery over ₹499.
          </p>
          <Link href="/products">
            <Button size="lg" variant="secondary" rightIcon={<ArrowRight width={20} height={20} />}>
              Shop Collection
            </Button>
          </Link>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="ms-section ms-section--surface-0">
          <div className="ms-section__container">
            <div className="ms-section-header">
              <h2 className="ms-section-header__title">Shop by Category</h2>
              <Link href="/products" className="ms-section-header__link">
                View All <ArrowRight width={14} height={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>
            </div>
            <div className="ms-category-grid">
              {(categories as Array<{ id: string; name: string; slug: string; imageUrl?: string }>)
                .slice(0, 4)
                .map(cat => (
                  <Link key={cat.id} href={`/products?category=${cat.slug}`} className="ms-category-card">
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="ms-category-card__image" />
                    ) : (
                      <div className="ms-category-card__fallback">
                        {cat.name.charAt(0)}
                      </div>
                    )}
                    <div className="ms-category-card__overlay" />
                    <div className="ms-category-card__label">
                      {cat.name}
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="ms-section ms-section--surface-1">
          <div className="ms-section__container">
            <div className="ms-section-header">
              <h2 className="ms-section-header__title">Featured Curations</h2>
              <Link href="/products?featured=true" className="ms-section-header__link">
                View All <ArrowRight width={14} height={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>
            </div>
            <div className="ms-category-grid">
              {(featuredProducts as Array<{ id: string; slug: string; name: string; price: string; mrp: string; images: Array<{ url: string }>; category?: { name: string } }>)
                .slice(0, 8)
                .map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust badges */}
      <section className="ms-section ms-section--surface-0">
        <div className="ms-section__container">
          <div className="ms-trust-grid">
            {TRUST_TILES.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="ms-trust-tile">
                <div className="ms-trust-tile__icon">
                  <Icon width={32} height={32} />
                </div>
                <h3 className="ms-trust-tile__title">{title}</h3>
                <p className="ms-trust-tile__sub">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
