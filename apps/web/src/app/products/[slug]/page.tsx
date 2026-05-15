'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { useCart, useToast, useStoreConfig, useAuth, useWishlist } from '@/components/providers'
import { refreshSnapshot, getSnapshot } from '@/lib/inventory-snapshot'
import { Button } from '@/components/atoms/Button/Button'
import styles from './product.module.css'
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
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 mt-4">
            <div className="lg:col-span-5 xl:col-span-6 skeleton aspect-[4/5] rounded-3xl" />
            <div className="lg:col-span-7 xl:col-span-6 space-y-6 mt-4">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-12 w-3/4" />
              <div className="skeleton h-10 w-1/3" />
              <div className="skeleton h-32 mt-8" />
              <div className="skeleton h-16 mt-8" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className={styles.wrapper}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center flex flex-col items-center justify-center">
          <div className="w-24 h-24 bg-[var(--surface-2)] rounded-full flex items-center justify-center mb-6">
            <Package className="w-12 h-12 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-3xl font-black mb-4 text-[var(--text-primary)]">Product not found</h1>
          <p className="text-[var(--text-secondary)] mb-8 max-w-md">The product you're looking for doesn't exist or has been removed.</p>
          <Link href="/products">
            <Button variant="primary" size="lg">Browse all products</Button>
          </Link>
        </div>
      </div>
    )
  }

  const snapshot = product ? getSnapshot(product.id) : null
  const effectiveStock = snapshot?.effectiveAvailableQty ?? product.stock
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
    <div className={styles.wrapper}>
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
  )
}
