'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Filter, X, Loader2 } from 'lucide-react'
import { ProductCard } from '@/components/molecules/ProductCard/ProductCard'
import { useStoreConfig } from '@/components/providers'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import { Select } from '@/components/atoms/Select/Select'
import styles from './products.module.css'

interface Product {
  id: string
  slug: string
  name: string
  price: string
  mrp: string
  images: Array<{ url: string; altText?: string }>
  category?: { name: string; slug: string }
  stock: number
}

interface Category {
  id: string
  name: string
  slug: string
}

function ProductsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const config = useStoreConfig()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const sort = searchParams.get('sort') || 'newest'
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const inStock = searchParams.get('inStock') === 'true'

  // Keep local state for temporary inputs to avoid triggering re-renders on keystrokes
  const [localMin, setLocalMin] = useState(minPrice || '')
  const [localMax, setLocalMax] = useState(maxPrice || '')

  useEffect(() => {
    setPage(1)
  }, [category, search, sort, minPrice, maxPrice, inStock])

  useEffect(() => {
    async function fetchProducts() {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (search) params.set('search', search)
      if (sort) params.set('sort', sort)
      if (minPrice) params.set('minPrice', minPrice)
      if (maxPrice) params.set('maxPrice', maxPrice)
      if (inStock) params.set('inStock', 'true')
      params.set('page', page.toString())
      params.set('limit', '12')

      const res = await fetch(`/api/v1/products?${params}`)
      const data = await res.json()
      setProducts(data.data || [])
      setTotal(data.meta?.total || 0)
      setIsLoading(false)
    }

    fetchProducts()
  }, [category, search, sort, minPrice, maxPrice, inStock, page])

  useEffect(() => {
    async function fetchCategories() {
      const res = await fetch('/api/v1/categories')
      const data = await res.json()
      setCategories(data.data || [])
    }
    fetchCategories()
  }, [])

  // SPA navigation — no full page reload
  const updateFilters = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/products?${params}`)
  }, [searchParams, router])

  const clearAllFilters = useCallback(() => {
    router.push('/products')
    setLocalMin('')
    setLocalMax('')
  }, [router])

  // Collect active filters for chips
  const activeFilters: Array<{ key: string; label: string; value: string }> = []
  if (category) {
    const cat = categories.find(c => c.slug === category)
    activeFilters.push({ key: 'category', label: 'Category', value: cat?.name || category })
  }
  if (search) activeFilters.push({ key: 'search', label: 'Search', value: `"${search}"` })
  if (minPrice) activeFilters.push({ key: 'minPrice', label: 'Min Price', value: `₹${minPrice}` })
  if (maxPrice) activeFilters.push({ key: 'maxPrice', label: 'Max Price', value: `₹${maxPrice}` })
  if (inStock) activeFilters.push({ key: 'inStock', label: 'In Stock', value: 'Yes' })
  if (sort !== 'newest') {
    const sortLabel = { 'price-asc': 'Price ↑', 'price-desc': 'Price ↓', 'name': 'Name', 'popular': 'Popular' }[sort] || sort
    activeFilters.push({ key: 'sort', label: 'Sort', value: sortLabel })
  }

  const sortOptions = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Price: Low to High', value: 'price-asc' },
    { label: 'Price: High to Low', value: 'price-desc' },
    { label: 'Most Popular', value: 'popular' },
  ]

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>
              {search
                ? `Search results for "${search}"`
                : category
                  ? categories.find(c => c.slug === category)?.name || 'Products'
                  : 'All Products'}
            </h1>
            <p className={styles.subtitle}>{total} products found</p>
          </div>
          <Button
            variant="outline"
            className="md:hidden"
            onClick={() => setShowFilters(!showFilters)}
            leftIcon={<Filter className="w-4 h-4 mr-2 -ml-1" />}
          >
            Filters
          </Button>
        </div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className={styles.filterChips}>
            {activeFilters.map(f => (
              <button
                key={f.key}
                onClick={() => {
                  updateFilters(f.key, '')
                  if (f.key === 'minPrice') setLocalMin('')
                  if (f.key === 'maxPrice') setLocalMax('')
                }}
                className={styles.filterChip}
              >
                <span className={styles.filterChipLabel}>{f.label}:</span> {f.value}
                <X className="w-3.5 h-3.5 ml-1.5 shrink-0" />
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button onClick={clearAllFilters} className={styles.clearAllBtn}>
                Clear all
              </button>
            )}
          </div>
        )}

        <div className={styles.mainLayout}>
          {/* Sidebar Filters - Desktop */}
          <aside className={styles.sidebar}>
            <div className={styles.filterCard}>
              <h3 className={styles.filterSectionTitle}>Categories</h3>
              <div className={styles.categoryList}>
                <Link
                  href="/products"
                  className={`${styles.categoryLink} ${!category ? styles.categoryLinkActive : styles.categoryLinkInactive}`}
                >
                  All Products
                </Link>
                {categories.map(cat => (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.slug}`}
                    className={`${styles.categoryLink} ${category === cat.slug ? styles.categoryLinkActive : styles.categoryLinkInactive}`}
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>

              <hr className={styles.divider} />

              <Select
                label="Sort By"
                options={sortOptions}
                value={sort}
                onChange={(e) => updateFilters('sort', e.target.value)}
              />

              <hr className={styles.divider} />

              <h3 className={styles.filterSectionTitle}>Price Range</h3>
              <div className={styles.priceRangeGroup}>
                <Input
                  type="number"
                  placeholder="Min"
                  value={localMin}
                  onChange={(e) => setLocalMin(e.target.value)}
                  onBlur={() => { if (localMin !== minPrice) updateFilters('minPrice', localMin) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') updateFilters('minPrice', localMin) }}
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={localMax}
                  onChange={(e) => setLocalMax(e.target.value)}
                  onBlur={() => { if (localMax !== maxPrice) updateFilters('maxPrice', localMax) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') updateFilters('maxPrice', localMax) }}
                />
              </div>

              <hr className={styles.divider} />

              {/* In Stock Toggle */}
              <label className={styles.stockToggle}>
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(e) => updateFilters('inStock', e.target.checked ? 'true' : '')}
                  className={styles.stockCheckbox}
                />
                <span className={styles.stockLabel}>In Stock Only</span>
              </label>
            </div>
          </aside>

          {/* Mobile Filters */}
          {showFilters && (
            <div className={styles.mobileFilterOverlay}>
              <div className={styles.mobileFilterBackdrop} onClick={() => setShowFilters(false)} />
              <div className={styles.mobileFilterPanel}>
                <div className={styles.mobileFilterHeader}>
                  <h3 className={styles.mobileFilterTitle}>Filters</h3>
                  <button onClick={() => setShowFilters(false)} className="p-2 text-[var(--text-secondary)] hover:text-black dark:hover:text-white transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <h4 className={styles.filterSectionTitle}>Categories</h4>
                <div className="space-y-1 mb-8">
                  {categories.map(cat => (
                    <Link
                      key={cat.id}
                      href={`/products?category=${cat.slug}`}
                      className={`${styles.categoryLink} ${category === cat.slug ? styles.categoryLinkActive : styles.categoryLinkInactive}`}
                      onClick={() => setShowFilters(false)}
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>

                <Select
                  label="Sort By"
                  options={sortOptions}
                  value={sort}
                  onChange={(e) => updateFilters('sort', e.target.value)}
                />

                <div className="mt-8">
                  <h4 className={styles.filterSectionTitle}>Price Range</h4>
                  <div className={styles.priceRangeGroup}>
                    <Input
                      type="number"
                      placeholder="Min"
                      value={localMin}
                      onChange={(e) => setLocalMin(e.target.value)}
                      onBlur={() => { if (localMin !== minPrice) updateFilters('minPrice', localMin) }}
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={localMax}
                      onChange={(e) => setLocalMax(e.target.value)}
                      onBlur={() => { if (localMax !== maxPrice) updateFilters('maxPrice', localMax) }}
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className={styles.stockToggle}>
                    <input
                      type="checkbox"
                      checked={inStock}
                      onChange={(e) => updateFilters('inStock', e.target.checked ? 'true' : '')}
                      className={styles.stockCheckbox}
                    />
                    <span className={styles.stockLabel}>In Stock Only</span>
                  </label>
                </div>

              </div>
            </div>
          )}

          {/* Products Grid */}
          <div className={styles.productsColumn}>
            {isLoading ? (
              <div className={styles.layoutGrid}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className={styles.skeletonCard}>
                    <div className={styles.skeletonImage} />
                    <div className={styles.skeletonContent}>
                      <div className={styles.skeletonLine1} />
                      <div className={styles.skeletonLine2} />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyText}>No products found matching your criteria</p>
                <Link href="/products">
                  <Button variant="secondary">Clear filters</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className={styles.layoutGrid}>
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {total > 12 && (
                  <div className={styles.pagination}>
                    <Button
                      variant="outline"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className={styles.pageIndicator}>
                      Page {page} of {Math.ceil(total / 12)}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage(p => p + 1)}
                      disabled={page * 12 >= total}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" /></div>}>
      <ProductsContent />
    </Suspense>
  )
}
