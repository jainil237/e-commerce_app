'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth, useToast } from '@/contexts'
import { OrderDetailsPage } from '@shared/pages/order/OrderDetailsPage'
import { TrackingModal } from '@/components/molecules/TrackingModal/TrackingModal'
import { Order } from '@shared/types'

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSendingInvoice, setIsSendingInvoice] = useState(false)
  const [isTrackingOpen, setIsTrackingOpen] = useState(false)

  const orderId = params.id as string
  const isSuccess = searchParams.get('success') === 'true'

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/orders/${orderId}`)
      const data = await res.json()
      setOrder(data.data || null)
    } catch (error) {
      console.error('Failed to fetch order', error)
    } finally {
      setIsLoading(false)
    }
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
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!user) {
    router.push('/account/login')
    return null
  }

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-32 text-center">
        <h1 className="text-3xl font-black mb-4">Order not found</h1>
        <button onClick={() => router.push('/account/orders')} className="text-[var(--brand-primary)] font-bold">
          View all orders
        </button>
      </div>
    )
  }

  // Determine if track button should be shown
  const canTrack = order && (
    order.status === 'SHIPPED' ||
    order.status === 'DELIVERED' ||
    !!order.tracking
  )

  return (
    <>
      {isSuccess && (
        <div className="bg-[var(--success)] text-white p-4 text-center font-bold">
          Order placed successfully! We've sent a confirmation email.
        </div>
      )}
      {canTrack && (
        <div className="bg-[var(--surface-2)] p-4 text-center border-b border-[var(--border-base)]">
          <button
            onClick={() => setIsTrackingOpen(true)}
            className="px-6 py-2 bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] font-semibold rounded-md hover:opacity-90 transition"
          >
            Track Delivery
          </button>
        </div>
      )}
      <OrderDetailsPage
        order={order}
        viewer="customer"
        onBack={() => router.push('/account/orders')}
        onDownloadInvoice={downloadInvoice}
        onEmailInvoice={emailInvoice}
        isSendingInvoice={isSendingInvoice}
      />
      {order && (
        <TrackingModal
          isOpen={isTrackingOpen}
          onClose={() => setIsTrackingOpen(false)}
          order={order}
        />
      )}
    </>
  )
}
