'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, CreditCard, Tag, Check, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth, useCart, useToast, useStoreConfig } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import styles from './checkout.module.css'

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

interface CartProduct {
  id: string
  name: string
  slug: string
  price: string
  mrp: string
  stock: number
  gstPercent: number
  images: Array<{ url: string }>
}

export default function CheckoutPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const { items, subtotal, clearCart } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [products, setProducts] = useState<Record<string, CartProduct>>({})
  const [checkoutValid, setCheckoutValid] = useState(true)
  const [checkoutErrors, setCheckoutErrors] = useState<Record<string, string>>({})

  const shipping = subtotal >= config.shipping.freeShippingAbove ? 0 : config.shipping.baseShippingCharge
  const discount = appliedCoupon?.discount || 0
  const total = subtotal + shipping - discount

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/account?redirect=/checkout')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    async function fetchAddresses() {
      if (!user) return
      const res = await fetch('/api/v1/addresses', { credentials: 'include' })
      const data = await res.json()
      setAddresses(data.data || [])
      const defaultAddr = data.data?.find((a: Address) => a.isDefault)
      if (defaultAddr) setSelectedAddress(defaultAddr.id)
    }
    fetchAddresses()
  }, [user])

  useEffect(() => {
    async function fetchProducts() {
      if (items.length === 0) return
      const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cartSessionId') || undefined : undefined
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
      } catch (err) {
        console.error('Failed to validate cart for checkout', err)
        setCheckoutValid(false)
      }
    }
    fetchProducts()
  }, [items])

  const applyCoupon = async () => {
    if (!couponCode) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/v1/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, orderValue: subtotal }),
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
            showToast('error', verifyData.message || 'Payment verification failed')
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
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            new (window as any).Razorpay(options).open()
          }
          document.body.appendChild(script)
        }
      } else {
        showToast('error', data.message || 'Failed to create order')
      }
    } catch {
      showToast('error', 'Failed to create order')
    }
    setIsLoading(false)
  }

  if (authLoading || items.length === 0) {
    return (
      <div className={`${styles.wrapper} flex items-center justify-center`}>
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        
        {/* Header */}
        <div className={styles.header}>
          <Link href="/cart" className={styles.backBtn} aria-label="Back to Cart">
            <ArrowLeft className="w-6 h-6 shrink-0" />
          </Link>
          <h1 className={styles.pageTitle}>Secure Checkout</h1>
        </div>

        <div className={styles.layoutGrid}>
          {/* Main Content */}
          <div className={styles.mainColumn}>
            
            {/* Address Selection */}
            <div className={styles.sectionCard}>
              <h2 className={styles.sectionHeader}>
                <MapPin className={`${styles.sectionIcon} w-5 h-5`} />
                Delivery Address
              </h2>

              {addresses.length === 0 ? (
                <div className={styles.addressEmpty}>
                  <p className={styles.addressEmptyText}>No saved addresses found</p>
                  <Link href="/account/addresses">
                    <Button variant="secondary" size="sm">Add Address</Button>
                  </Link>
                </div>
              ) : (
                <div className={styles.addressList}>
                  {addresses.map(address => {
                    const isSelected = selectedAddress === address.id;
                    return (
                      <label
                        key={address.id}
                        className={`${styles.addressLabel} ${isSelected ? styles.addressSelected : styles.addressUnselected}`}
                      >
                        <div className={styles.addressInfo}>
                          <input
                            type="radio"
                            name="address"
                            checked={isSelected}
                            onChange={() => setSelectedAddress(address.id)}
                            className={styles.radioInput}
                          />
                          <div className={styles.addressContent}>
                            <p className={styles.addressName}>{address.label}</p>
                            <p className={styles.addressLines}>
                              {address.line1}
                              {address.line2 && `, ${address.line2}`}
                            </p>
                            <p className={styles.addressLines}>
                              {address.city}, {address.state} - {address.pincode}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className={styles.checkIcon} />
                          )}
                        </div>
                      </label>
                    )
                  })}
                  <div className="pt-3">
                    <Link href="/account/addresses">
                      <Button variant="ghost" size="sm">Add New Address</Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Coupon */}
            <div className={styles.sectionCard}>
              <h2 className={styles.sectionHeader}>
                <Tag className={`${styles.sectionIcon} w-5 h-5`} />
                Discount & Coupons
              </h2>

              {appliedCoupon ? (
                <div className={styles.couponApplied}>
                  <span className={styles.couponCode}>{appliedCoupon.code}</span>
                  <button
                    onClick={() => setAppliedCoupon(null)}
                    className={styles.couponRemove}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className={styles.couponInputWrapper}>
                  <Input
                    name="coupon"
                    placeholder="Enter discount code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className={styles.couponInput}
                  />
                  <Button
                    onClick={applyCoupon}
                    disabled={isLoading || !couponCode}
                    variant="secondary"
                    className="px-6"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className={styles.sectionCard}>
              <h2 className={styles.sectionHeader}>Order Review</h2>
              <div className={styles.orderItemsList}>
                {items.map(item => {
                  const product = products[item.productId]
                  if (!product) return null
                  const error = checkoutErrors[item.productId]
                  return (
                    <div key={item.productId} className={styles.orderItem}>
                      <div className={styles.itemImageWrapper}>
                        <FallbackImage
                          src={product?.images?.[0]?.url}
                          alt={product.name}
                          fill
                          className={styles.itemImage}
                        />
                      </div>
                      <div className={styles.itemInfo}>
                        <p className={styles.itemName}>{product.name}</p>
                        <p className={styles.itemQty}>Qty: {item.quantity}</p>
                        {error && (
                          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                        )}
                      </div>
                      <p className={styles.itemTotal}>₹{(Number(product.price) * item.quantity).toFixed(2)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            
          </div>

          {/* Order Summary Sidebar */}
          <div>
            <div className={`${styles.sectionCard} ${styles.summarySection}`}>
              <h2 className={styles.sectionHeader}>Summary</h2>

              <div className="space-y-1 mb-5">
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span className={styles.summaryValue}>₹{subtotal.toFixed(2)}</span>
                </div>
                
                <div className={styles.summaryRow}>
                  <span>Shipping</span>
                  <span className={shipping === 0 ? 'text-green-600 dark:text-green-500 font-semibold' : styles.summaryValue}>
                    {shipping === 0 ? 'FREE' : `₹${shipping}`}
                  </span>
                </div>
                
                {discount > 0 && (
                  <div className={styles.summaryDiscount}>
                    <span>Discount applied</span>
                    <span>-₹{discount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <hr className={styles.divider} />

              <div className="mb-6">
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Total</span>
                  <span className={styles.totalValue}>₹{total.toFixed(2)}</span>
                </div>
                <p className={styles.taxNotice}>Taxes included</p>
              </div>

              {!checkoutValid && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">
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

              <p className={styles.secureNotice}>
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
