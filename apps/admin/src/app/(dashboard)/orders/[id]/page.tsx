'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { useToast } from '@/components/providers'
import { OrderDetailsPage } from '@shared/pages/order/OrderDetailsPage'
import { Order } from '@shared/types'
import { SharedModal } from '@shared/components/UIPrimitives'

export default function AdminOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [shippingModal, setShippingModal] = useState({
    isOpen: false,
    newStatus: '',
    awbNumber: '',
    courierPartner: ''
  })

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

  const executeStatusUpdate = async (newStatus: string, awbNumber?: string, courierPartner?: string) => {
    try {
      const res = await fetch(`/api/v1/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, awbNumber, courierPartner }),
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
    
    if (shippingModal.isOpen) {
      setShippingModal({ isOpen: false, newStatus: '', awbNumber: '', courierPartner: '' })
    }
  }

  const handleUpdateStatus = (newStatus: string) => {
    if (newStatus === 'SHIPPED') {
      setShippingModal({
        isOpen: true,
        newStatus,
        awbNumber: '',
        courierPartner: ''
      })
    } else {
      executeStatusUpdate(newStatus)
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
    <div className="-m-8 relative">
      <OrderDetailsPage
        order={order}
        viewer="admin"
        onBack={() => router.push('/orders')}
        onUpdateStatus={handleUpdateStatus}
        onUpdateShipment={(order) => router.push(`/shipments/new?orderId=${order.id}`)}
        onRefresh={fetchOrder}
      />

      <SharedModal
        isOpen={shippingModal.isOpen}
        onClose={() => setShippingModal({ isOpen: false, newStatus: '', awbNumber: '', courierPartner: '' })}
        title="Shipping Details"
      >
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            executeStatusUpdate('SHIPPED', shippingModal.awbNumber, shippingModal.courierPartner);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="modal-courier" className="block text-xs font-black uppercase text-[var(--text-secondary)] tracking-wider mb-2">
              Courier Partner
            </label>
            <input 
              id="modal-courier"
              type="text"
              value={shippingModal.courierPartner}
              onChange={(e) => setShippingModal({...shippingModal, courierPartner: e.target.value})}
              className="input"
              placeholder="e.g. Delhivery, BlueDart"
            />
          </div>
          
          <div>
            <label htmlFor="modal-awb" className="block text-xs font-black uppercase text-[var(--text-secondary)] tracking-wider mb-2">
              AWB / Tracking Number <span className="text-[var(--error)]">*</span>
            </label>
            <input 
              id="modal-awb"
              type="text"
              value={shippingModal.awbNumber}
              onChange={(e) => setShippingModal({...shippingModal, awbNumber: e.target.value})}
              className="input border-[var(--border-base)]"
              placeholder="Enter tracking number"
              required
            />
          </div>

          <div className="flex gap-3 justify-end mt-8">
            <button 
              type="button"
              onClick={() => setShippingModal({ isOpen: false, newStatus: '', awbNumber: '', courierPartner: '' })}
              className="btn btn-secondary px-5 py-2.5 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="btn btn-primary px-5 py-2.5 text-sm"
              disabled={!shippingModal.awbNumber}
            >
              Mark as Shipped
            </button>
          </div>
        </form>
      </SharedModal>
    </div>
  )
}
