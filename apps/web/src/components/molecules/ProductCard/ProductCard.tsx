'use client'
import './product-card.scss'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { ShoppingCart, Heart, Info } from 'lucide-react'
import { useCart } from '@/contexts/cart.context'
import { useToast } from '@/contexts/toast.context'
import { useAuth } from '@/contexts/auth.context'
import { useWishlist } from '@/contexts/wishlist.context'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Badge } from '@/components/atoms/Badge/Badge'

interface Product {
  id: string
  slug: string
  name: string
  price: string
  mrp: string
  images: Array<{ url: string; altText?: string }>
  category?: { name: string }
  stock?: number
}

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart()
  const { showToast } = useToast()
  const { user } = useAuth()
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist()

  const titleRef = useRef<HTMLHeadingElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const check = () => setIsTruncated(el.scrollHeight > el.clientHeight)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [product.name])

  const discount = Math.round((1 - Number(product.price) / Number(product.mrp)) * 100)
  const wishlisted = isInWishlist(product.id)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem(product.id, 1, { price: Number(product.price), name: product.name })
    showToast('success', 'Added to cart')
  }

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { showToast('info', 'Sign in to save to wishlist'); return }
    if (wishlisted) {
      await removeFromWishlist(product.id)
      showToast('info', 'Removed from wishlist')
    } else {
      await addToWishlist(product.id)
      showToast('success', 'Added to wishlist')
    }
  }

  return (
    <Link href={`/products/${product.slug}`} className="ms-pc">
      <div className="ms-pc__image">
        <FallbackImage
          src={product.images[0]?.url}
          alt={product.images[0]?.altText || product.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {discount > 0 && (
          <div className="ms-pc__badges">
            <Badge variant="success" size="sm">{discount}% OFF</Badge>
          </div>
        )}
        <button
          onClick={handleWishlistToggle}
          className={`ms-pc__wish${wishlisted ? ' ms-pc__wish--active' : ''}`}
          aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart width={18} height={18} fill={wishlisted ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="ms-pc__body">
        <p className="ms-pc__cat">{product.category?.name || ' '}</p>
        <div style={{ position: 'relative' }}>
          <h3 ref={titleRef} className="ms-pc__name">{product.name}</h3>
          {isTruncated && (
            <span className="ms-pc__info-btn">
              <Info width={14} height={14} />
              <span className="ms-pc__tooltip">{product.name}</span>
            </span>
          )}
        </div>
        <div className="ms-pc__price-row">
          <span className="ms-pc__price">₹{product.price}</span>
          {Number(product.mrp) > Number(product.price) && (
            <span className="ms-pc__mrp">₹{product.mrp}</span>
          )}
        </div>
      </div>

      <div className="ms-pc__foot">
        <Button
          variant="primary-brand"
          size="md"
          leftIcon={<ShoppingCart width={16} height={16} />}
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className="w-full"
        >
          {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </Button>
      </div>
    </Link>
  )
}
