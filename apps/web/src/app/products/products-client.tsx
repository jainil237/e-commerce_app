'use client'
import './plp.scss'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Filter, X } from 'lucide-react'
import { ProductCard } from '@/components/molecules/ProductCard/ProductCard'
import { useStoreConfig } from '@/contexts'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import { Select } from '@/components/atoms/Select/Select'
import { useGetProductsQuery } from '@shared/api/productsApi'
import type { Product } from '@shared/types'

interface Category {
  id: string
  name: string
  slug: string
}

interface ProductsClientProps {
  initialProductsData: {
    success: boolean
    data: Product[]
    meta?: {
      total: number
      page: number
      limit: number
    }
  }
  categories: Category[]
}

export function ProductsClient({ initialProductsData, categories }: ProductsClientProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const config = useStoreConfig()

  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const sort = searchParams.get('sort') || 'newest'
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const inStock = searchParams.get('inStock') === 'true'

  const [localMin, setLocalMin] = useState(minPrice || '')
  const [localMax, setLocalMax] = useState(maxPrice || '')

  useEffect(() => { setPage(1) }, [category, search, sort, minPrice, maxPrice, inStock])
  useEffect(() => { setLocalMin(minPrice || '') }, [minPrice])
  useEffect(() => { setLocalMax(maxPrice || '') }, [maxPrice])

  const { data, isFetching } = useGetProductsQuery({
    category, search, sort, minPrice, maxPrice, inStock, page, limit: 12,
  })

  // RTK Query, unlike SWR's keepPreviousData, clears `data` while a new arg
  // combination is in flight — which would flash the grid empty on every
  // filter click. Holding the last successful response in local state (seeded
  // from the SSR payload) reproduces the old behaviour; `isFetching` still
  // drives the loading indicator below.
  const [displayData, setDisplayData] = useState(initialProductsData)
  useEffect(() => {
    if (data) setDisplayData(data)
  }, [data])

  const products = displayData.data || []
  const total = displayData.meta?.total || 0

  const updateFilters = useCallback((key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams)
    if (value) nextParams.set(key, value)
    else nextParams.delete(key)
    if (key !== 'page') { nextParams.delete('page'); setPage(1) }
    router.push(`/products?${nextParams.toString()}`)
  }, [searchParams, router])

  const clearAllFilters = useCallback(() => {
    router.push('/products')
    setLocalMin('')
    setLocalMax('')
    setPage(1)
  }, [router])

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

  const FilterContent = () => (
    <>
      <div className="ms-filter-sidebar__section">
        <h2 className="ms-filter-sidebar__heading">Categories</h2>
        <Link
          href="/products"
          className={`ms-filter-sidebar__radio-item${!category ? ' ms-filter-sidebar__radio-item--active' : ''}`}
          onClick={() => setShowFilters(false)}
        >
          All Products
        </Link>
        {categories.map(cat => (
          <Link
            key={cat.id}
            href={`/products?category=${cat.slug}`}
            className={`ms-filter-sidebar__radio-item${category === cat.slug ? ' ms-filter-sidebar__radio-item--active' : ''}`}
            onClick={() => setShowFilters(false)}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      <hr className="ms-filter-sidebar__divider" />

      <div className="ms-filter-sidebar__section">
        <Select
          label="Sort By"
          options={sortOptions}
          value={sort}
          onChange={(e) => updateFilters('sort', e.target.value)}
        />
      </div>

      <hr className="ms-filter-sidebar__divider" />

      <div className="ms-filter-sidebar__section">
        <h2 className="ms-filter-sidebar__heading">Price Range</h2>
        <div className="ms-filter-sidebar__price-row">
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
      </div>

      <hr className="ms-filter-sidebar__divider" />

      <div className="ms-filter-sidebar__section">
        <label className="ms-filter-sidebar__stock-toggle">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => updateFilters('inStock', e.target.checked ? 'true' : '')}
            className="ms-filter-sidebar__stock-checkbox"
          />
          <span className="ms-filter-sidebar__stock-label">In Stock Only</span>
        </label>
      </div>
    </>
  )

  return (
    <div className="ms-plp">
      <div className="ms-plp__container">

        {/* Header */}
        <div className="ms-plp__header">
          <div>
            <h1 className="ms-plp__title">
              {search
                ? `Search results for "${search}"`
                : category
                  ? categories.find(c => c.slug === category)?.name || 'Products'
                  : 'All Products'}
            </h1>
            <p className="ms-plp__subtitle">{total} products found</p>
          </div>
          <div className="ms-filter-trigger">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              leftIcon={<Filter width={16} height={16} />}
            >
              Filters
            </Button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="ms-plp__chips">
            {activeFilters.map(f => (
              <button
                key={f.key}
                onClick={() => {
                  updateFilters(f.key, '')
                  if (f.key === 'minPrice') setLocalMin('')
                  if (f.key === 'maxPrice') setLocalMax('')
                }}
                className="ms-chip"
              >
                <span className="ms-chip__label">{f.label}:</span>
                {f.value}
                <span className="ms-chip__remove"><X width={12} height={12} /></span>
              </button>
            ))}
            {activeFilters.length > 1 && (
              <button onClick={clearAllFilters} className="ms-btn ms-btn--ghost-danger ms-btn--sm">
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="ms-plp-layout">

          {/* Sidebar — desktop */}
          <aside className="ms-filter-sidebar">
            <div className="ms-filter-sidebar__card">
              <FilterContent />
            </div>
          </aside>

          {/* Mobile filter drawer — bottom sheet */}
          <>
            {showFilters && (
              <div
                className="ms-filter-drawer__backdrop"
                onClick={() => setShowFilters(false)}
              />
            )}
            <div className={`ms-filter-drawer__panel${showFilters ? ' ms-filter-drawer__panel--open' : ''}`}>
              <div className="ms-filter-drawer__handle" />
              <div className="ms-filter-drawer__header">
                <h2 className="ms-filter-drawer__title">Filters</h2>
                <button
                  onClick={() => setShowFilters(false)}
                  className="ms-btn ms-btn--ghost ms-btn--icon ms-btn--sm"
                  aria-label="Close filters"
                >
                  <X width={20} height={20} />
                </button>
              </div>
              <FilterContent />
              <div className="ms-filter-drawer__footer">
                <Button variant="primary-brand" full onClick={() => setShowFilters(false)}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </>

          {/* Products column */}
          <div className="ms-plp__main">

            {isFetching && products.length === 0 ? (
              <div className="ms-plp-skeleton">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="ms-plp-skeleton__card">
                    <div className="ms-plp-skeleton__image" />
                    <div className="ms-plp-skeleton__body">
                      <div className="ms-plp-skeleton__line ms-plp-skeleton__line--wide" />
                      <div className="ms-plp-skeleton__line ms-plp-skeleton__line--narrow" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="ms-empty-state">
                <p className="ms-empty-state__sub">No products found matching your criteria</p>
                <Link href="/products">
                  <Button variant="secondary">Clear filters</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className={`ms-product-grid${isFetching ? ' ms-product-grid--loading' : ''}`}>
                  {products.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {total > 12 && (
                  <div className="ms-pagination">
                    <Button
                      variant="outline"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="ms-pagination__indicator">
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
