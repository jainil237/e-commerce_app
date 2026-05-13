'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCart, useToast, useStoreConfig } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import styles from './cart.module.css'

interface CartProduct {
  id: string
  name: string
  slug: string
  price: string
  mrp: string
  stock: number
  availableStock: number
  gstPercent: number
  images: Array<{ url: string }>
}

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, totalItems, isHydrated } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()
  const [products, setProducts] = useState<Record<string, CartProduct>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Fetch product details for display whenever items change
  useEffect(() => {
    if (!isHydrated) return

    async function fetchProducts() {
      if (items.length === 0) {
        setProducts({})
        setIsLoading(false)
        return
      }

      try {
        const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cartSessionId') || undefined : undefined
        const res = await fetch('/api/v1/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            sessionId,
          }),
        })
        const data = await res.json()

        const productMap: Record<string, CartProduct> = {}
        if (data.data?.items) {
          for (const item of data.data.items) {
            if (item.product) {
              productMap[item.productId] = {
                ...item.product,
                availableStock: item.availableStock ?? item.product.stock,
              }
            }
          }
        }
        setProducts(productMap)
      } catch (err) {
        console.error('Failed to validate cart', err)
      }
      setIsLoading(false)
    }
    fetchProducts()
  }, [items, isHydrated])

  const shipping = subtotal >= config.shipping.freeShippingAbove ? 0 : config.shipping.baseShippingCharge
  const total = subtotal + shipping

  // Determine if any cart item exceeds available stock
  const hasStockErrors = items.some(item => {
    const product = products[item.productId]
    return product ? item.quantity > product.availableStock : false
  })

  if (!isHydrated || isLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className="skeleton h-10 w-48 mb-8 rounded-lg" />
          <div className={styles.layoutGrid}>
            <div className={styles.itemsColumn}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.itemCard}>
                  <div className="skeleton w-24 h-24 sm:w-28 sm:h-28 rounded-xl" />
                  <div className="flex-1 space-y-3 py-2">
                    <div className="skeleton h-5 w-3/4 rounded" />
                    <div className="skeleton h-4 w-1/4 rounded" />
                    <div className="skeleton h-8 w-1/3 rounded mt-4" />
                  </div>
                </div>
              ))}
            </div>
            <div className="skeleton h-[350px] rounded-2xl sticky top-24" />
          </div>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIconWrapper}>
            <ShoppingBag className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Your cart is empty</h1>
          <p className="text-gray-500 mb-8 dark:text-gray-400">Looks like you haven't added anything to your cart yet.</p>
          <Link href="/products">
            <Button size="lg" variant="primary">
              Start Shopping
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Shopping Cart ({totalItems} items)</h1>

        <div className={styles.layoutGrid}>
          {/* Cart Items */}
          <div className={styles.itemsColumn}>
            {items.map(item => {
              const product = products[item.productId]
              const displayName = product?.name || item.name || 'Loading…'
              const unitPrice = product ? Number(product.price) : item.price
              const unitMrp = product ? Number(product.mrp) : item.price
              const itemSubtotal = unitPrice * item.quantity
              const itemMrp = unitMrp * item.quantity
              const discount = itemMrp - itemSubtotal

              return (
                <div key={item.productId} className={styles.itemCard}>
                  {/* Image */}
                  <Link href={product ? `/products/${product.slug}` : '#'} className={styles.itemImageWrapper}>
                    <FallbackImage
                      src={product?.images?.[0]?.url}
                      alt={displayName}
                      fill
                      className={styles.itemImage}
                    />
                  </Link>

                  {/* Content */}
                  <div className={styles.itemContent}>
                    
                    <div className={styles.itemHeaderRow}>
                      <div>
                        <Link
                          href={product ? `/products/${product.slug}` : '#'}
                          className={styles.itemTitle}
                          title={displayName}
                        >
                          {displayName}
                        </Link>
                        {product && (
                          <p className={styles.itemMeta}>GST: {product.gstPercent}%</p>
                        )}
                      </div>
                      
                      <div className={styles.priceBlock}>
                        <p className={styles.itemTotal}>₹{itemSubtotal.toFixed(0)}</p>
                        {discount > 0 && (
                          <p className={styles.itemDiscount}>Save ₹{discount.toFixed(0)}</p>
                        )}
                      </div>
                    </div>

                    <div className={styles.priceBreakdown}>
                      <span className={styles.unitPrice}>₹{unitPrice.toFixed(0)}</span>
                      {discount > 0 && (
                         <span className={styles.unitMrp}>₹{unitMrp.toFixed(0)}</span>
                      )}
                    </div>

                    <div className={styles.controlsRow}>
                      <div className={styles.quantityCtrl}>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className={styles.quantityBtn}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className={styles.quantityValue}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className={styles.quantityBtn}
                          disabled={product ? item.quantity >= product.availableStock : false}
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {product && item.quantity > product.availableStock && (
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                          Only {product.availableStock} available
                        </span>
                      )}

                      <button
                        onClick={() => {
                          removeItem(item.productId)
                          showToast('info', 'Item removed from cart')
                        }}
                        className={styles.removeBtn}
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="mt-6 flex justify-center">
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                onClick={() => {
                  clearCart()
                  showToast('info', 'Cart cleared')
                }}
              >
                Clear Entire Cart
              </Button>
            </div>
          </div>

          {/* Order Summary */}
          <div>
            <div className={styles.summaryCard}>
              <h2 className={styles.summaryTitle}>Order Summary</h2>

              <div className="space-y-4">
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span className={styles.summaryValue}>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Shipping</span>
                  <span className={styles.summaryValue}>{shipping === 0 ? 'FREE' : `₹${shipping}`}</span>
                </div>
                
                {shipping > 0 && subtotal > 0 && (
                  <div className={styles.freeShippingNotice}>
                    Add ₹{(config.shipping.freeShippingAbove - subtotal).toFixed(2)} more for free delivery
                  </div>
                )}
              </div>

              <hr className={styles.divider} />

              <div>
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Total</span>
                  <span className={styles.totalValue}>₹{total.toFixed(2)}</span>
                </div>
                <p className={styles.taxesNotice}>Inclusive of all taxes</p>
              </div>

              <div className={styles.actions}>
                {hasStockErrors && (
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                    Please adjust quantities to match available stock before checkout.
                  </p>
                )}
                <Link href={hasStockErrors ? '#' : '/checkout'} className="block w-full">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={hasStockErrors}
                    rightIcon={<ArrowRight className="w-5 h-5" />}
                  >
                    Proceed to Checkout
                  </Button>
                </Link>

                <Link href="/products" className="block w-full">
                  <Button variant="secondary" size="md" className="w-full">
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
