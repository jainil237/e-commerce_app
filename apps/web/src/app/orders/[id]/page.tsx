'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Phone, Mail, Truck, CheckCircle, XCircle, Loader2, Download, Send, Package } from 'lucide-react'
import { useAuth, useStoreConfig, useToast } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'

interface OrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: string
  subtotal: string
  gstPercent: number
  product: {
    name: string
    slug: string
    images: Array<{ url: string }>
  }
}

interface Order {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  razorpayPaymentId: string | null
  subtotal: string
  shippingCharge: string
  discount: string
  gstAmount: string
  total: string
  invoiceUrl?: string | null
  createdAt: string
  deliveredAt: string | null
  items: OrderItem[]
  address: {
    label: string
    line1: string
    line2: string | null
    city: string
    state: string
    pincode: string
  }
  tracking?: {
    courier: string
    trackingId: string
    trackingUrl: string
  }
}

const statusSteps = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']

const formatCurrency = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '₹0.00'

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()
  const config = useStoreConfig()
  const { showToast } = useToast()

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSendingInvoice, setIsSendingInvoice] = useState(false)

  const orderId = params.id as string
  const isSuccess = searchParams.get('success') === 'true'

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    setIsLoading(true)
    const res = await fetch(`/api/v1/orders/${orderId}`)
    const data = await res.json()
    setOrder(data.data || null)
    setIsLoading(false)
  }

  const downloadInvoice = () => {
    window.location.href = `/api/v1/orders/${orderId}/invoice`
  }

  const emailInvoice = async () => {
    setIsSendingInvoice(true)
    try {
      const res = await fetch(`/api/v1/orders/${orderId}/invoice/email`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        showToast('error', data.message || 'Failed to email invoice')
        return
      }

      showToast('success', data.message || 'Invoice sent to your email')
    } catch {
      showToast('error', 'Failed to email invoice')
    } finally {
      setIsSendingInvoice(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[--brand-primary]" />
      </div>
    )
  }

  if (!user) {
    router.push('/account/login')
    return null
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Order not found</h1>
        <Link href="/account/orders" className="text-[--brand-primary]">
          View all orders
        </Link>
      </div>
    )
  }

  const currentStepIndex = order.status === 'PENDING' ? 0 : statusSteps.indexOf(order.status)

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        {isSuccess && (
          <div className="badge-success rounded-xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-6 h-6" />
            <div>
              <p className="font-bold">Order placed successfully!</p>
              <p className="text-sm opacity-90">We'll send you an email with order details.</p>
            </div>
          </div>
        )}

        <button onClick={() => router.back()} className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors font-medium">
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Order Info */}
            <div className="card p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                <div className="min-w-0">
                  <h1 className="text-xl md:text-2xl font-black text-[var(--text-primary)] break-words">Order #{order.orderNumber}</h1>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`w-fit shrink-0 text-xs font-bold px-3 py-1 rounded-full tracking-wider ${
                  order.paymentStatus === 'PAID' ? 'badge-success' : 'badge-warning'
                }`}>
                  {order.paymentStatus}
                </span>
              </div>

              {/* Status Tracker */}
              <div className="flex items-center justify-between mb-6">
                {statusSteps.map((step, index) => {
                  const isCompleted = index <= currentStepIndex
                  const isCurrent = index === currentStepIndex
                  return (
                    <div key={step} className="flex-1 flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isCompleted ? 'bg-[var(--success)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-tertiary)]'
                      } ${isCurrent ? 'ring-4 ring-[var(--success)]/20' : ''}`}>
                        {isCompleted ? <CheckCircle className="w-5 h-5" /> : index + 1}
                      </div>
                      <p className={`text-xs mt-2 ${isCompleted ? 'text-[var(--success)] font-medium' : 'text-[var(--text-tertiary)]'}`}>
                        {index === 0 && order.status === 'PENDING' ? 'PENDING' : step}
                      </p>
                    </div>
                  )
                })}
              </div>

              {order.status === 'CANCELLED' && (
                <div className="badge-error rounded-xl p-3 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  <span className="font-bold">This order has been cancelled</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="card p-6">
              <h2 className="font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                <Package className="w-5 h-5 text-[var(--brand-primary)]" />
                Order Items
              </h2>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="relative w-20 h-20 bg-[var(--surface-2)] rounded-2xl overflow-hidden flex-shrink-0 border border-[var(--border-subtle)]">
                      <FallbackImage src={item.product.images[0]?.url} alt={item.product.name} fill className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/products/${item.product.slug}`} className="font-bold text-[var(--text-primary)] hover:text-[var(--brand-primary)] break-words transition-colors">
                        {item.product.name}
                      </Link>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">Qty: {item.quantity}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">GST: {item.gstPercent}%</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-[var(--text-primary)]">{formatCurrency(item.subtotal)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Address */}
            <div className="card p-6">
              <h2 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[var(--brand-primary)]" />
                Delivery Address
              </h2>
              <p className="font-bold text-[var(--text-primary)]">{order.address.label}</p>
              <p className="text-[var(--text-secondary)] mt-1">
                {order.address.line1}
                {order.address.line2 && `, ${order.address.line2}`}
              </p>
              <p className="text-[var(--text-secondary)]">
                {order.address.city}, {order.address.state} - {order.address.pincode}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="card p-6">
              <h2 className="font-bold text-[var(--text-primary)] mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="text-[var(--text-primary)]">{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Shipping</span>
                  <span className="text-[var(--text-primary)] font-medium">{Number(order.shippingCharge) === 0 ? 'FREE' : formatCurrency(order.shippingCharge)}</span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-[var(--success)] font-medium">
                    <span>Discount</span>
                    <span>-{formatCurrency(order.discount)}</span>
                  </div>
                )}
                {Number(order.gstAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">GST</span>
                    <span className="text-[var(--text-primary)]">{formatCurrency(order.gstAmount)}</span>
                  </div>
                )}
              </div>
              <hr className="my-4" />
              <div className="flex justify-between font-black text-xl text-[var(--text-primary)]">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-3">
                Payment: {order.razorpayPaymentId ? 'Razorpay' : order.paymentStatus}
              </p>
            </div>

            {/* Invoice */}
            <div className="card p-6">
              <h2 className="font-semibold mb-4">Invoice</h2>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={downloadInvoice}
                  disabled={order.paymentStatus !== 'PAID'}
                  className="btn btn-primary btn-sm w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Download className="w-4 h-4" />
                  Download invoice
                </button>
                <button
                  type="button"
                  onClick={emailInvoice}
                  disabled={order.paymentStatus !== 'PAID' || isSendingInvoice}
                  className="btn btn-secondary btn-sm w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSendingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send to email
                </button>
              </div>
              {order.paymentStatus !== 'PAID' && (
                <p className="text-xs text-[var(--text-tertiary)] mt-3">Invoice is available after payment is completed.</p>
              )}
            </div>

            {/* Tracking */}
            {order.tracking && order.status === 'SHIPPED' && (
              <div className="card p-6">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Tracking
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">Courier: {order.tracking.courier}</p>
                <p className="text-sm text-[var(--text-secondary)]">Tracking ID: {order.tracking.trackingId}</p>
                <a
                  href={order.tracking.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm w-full mt-4"
                >
                  Track Order
                </a>
              </div>
            )}

            {/* Help */}
            <div className="card p-6">
              <h2 className="font-semibold mb-4">Need Help?</h2>
              <div className="space-y-3">
                <a href={`tel:${config.store.contact.phone}`} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  <Phone className="w-4 h-4" />
                  {config.store.contact.phone}
                </a>
                <a href={`mailto:${config.store.contact.email}`} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                  <Mail className="w-4 h-4" />
                  {config.store.contact.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
