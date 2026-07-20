'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { useCart, useToast, useStoreConfig, useAuth, useWishlist } from '@/contexts'
import { refreshSnapshot, getSnapshot } from '@/lib/inventory-snapshot'
import { Button } from '@/components/atoms/Button/Button'
import './pdp.scss'
import { ProductDetailsPage } from '@shared/pages/product/ProductDetailsPage'
import { useGetProductBySlugQuery } from '@shared/api/productsApi'

export default function ProductDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const { addItem, items: cartItems } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()
  const { user } = useAuth()
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist()

  const { data, isLoading } = useGetProductBySlugQuery(slug)
  const product = data?.data ?? null

  // The stock-reservation snapshot cache (W-13's territory) is unrelated to
  // this page's own data fetching and stays as-is here — it is consumed by
  // cart.context's addItem/updateQuantity validation, which this phase does
  // not touch. Only the product fetch itself moves to RTK Query.
  const productId = product?.id
  useEffect(() => {
    // Keyed on the id, not the `product` object: RTK Query gives that object a
    // new identity on every background refetch, and this must only fire when
    // the actual product changes — matching the old effect's [slug] keying.
    if (productId) {
      refreshSnapshot(productId).catch(() => {})
    }
  }, [productId])

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

  const handleAddToCart = async (quantity: number) => {
    if (isAddToCartDisabled) return
    const added = await addItem(product.id, quantity, { price: Number(product.price), name: product.name })
    if (added) showToast('success', `Added ${quantity} item${quantity > 1 ? 's' : ''} to cart`)
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
