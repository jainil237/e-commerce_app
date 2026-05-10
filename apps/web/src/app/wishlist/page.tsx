'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Heart, Loader2, ShoppingCart, Trash2, ArrowRight } from 'lucide-react'
import { useAuth, useWishlist, useCart, useToast } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Badge } from '@/components/atoms/Badge/Badge'

interface WishlistProduct {
  id: string
  slug: string
  name: string
  price: string
  mrp: string
  images: Array<{ url: string; altText?: string }>
  category?: { id: string; name: string; slug: string }
  stock: number
  addedAt: string
}

export default function WishlistPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { items: wishlistIds, removeFromWishlist } = useWishlist()
  const { addItem } = useCart()
  const { showToast } = useToast()
  const [products, setProducts] = useState<WishlistProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProducts([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    fetch('/api/v1/wishlist', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setProducts(data.data || [])
        setIsLoading(false)
      })
      .catch(() => {
        setProducts([])
        setIsLoading(false)
      })
  }, [user, wishlistIds.length]) // refetch when items change

  const handleMoveToCart = async (product: WishlistProduct) => {
    addItem(product.id, 1, { price: Number(product.price), name: product.name })
    await removeFromWishlist(product.id)
    setProducts(prev => prev.filter(p => p.id !== product.id))
    showToast('success', `${product.name} moved to cart`)
  }

  const handleRemove = async (product: WishlistProduct) => {
    await removeFromWishlist(product.id)
    setProducts(prev => prev.filter(p => p.id !== product.id))
    showToast('info', `${product.name} removed from wishlist`)
  }

  const handleMoveAllToCart = async () => {
    for (const product of products) {
      if (product.stock > 0) {
        addItem(product.id, 1, { price: Number(product.price), name: product.name })
        await removeFromWishlist(product.id)
      }
    }
    const moved = products.filter(p => p.stock > 0)
    setProducts(prev => prev.filter(p => p.stock === 0))
    showToast('success', `${moved.length} item${moved.length !== 1 ? 's' : ''} moved to cart`)
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[var(--surface-1)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--surface-1)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
          <div className="bg-[var(--surface-0)] rounded-3xl border border-[var(--border-subtle)] p-12 max-w-md mx-auto">
            <Heart className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">Sign in to view your wishlist</h1>
            <p className="text-[var(--text-secondary)] mb-6">Save products you love for later</p>
            <Link href="/account/login?redirect=/wishlist">
              <Button variant="primary" size="lg">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              My Wishlist
            </h1>
            <p className="text-[var(--text-secondary)] mt-1 font-medium">
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </p>
          </div>
          {products.length > 0 && (
            <Button
              variant="primary"
              size="md"
              leftIcon={<ShoppingCart className="w-4 h-4" />}
              onClick={handleMoveAllToCart}
            >
              Move All to Cart
            </Button>
          )}
        </div>

        {products.length === 0 ? (
          <div className="bg-[var(--surface-0)] rounded-3xl border border-[var(--border-subtle)] border-dashed p-12 text-center">
            <Heart className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">Your wishlist is empty</h2>
            <p className="text-[var(--text-secondary)] mb-6">Start adding products you love</p>
            <Link href="/products">
              <Button variant="primary" leftIcon={<ArrowRight className="w-4 h-4" />}>
                Browse Products
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => {
              const discount = Math.round(
                (1 - Number(product.price) / Number(product.mrp)) * 100
              )

              return (
                <div
                  key={product.id}
                  className="bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group"
                >
                  {/* Image */}
                  <Link href={`/products/${product.slug}`}>
                    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-2)]">
                      <FallbackImage
                        src={product.images[0]?.url}
                        alt={product.images[0]?.altText || product.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      />
                      {discount > 0 && (
                        <div className="absolute top-3 left-3">
                          <Badge variant="success" size="sm">{discount}% OFF</Badge>
                        </div>
                      )}
                      {product.stock === 0 && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="bg-white/90 text-gray-900 px-4 py-2 rounded-full font-semibold text-sm">
                            Out of Stock
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="p-5">
                    {product.category && (
                      <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                        {product.category.name}
                      </p>
                    )}
                    <Link href={`/products/${product.slug}`}>
                      <h3 className="font-semibold text-[var(--text-primary)] line-clamp-2 mt-1 group-hover:text-[var(--brand-primary)] transition-colors">
                        {product.name}
                      </h3>
                    </Link>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
                        ₹{product.price}
                      </span>
                      {Number(product.mrp) > Number(product.price) && (
                        <span className="text-sm line-through text-[var(--text-tertiary)] tabular-nums">
                          ₹{product.mrp}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-[var(--border-base)]">
                      <Button
                        className="flex-1"
                        variant="primary-brand"
                        size="sm"
                        leftIcon={<ShoppingCart className="w-4 h-4" />}
                        onClick={() => handleMoveToCart(product)}
                        disabled={product.stock === 0}
                      >
                        Move to Cart
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(product)}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950 px-3"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
