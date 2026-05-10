'use client'

import Link from 'next/link'
import { ShoppingCart, Heart } from 'lucide-react'
import { useCart, useToast, useAuth, useWishlist } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Badge } from '@/components/atoms/Badge/Badge'
import styles from './ProductCard.module.css'

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

    if (!user) {
      showToast('info', 'Sign in to save to wishlist')
      return
    }

    if (wishlisted) {
      await removeFromWishlist(product.id)
      showToast('info', 'Removed from wishlist')
    } else {
      await addToWishlist(product.id)
      showToast('success', 'Added to wishlist')
    }
  }

  return (
    <Link href={`/products/${product.slug}`} className="group outline-none">
      <div className={styles.productCard}>
        
        {/* Image Area */}
        <div className={styles.imageSection}>
          <FallbackImage
            src={product.images[0]?.url}
            alt={product.images[0]?.altText || product.name}
            fill
            className={styles.image}
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {discount > 0 && (
            <div className={styles.badges}>
              <Badge variant="success" size="sm">
                {discount}% OFF
              </Badge>
            </div>
          )}
          {/* Wishlist Heart */}
          <button
            onClick={handleWishlistToggle}
            className={styles.wishlistBtn}
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart
              className={`w-5 h-5 transition-all duration-200 ${
                wishlisted
                  ? 'fill-red-500 text-red-500 scale-110'
                  : 'fill-transparent text-white drop-shadow-md hover:text-red-400'
              }`}
            />
          </button>
        </div>

        {/* Content Area */}
        <div className={styles.content}>
          <div>
            {product.category && (
              <p className={styles.category}>{product.category.name}</p>
            )}
            <h3 className={styles.title} title={product.name}>
              {product.name}
            </h3>
          </div>

          {/* Pricing */}
          <div className={styles.priceSection}>
            <div className="flex items-center gap-2">
              <span className={styles.price}>₹{product.price}</span>
              {Number(product.mrp) > Number(product.price) && (
                <span className={styles.mrp}>₹{product.mrp}</span>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <Button
              className="w-full"
              variant="primary-brand"
              size="md"
              leftIcon={<ShoppingCart className="w-4 h-4" />}
              onClick={handleAddToCart}
              disabled={product.stock === 0}
            >
              {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
            </Button>
          </div>
        </div>

      </div>
    </Link>
  )
}
