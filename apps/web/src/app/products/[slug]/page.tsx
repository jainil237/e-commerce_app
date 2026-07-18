'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { useCart, useToast, useStoreConfig, useAuth, useWishlist } from '@/contexts'
import { refreshSnapshot, getSnapshot } from '@/lib/inventory-snapshot'
import { Button } from '@/components/atoms/Button/Button'
import './pdp.scss'
import { ProductDetailsPage } from '@shared/pages/product/ProductDetailsPage'

interface Product {
  id: string
  slug: string
  name: string
  description: string
  price: string
  mrp: string
  stock: number
  sku: string
  gstPercent: number
  weight?: number
  tags?: string[]
  images: Array<{ url: string; altText?: string; sortOrder: number }>
  category: { id: string; name: string; slug: string }
}

export default function ProductDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const { addItem, items: cartItems } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()
  const { user } = useAuth()
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist()

  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchProduct() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/v1/products/${slug}`)
        const data = await res.json()
        const fetchedProduct = data.data || null
        setProduct(fetchedProduct)
        if (fetchedProduct) {
          refreshSnapshot(fetchedProduct.id).catch(() => {})
        }
      } catch (error) {
        console.error("Failed to fetch product", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchProduct()
  }, [slug])

  if (isLoading) {
    return (
      <div className="ms-pdp">
        <div className="ms-pdp__container">
          <div className="ms-pdp-skeleton">
            <div className="ms-pdp-skeleton__image" />
            <div className="ms-pdp-skeleton__lines">
              <div className="ms-pdp-skeleton__line ms-pdp-skeleton__line--sm" />
              <div className="ms-pdp-skeleton__line ms-pdp-skeleton__line--md" />
              <div className="ms-pdp-skeleton__line ms-pdp-skeleton__line--lg" />
              <div className="ms-pdp-skeleton__line ms-pdp-skeleton__line--xl" />
              <div className="ms-pdp-skeleton__line ms-pdp-skeleton__line--cta" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="ms-pdp">
        <div className="ms-pdp__container">
          <div className="ms-pdp-not-found">
            <div className="ms-pdp-not-found__icon">
              <Package size={48} />
            </div>
            <h1 className="ms-pdp-not-found__title">Product not found</h1>
            <p className="ms-pdp-not-found__sub">The product you&apos;re looking for doesn&apos;t exist or has been removed.</p>
            <Link href="/products">
              <Button variant="primary" size="lg">Browse all products</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const snapshot = product ? getSnapshot(product.id) : null
  const effectiveStock = snapshot?.availableQty ?? product.stock
  const existingCartItem = cartItems.find(item => item.productId === product?.id)
  const existingCartQty = existingCartItem?.quantity || 0
  const remainingAddable = Math.max(0, effectiveStock - existingCartQty)
  const isAddToCartDisabled = remainingAddable <= 0
  const maxQuantityAllowed = Math.max(1, remainingAddable)

  const handleAddToCart = (quantity: number) => {
    if (isAddToCartDisabled) return
    addItem(product.id, quantity, { price: Number(product.price), name: product.name })
    showToast('success', `Added ${quantity} item${quantity > 1 ? 's' : ''} to cart`)
  }

  const wishlisted = isInWishlist(product.id)

  const handleWishlistToggle = async () => {
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

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `Check out ${product.name} on ${config.store.name}`,
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        showToast('success', 'Link copied to clipboard')
      }
    } catch (err) {
      console.error('Share failed', err)
    }
  }

  return (
    <div className="ms-pdp">
      <div className="ms-pdp__container">
        <ProductDetailsPage
          product={product as any}
          viewer="customer"
          onAddToCart={handleAddToCart}
          onWishlistToggle={handleWishlistToggle}
          onShare={handleShare}
          isInWishlist={wishlisted}
          isAddToCartDisabled={isAddToCartDisabled}
          maxQuantityAllowed={maxQuantityAllowed}
          cartQuantity={existingCartQty}
        />
      </div>
    </div>
  )
}
