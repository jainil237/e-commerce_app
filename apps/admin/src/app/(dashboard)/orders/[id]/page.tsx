'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/providers'
import { OrderDetailsPage } from '@shared/pages/order/OrderDetailsPage'
import { Order } from '@shared/types'

export default function AdminOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/orders/${orderId}`, {
        credentials: 'include',
      })
      const data = await res.json()
      setOrder(data.data || null)
    } catch (error) {
      console.error('Failed to fetch order', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Order status updated')
        fetchOrder()
      } else {
        showToast('error', data.message || 'Failed to update status')
      }
    } catch (error) {
      showToast('error', 'Something went wrong')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Order not found</h1>
        <button onClick={() => router.push('/orders')} className="text-[var(--brand-primary)] font-bold">
          Back to orders
        </button>
      </div>
    )
  }

  return (
    <div className="-m-8">
      <OrderDetailsPage
        order={order}
        viewer="admin"
        onBack={() => router.push('/orders')}
        onUpdateStatus={handleUpdateStatus}
        onUpdateShipment={(order) => router.push(`/shipments/new?orderId=${order.id}`)}
      />
    </div>
  )
}
