'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Heart, Loader2, ShoppingCart, Trash2, ArrowRight } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { useWishlist } from '@/contexts/wishlist.context'
import { useCart } from '@/contexts/cart.context'
import { useToast } from '@/contexts/toast.context'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Badge } from '@/components/atoms/Badge/Badge'
import './wishlist.scss'

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
      <div className="ms-wishlist">
        <div className="ms-wishlist__spinner-wrap">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="ms-wishlist">
        <div className="ms-wishlist__spinner-wrap">
          <div className="ms-wishlist-gate">
            <Heart className="ms-wishlist-gate__icon" />
            <h1 className="ms-wishlist-gate__title">Sign in to view your wishlist</h1>
            <p className="ms-wishlist-gate__text">Save products you love for later</p>
            <Link href="/account/login?redirect=/wishlist">
              <Button variant="primary" size="lg">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ms-wishlist">
      <div className="ms-wishlist__container">
        <div className="ms-wishlist__header">
          <div>
            <h1 className="ms-wishlist__title">My Wishlist</h1>
            <p className="ms-wishlist__count">
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
          <div className="ms-wishlist-empty">
            <Heart className="ms-wishlist-empty__icon" />
            <h2 className="ms-wishlist-empty__title">Your wishlist is empty</h2>
            <p className="ms-wishlist-empty__text">Start adding products you love</p>
            <Link href="/products">
              <Button variant="primary" leftIcon={<ArrowRight className="w-4 h-4" />}>
                Browse Products
              </Button>
            </Link>
          </div>
        ) : (
          <div className="ms-wishlist-grid">
            {products.map((product) => {
              const discount = Math.round(
                (1 - Number(product.price) / Number(product.mrp)) * 100
              )

              return (
                <div key={product.id} className="ms-wishlist-card">
                  <Link href={`/products/${product.slug}`}>
                    <div className="ms-wishlist-card__image-wrap">
                      <FallbackImage
                        src={product.images[0]?.url}
                        alt={product.images[0]?.altText || product.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      />
                      {discount > 0 && (
                        <div className="ms-wishlist-card__discount">
                          <Badge variant="success" size="sm">{discount}% OFF</Badge>
                        </div>
                      )}
                      {product.stock === 0 && (
                        <div className="ms-wishlist-card__oos-overlay">
                          <span className="ms-wishlist-card__oos-badge">Out of Stock</span>
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="ms-wishlist-card__body">
                    {product.category && (
                      <p className="ms-wishlist-card__category">{product.category.name}</p>
                    )}
                    <Link href={`/products/${product.slug}`}>
                      <h3 className="ms-wishlist-card__name">{product.name}</h3>
                    </Link>

                    <div className="ms-wishlist-card__price-row">
                      <span className="ms-wishlist-card__price">₹{product.price}</span>
                      {Number(product.mrp) > Number(product.price) && (
                        <span className="ms-wishlist-card__mrp">₹{product.mrp}</span>
                      )}
                    </div>

                    <div className="ms-wishlist-card__actions">
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
                        className="ms-wishlist-card__remove"
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
