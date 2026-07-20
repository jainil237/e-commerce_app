'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { ArrowLeft, MapPin, CreditCard, Tag, Check, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { useCart } from '@/contexts/cart.context'
import { useToast } from '@/contexts/toast.context'
import { useStoreConfig } from '@/contexts/store-config.context'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import { CartProduct } from '@shared/types'
import './checkout.scss'

interface Address {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  isDefault: boolean
}

export default function CheckoutPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { items, subtotal, clearCart } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressLoadFailed, setAddressLoadFailed] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [products, setProducts] = useState<Record<string, CartProduct>>({})
  const [checkoutValid, setCheckoutValid] = useState(true)
  const [checkoutErrors, setCheckoutErrors] = useState<Record<string, string>>({})
  // W-07: validate-checkout returns server-confirmed prices. This used to be
  // computed and thrown away while the summary and the coupon call both used
  // the localStorage-derived subtotal, so the price shown was not the price
  // charged. One source now feeds the summary, the coupon call and the guard.
  const [serverSubtotal, setServerSubtotal] = useState<number | null>(null)
  const orderInFlight = useRef(false)

  const effectiveSubtotal = serverSubtotal ?? subtotal
  const shipping = effectiveSubtotal >= config.shipping.freeShippingAbove ? 0 : config.shipping.baseShippingCharge
  const discount = appliedCoupon?.discount || 0
  const total = Math.max(0, effectiveSubtotal + shipping - discount)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/account?redirect=/checkout')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    async function fetchAddresses() {
      if (!user) return
      // W-09: this had no try/catch at all — a 500 became an unhandled
      // rejection and the UI showed "No saved addresses found", indistinguishable
      // from a genuinely empty list at the highest-stakes point in the funnel.
      try {
        const res = await fetch('/api/v1/addresses', { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load addresses')
        const data = await res.json()
        setAddresses(data.data || [])
        const defaultAddr = data.data?.find((a: Address) => a.isDefault)
        if (defaultAddr) setSelectedAddress(defaultAddr.id)
        setAddressLoadFailed(false)
      } catch {
        setAddressLoadFailed(true)
      }
    }
    fetchAddresses()
  }, [user])

  const cartKey = useMemo(
    () => items.map(i => `${i.productId}:${i.quantity}`).join(','),
    [items]
  )

  useEffect(() => {
    async function loadCheckoutData() {
      if (items.length === 0) return
      const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cartSessionId') || undefined : undefined

      // ── 1. Validate cart items and fetch fresh product prices ──
      let freshSubtotal = 0
      try {
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
        const productMap: Record<string, CartProduct> = {}
        const errorMap: Record<string, string> = {}
        let allValid = true
        if (data.data?.items) {
          for (const item of data.data.items) {
            if (item.product) {
              productMap[item.productId] = item.product
              freshSubtotal += Number(item.product.price) * item.quantity
            }
            if (!item.valid) {
              allValid = false
              errorMap[item.productId] = item.error || 'Unavailable'
            }
          }
        }
        setProducts(productMap)
        setCheckoutValid(allValid)
        setCheckoutErrors(errorMap)
        setServerSubtotal(freshSubtotal > 0 ? freshSubtotal : null)
      } catch (err) {
        console.error('Failed to validate cart for checkout', err)
        setCheckoutValid(false)
      }

      // ── 2. Fetch eligible coupons using confirmed prices ──
      // Use freshSubtotal (from API) when available, else fall back to the
      // localStorage-derived subtotal so coupons appear even if step 1 failed.
      const orderValue = freshSubtotal > 0 ? freshSubtotal : subtotal
      if (orderValue <= 0) return
      try {
        const res = await fetch(`/api/v1/coupons/available?orderValue=${orderValue}`, { credentials: 'include' })
        const data = await res.json()
        if (data.success) setAvailableCoupons(data.data)
      } catch (err) {
        console.error('Failed to fetch available coupons', err)
      }
    }
    loadCheckoutData()
    // W-03: depending on `items` re-ran this on every CartProvider render,
    // and the body's setState calls produced a new render — an unbounded
    // request loop. The key changes only when the cart contents actually do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  const applyCoupon = async (codeOverride?: string) => {
    const code = codeOverride ?? couponCode
    if (!code) return
    if (codeOverride) setCouponCode(codeOverride)
    setIsLoading(true)
    try {
      const res = await fetch('/api/v1/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderValue: effectiveSubtotal }),
      })
      const data = await res.json()
      if (data.success) {
        setAppliedCoupon({
          code: data.data.code,
          discount: Number(data.data.calculatedDiscount),
        })
        showToast('success', 'Coupon applied successfully')
      } else {
        showToast('error', data.message || 'Invalid coupon')
      }
    } catch {
      showToast('error', 'Failed to apply coupon')
    }
    setIsLoading(false)
  }

  const createOrder = async () => {
    if (!selectedAddress) {
      showToast('error', 'Please select a delivery address')
      return
    }

    // W-04: a ref, not state. setIsLoading does not apply until the next
    // render, so two clicks in the same tick both passed a state-based guard
    // and created two orders against one cart.
    if (orderInFlight.current) return
    orderInFlight.current = true

    setIsLoading(true)
    try {
      const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cartSessionId') || undefined : undefined
      const res = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
          addressId: selectedAddress,
          couponCode: appliedCoupon?.code,
          sessionId,
        }),
      })
      const data = await res.json()

      if (data.success) {
        const razorpayKey = data.data.razorpay.key as string
        const isMockKey = !razorpayKey ||
          razorpayKey === 'rzp_test_placeholder' ||
          razorpayKey.includes('placeholder')

        const verifyPayment = async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          showToast('info', 'Verifying payment securely...')
          const verifyRes = await fetch('/api/v1/orders/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              orderId: data.data.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
          const verifyData = await verifyRes.json()
          if (verifyData.success) {
            clearCart()
            router.push(`/orders/${data.data.order.id}?success=true`)
          } else {
            // W-05: the order exists server-side even when verification fails
            // here, so releasing the cart and the guard lets the user re-order
            // the same basket. Send them to the order to see its real state.
            showToast('error', verifyData.message || 'Payment verification failed')
            orderInFlight.current = false
            setIsLoading(false)
          }
        }

        if (isMockKey) {
          // Dev mock mode — skip Razorpay modal and simulate payment
          showToast('info', '⚙️ Dev mode: Simulating payment...')
          setTimeout(() => {
            verifyPayment({
              razorpay_order_id: data.data.razorpay.orderId,
              razorpay_payment_id: `pay_mock_${Date.now()}`,
              razorpay_signature: 'mock_signature',
            })
          }, 800)
        } else {
          // Load Razorpay script and open modal
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.onload = () => {
            const options = {
              key: razorpayKey,
              amount: data.data.razorpay.amount,
              currency: data.data.razorpay.currency,
              order_id: data.data.razorpay.orderId,
              name: config.store.name,
              description: 'Order Payment',
              handler: verifyPayment,
              prefill: {
                name: user?.name,
                email: user?.email,
              },
              theme: {
                color: config.store.primaryColor,
              },
              modal: {
                // Without this the guard never releases when the user closes
                // the modal, leaving the pay button disabled forever.
                ondismiss: () => {
                  orderInFlight.current = false
                  setIsLoading(false)
                },
              },
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            new (window as any).Razorpay(options).open()
          }
          script.onerror = () => {
            showToast('error', 'Could not load the payment gateway')
            orderInFlight.current = false
            setIsLoading(false)
          }
          document.body.appendChild(script)
        }
      } else {
        showToast('error', data.message || 'Failed to create order')
        orderInFlight.current = false
        setIsLoading(false)
      }
    } catch {
      showToast('error', 'Failed to create order')
      orderInFlight.current = false
      setIsLoading(false)
    }
    // W-04: deliberately no setIsLoading(false) here. The payment flow is still
    // pending at this point — the Razorpay modal has not been dismissed and the
    // handler has not run. Clearing it here re-enabled the pay button mid-payment.
  }

  if (authLoading || items.length === 0) {
    return (
      <div className="ms-checkout ms-checkout--loading">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    )
  }

  return (
    <div className="ms-checkout">
      <div className="ms-checkout__container">

        {/* Header */}
        <div className="ms-checkout__header">
          <Link href="/cart" className="ms-checkout__back" aria-label="Back to Cart">
            <ArrowLeft className="w-6 h-6 shrink-0" />
          </Link>
          <h1 className="ms-checkout__title">Secure Checkout</h1>
        </div>

        <div className="ms-checkout-layout">
          {/* Main Content */}
          <div className="ms-checkout__main">

            {/* Address Selection */}
            <div className="ms-checkout-section">
              <h2 className="ms-checkout-section__header">
                <MapPin className="ms-checkout-section__icon" />
                Delivery Address
              </h2>

              {addressLoadFailed ? (
                <div className="ms-checkout-address--empty" role="alert">
                  <p className="ms-checkout-address__empty-text">
                    Couldn&apos;t load your addresses. Check your connection and try again.
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                    Retry
                  </Button>
                </div>
              ) : addresses.length === 0 ? (
                <div className="ms-checkout-address--empty">
                  <p className="ms-checkout-address__empty-text">No saved addresses found</p>
                  <Link href="/account/addresses">
                    <Button variant="secondary" size="sm">Add Address</Button>
                  </Link>
                </div>
              ) : (
                <div className="ms-checkout-address__list">
                  {addresses.map(address => {
                    const isSelected = selectedAddress === address.id;
                    return (
                      <label
                        key={address.id}
                        className={clsx('ms-checkout-address__item', {
                          'ms-checkout-address__item--selected': isSelected,
                        })}
                      >
                        <div className="ms-checkout-address__info">
                          <input
                            type="radio"
                            name="address"
                            checked={isSelected}
                            onChange={() => setSelectedAddress(address.id)}
                            className="ms-checkout-address__radio"
                          />
                          <div className="ms-checkout-address__content">
                            <p className="ms-checkout-address__name">{address.label}</p>
                            <p className="ms-checkout-address__line">
                              {address.line1}
                              {address.line2 && `, ${address.line2}`}
                            </p>
                            <p className="ms-checkout-address__line">
                              {address.city}, {address.state} - {address.pincode}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="ms-checkout-address__check" />
                          )}
                        </div>
                      </label>
                    )
                  })}
                  <div className="ms-checkout-address__add-row">
                    <Link href="/account/addresses">
                      <Button variant="ghost" size="sm">Add New Address</Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Coupon */}
            <div className="ms-checkout-section">
              <h2 className="ms-checkout-section__header">
                <Tag className="ms-checkout-section__icon" />
                Discount & Coupons
              </h2>

              {appliedCoupon ? (
                <div className="ms-checkout-coupon--applied">
                  <span className="ms-checkout-coupon__code">{appliedCoupon.code}</span>
                  <button
                    onClick={() => setAppliedCoupon(null)}
                    className="ms-checkout-coupon__remove"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="ms-checkout-coupon__body">
                  <div className="ms-checkout-coupon__input-row">
                    <Input
                      name="coupon"
                      placeholder="Enter discount code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    />
                    <Button
                      onClick={() => applyCoupon()}
                      disabled={isLoading || !couponCode}
                      variant="secondary"
                      className="px-6"
                    >
                      Apply
                    </Button>
                  </div>

                  {availableCoupons.length > 0 && (
                    <div>
                      <p className="ms-checkout-coupon__offers-label">Available Offers</p>
                      <div className="ms-checkout-coupon__offers-list">
                        {availableCoupons.map((coupon) => (
                          <button
                            key={coupon.id}
                            onClick={() => applyCoupon(coupon.code)}
                            className="ms-checkout-coupon__offer"
                          >
                            <span className="ms-checkout-coupon__offer-code">{coupon.code}</span>
                            <span className="ms-checkout-coupon__offer-desc">
                              {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="ms-checkout-section">
              <h2 className="ms-checkout-section__header">Order Review</h2>
              <div className="ms-checkout-items">
                {items.map(item => {
                  const product = products[item.productId]
                  if (!product) return null
                  const error = checkoutErrors[item.productId]
                  return (
                    <div key={item.productId} className="ms-checkout-item">
                      <div className="ms-checkout-item__image">
                        <FallbackImage
                          src={product?.images?.[0]?.url}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="ms-checkout-item__info">
                        <p className="ms-checkout-item__name">{product.name}</p>
                        <p className="ms-checkout-item__qty">Qty: {item.quantity}</p>
                        {error && (
                          <p className="ms-checkout-item__error">{error}</p>
                        )}
                      </div>
                      <p className="ms-checkout-item__total">₹{(Number(product.price) * item.quantity).toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>

          {/* Order Summary Sidebar */}
          <div>
            <div className="ms-checkout-section ms-checkout-section--sticky">
              <h2 className="ms-checkout-section__header">Summary</h2>

              <div className="ms-checkout-summary__rows">
                <div className="ms-checkout-summary__row">
                  <span>Subtotal</span>
                  <span className="ms-checkout-summary__value">₹{subtotal.toFixed(2)}</span>
                </div>

                <div className="ms-checkout-summary__row">
                  <span>Shipping</span>
                  <span className={clsx('ms-checkout-summary__value', {
                    'ms-checkout-summary__value--free': shipping === 0,
                  })}>
                    {shipping === 0 ? 'FREE' : `₹${shipping}`}
                  </span>
                </div>

                {discount > 0 && (
                  <div className="ms-checkout-summary__discount">
                    <span>Discount applied</span>
                    <span>-₹{discount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <hr className="ms-checkout-summary__divider" />

              <div className="ms-checkout-summary__total-block">
                <div className="ms-checkout-summary__total-row">
                  <span className="ms-checkout-summary__total-label">Total</span>
                  <span className="ms-checkout-summary__total-value">₹{total.toFixed(2)}</span>
                </div>
                <p className="ms-checkout-summary__tax">Taxes included</p>
              </div>

              {!checkoutValid && (
                <p className="ms-checkout-item__error" style={{ marginBottom: '0.75rem' }}>
                  Some items in your cart are no longer available in the requested quantity. Please update your cart.
                </p>
              )}
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={createOrder}
                disabled={isLoading || !selectedAddress || !checkoutValid}
                isLoading={isLoading}
                leftIcon={<CreditCard className="w-5 h-5 shrink-0" />}
              >
                Pay ₹{total.toFixed(2)}
              </Button>

              <p className="ms-checkout-summary__secure">
                <ShieldCheck className="w-4 h-4 text-green-500" />
                Payments processed securely by Razorpay
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
