'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react'
import { useCart, useToast, useStoreConfig } from '@/contexts'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { CartProduct } from '@shared/types'
import './cart.scss'

// This page's own /cart/validate response always includes availableStock,
// unlike checkout's — the shared type leaves it optional because checkout's
// validate-checkout endpoint doesn't return it.
type CartPageProduct = CartProduct & { availableStock: number }

export default function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, totalItems, isHydrated } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()
  const [products, setProducts] = useState<Record<string, CartPageProduct>>({})
  const [isLoading, setIsLoading] = useState(true)

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
        // Found during 320px reflow QA: this pointed at /cart/validate, which
        // does not exist on the server (cart.routes.ts only has /snapshot and
        // /validate-checkout). Every request 404'd, silently — the catch below
        // only logs — so the cart page has never actually enriched items with
        // live price/stock/images; every stock-limit UI element was inert.
        const res = await fetch('/api/v1/cart/validate-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
            sessionId,
          }),
        })
        const data = await res.json()

        const productMap: Record<string, CartPageProduct> = {}
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

  const hasStockErrors = items.some(item => {
    const product = products[item.productId]
    return product ? item.quantity > product.availableStock : false
  })

  if (!isHydrated || isLoading) {
    return (
      <div className="ms-cart">
        <div className="ms-cart__container">
          <div className="ms-cart-skeleton__title" />
          <div className="ms-cart-layout">
            <div className="ms-cart-items">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="ms-cart-skeleton__item">
                  <div className="ms-cart-skeleton__image" />
                  <div className="ms-cart-skeleton__content">
                    <div className="ms-cart-skeleton__line ms-cart-skeleton__line--lg" />
                    <div className="ms-cart-skeleton__line ms-cart-skeleton__line--sm" />
                    <div className="ms-cart-skeleton__line ms-cart-skeleton__line--md" />
                  </div>
                </div>
              ))}
            </div>
            <div className="ms-cart-skeleton__summary" />
          </div>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="ms-cart">
        <div className="ms-cart__container">
          <div className="ms-cart-empty">
            <div className="ms-cart-empty__icon">
              <ShoppingBag size={40} />
            </div>
            <h1 className="ms-cart-empty__title">Your cart is empty</h1>
            <p className="ms-cart-empty__sub">Looks like you haven&apos;t added anything to your cart yet.</p>
            <Link href="/products">
              <Button size="lg" variant="primary">Start Shopping</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ms-cart">
      <div className="ms-cart__container">
        <h1 className="ms-cart__title">Shopping Cart ({totalItems} items)</h1>

        <div className="ms-cart-layout">
          {/* Cart Items */}
          <div className="ms-cart-items">
            {items.map(item => {
              const product = products[item.productId]
              const displayName = product?.name || item.name || 'Loading…'
              const unitPrice = product ? Number(product.price) : item.price
              const unitMrp = product ? Number(product.mrp) : item.price
              const itemSubtotal = unitPrice * item.quantity
              const itemMrp = unitMrp * item.quantity
              const discount = itemMrp - itemSubtotal

              return (
                <div key={item.productId} className="ms-cart-item">
                  <Link href={product ? `/products/${product.slug}` : '#'} className="ms-cart-item__image">
                    <FallbackImage
                      src={product?.images?.[0]?.url}
                      alt={displayName}
                      fill
                      className="object-cover"
                    />
                  </Link>

                  <div className="ms-cart-item__content">
                    <div className="ms-cart-item__header">
                      <div>
                        <Link
                          href={product ? `/products/${product.slug}` : '#'}
                          className="ms-cart-item__name"
                          title={displayName}
                        >
                          {displayName}
                        </Link>
                        {product && (
                          <p className="ms-cart-item__meta">GST: {product.gstPercent}%</p>
                        )}
                      </div>

                      <div className="ms-cart-item__price-block">
                        <p className="ms-cart-item__total">₹{itemSubtotal.toFixed(0)}</p>
                        {discount > 0 && (
                          <p className="ms-cart-item__discount">Save ₹{discount.toFixed(0)}</p>
                        )}
                      </div>
                    </div>

                    <div className="ms-cart-item__breakdown">
                      <span className="ms-cart-item__unit-price">₹{unitPrice.toFixed(0)}</span>
                      {discount > 0 && (
                        <span className="ms-cart-item__unit-mrp">₹{unitMrp.toFixed(0)}</span>
                      )}
                    </div>

                    <div className="ms-cart-item__controls">
                      <div className="ms-cart-item__qty">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="ms-cart-item__qty-btn"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="ms-cart-item__qty-value">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="ms-cart-item__qty-btn"
                          disabled={product ? item.quantity >= product.availableStock : false}
                          aria-label="Increase quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      {product && item.quantity > product.availableStock && (
                        <span className="ms-cart-item__stock-error">
                          Only {product.availableStock} available
                        </span>
                      )}

                      <button
                        onClick={() => {
                          removeItem(item.productId)
                          showToast('info', 'Item removed from cart')
                        }}
                        className="ms-cart-item__remove"
                        aria-label="Remove item"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="ms-cart-clear">
              <Button
                variant="ghost"
                className="ms-btn--ghost-danger"
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
            <div className="ms-cart-summary">
              <h2 className="ms-cart-summary__title">Order Summary</h2>

              <div className="ms-cart-summary__rows">
                <div className="ms-cart-summary__row">
                  <span>Subtotal</span>
                  <span className="ms-cart-summary__value">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="ms-cart-summary__row">
                  <span>Shipping</span>
                  <span className="ms-cart-summary__value">{shipping === 0 ? 'FREE' : `₹${shipping}`}</span>
                </div>

                {shipping > 0 && subtotal > 0 && (
                  <div className="ms-cart-summary__shipping-notice">
                    Add ₹{(config.shipping.freeShippingAbove - subtotal).toFixed(2)} more for free delivery
                  </div>
                )}
              </div>

              <hr className="ms-cart-summary__divider" />

              <div>
                <div className="ms-cart-summary__total-row">
                  <span className="ms-cart-summary__total-label">Total</span>
                  <span className="ms-cart-summary__total-value">₹{total.toFixed(2)}</span>
                </div>
                <p className="ms-cart-summary__tax">Inclusive of all taxes</p>
              </div>

              <div className="ms-cart-summary__actions">
                {hasStockErrors && (
                  <p className="ms-cart-summary__stock-error">
                    Please adjust quantities to match available stock before checkout.
                  </p>
                )}
                <Link href={hasStockErrors ? '#' : '/checkout'} className="block w-full">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={hasStockErrors}
                    rightIcon={<ArrowRight size={20} />}
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
