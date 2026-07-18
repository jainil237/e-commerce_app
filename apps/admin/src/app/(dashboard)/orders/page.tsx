'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Eye, Truck, X } from 'lucide-react'
import { useToast } from '@/components/providers'
import { SharedTableActionCell, SharedTableActionIcon, SharedBadge, SharedModal } from '../../../../../../shared/components/UIPrimitives'

interface Order {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  total: string
  createdAt: string
  user: { name: string; email: string }
}

interface RmaRequest {
  id: string
  rmaNumber: string
  orderId: string
  type: 'RETURN' | 'REPLACEMENT'
  status: string
  reason: string
  customerNote?: string
  adminNote?: string
  createdAt: string
  user: { name: string; email: string }
  order: { orderNumber: string }
}

const statusVariants: Record<string, 'warning' | 'info' | 'success' | 'error' | 'gray'> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'error',
  REFUNDED: 'error',
}

const rmaStatusVariants: Record<string, 'warning' | 'info' | 'success' | 'error' | 'gray'> = {
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'error',
  PICKUP_SCHEDULED: 'info',
  ITEM_RECEIVED: 'info',
  REFUND_INITIATED: 'info',
  REFUND_COMPLETED: 'success',
  REPLACEMENT_SHIPPED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'error',
}

const reasonLabels: Record<string, string> = {
  DAMAGED: 'Damaged Product',
  WRONG_ITEM: 'Wrong Item Received',
  SIZE_ISSUE: 'Size/Fit Issue',
  QUALITY_ISSUE: 'Quality Issue',
  NOT_AS_DESCRIBED: 'Not as Described',
  OTHER: 'Other Reason',
}

export default function OrdersPage() {
  const { showToast } = useToast()
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'orders' | 'rma'>('orders')
  
  // Orders state
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)

  // RMA Requests state
  const [rmaRequests, setRmaRequests] = useState<RmaRequest[]>([])
  const [isRmaLoading, setIsRmaLoading] = useState(true)
  const [rmaSearch, setRmaSearch] = useState('')
  const [rmaTypeFilter, setRmaTypeFilter] = useState('')
  const [rmaStatusFilter, setRmaStatusFilter] = useState('')

  const [shippingModal, setShippingModal] = useState({
    isOpen: false,
    orderId: '',
    awbNumber: '',
    courierPartner: ''
  })

  useEffect(() => {
    fetchOrders()
    fetchRmaRequests()
  }, [])

  const fetchOrders = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/orders`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No order data available')
      }
      const data = await res.json()
      setOrders(data.data || [])
    } catch {
      setOrders([])
      setFetchError('No order data available')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRmaRequests = async () => {
    setIsRmaLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/rma`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No RMA data available')
      }
      const data = await res.json()
      setRmaRequests(data.data || [])
    } catch {
      setRmaRequests([])
    } finally {
      setIsRmaLoading(false)
    }
  }

  const updateStatus = async (orderId: string, newStatus: string, awbNumber?: string, courierPartner?: string) => {
    const res = await fetch(`/api/v1/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus, awbNumber, courierPartner }),
    })
    const data = await res.json()
    if (data.success) {
      showToast('success', 'Order status updated')
      fetchOrders()
    } else {
      showToast('error', data.message || 'Failed to update')
    }
    
    if (shippingModal.isOpen) {
      setShippingModal({ isOpen: false, orderId: '', awbNumber: '', courierPartner: '' })
    }
  }

  const handleStatusChange = (orderId: string, newStatus: string) => {
    if (newStatus === 'SHIPPED') {
      setShippingModal({
        isOpen: true,
        orderId,
        awbNumber: '',
        courierPartner: ''
      })
    } else {
      updateStatus(orderId, newStatus)
    }
  }

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.user.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const filteredRmaRequests = rmaRequests.filter(r => {
    const searchLower = rmaSearch.toLowerCase()
    const matchesSearch = 
      r.rmaNumber.toLowerCase().includes(searchLower) ||
      r.order.orderNumber.toLowerCase().includes(searchLower) ||
      r.user.name.toLowerCase().includes(searchLower) ||
      r.user.email.toLowerCase().includes(searchLower)
    const matchesType = !rmaTypeFilter || r.type === rmaTypeFilter
    const matchesStatus = !rmaStatusFilter || r.status === rmaStatusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  const refreshAll = () => {
    fetchOrders()
    fetchRmaRequests()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Orders & Returns</h1>
        <button 
          onClick={refreshAll} 
          className="btn btn-secondary py-2 px-4 text-xs flex items-center gap-2"
          aria-label="Refresh data"
        >
          Refresh Data
        </button>
      </div>

      {fetchError && <p className="text-sm text-[var(--text-secondary)] mb-4">{fetchError}</p>}

      {/* Modern Premium Tabs Segment Selector */}
      <div className="flex border-b border-[var(--border-base)] mb-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 -mb-[2px] flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>General Orders</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold transition-all ${
            activeTab === 'orders'
              ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
              : 'bg-[var(--surface-2)] text-[var(--text-secondary)]'
          }`}>
            {orders.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('rma')}
          className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 -mb-[2px] flex items-center gap-2 ${
            activeTab === 'rma'
              ? 'border-[var(--brand-primary)] text-[var(--brand-primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>Returns & Replacements</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold transition-all ${
            activeTab === 'rma'
              ? 'bg-[var(--brand-primary)] text-[var(--brand-primary-fg)]'
              : 'bg-[var(--surface-2)] text-[var(--text-secondary)]'
          }`}>
            {rmaRequests.length}
          </span>
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          <div className="card p-4 mb-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  id="order-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search orders by number or customer name..."
                  className="input pl-10"
                  aria-label="Search orders"
                />
              </div>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input w-48"
                aria-label="Filter by status"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="PROCESSING">Processing</option>
                <option value="SHIPPED">Shipped</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-[100px]">Order ID</th>
                    <th className="min-w-[180px]">Customer</th>
                    <th className="w-[100px]">Date</th>
                    <th className="w-[90px]">Total</th>
                    <th className="w-[110px]">Payment</th>
                    <th className="w-[110px]">Status</th>
                    <th className="w-[150px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-[var(--text-secondary)]">
                        Loading orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-[var(--text-secondary)]">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-medium">{order.orderNumber}</td>
                        <td>
                          <div>
                            <p>{order.user.name}</p>
                            <p className="text-[var(--text-tertiary)] text-xs">{order.user.email}</p>
                          </div>
                        </td>
                        <td className="text-[var(--text-secondary)] whitespace-nowrap text-xs">
                          {new Date(order.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="font-medium">₹{order.total}</td>
                        <td>
                          <SharedBadge variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                            {order.paymentStatus}
                          </SharedBadge>
                        </td>
                        <td>
                          <SharedBadge variant={statusVariants[order.status] || 'gray'}>
                            {order.status}
                          </SharedBadge>
                        </td>
                        <SharedTableActionCell>
                          <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            className="input text-xs py-1 px-2 w-[100px] h-8"
                            aria-label={`Update status for order ${order.orderNumber}`}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="PROCESSING">Processing</option>
                            <option value="SHIPPED">Shipped</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                          <SharedTableActionIcon 
                            icon={<Eye />} 
                            href={`/orders/${order.id}`}
                            title="View Details"
                          />
                        </SharedTableActionCell>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card p-4 mb-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                <input
                  id="rma-search"
                  type="text"
                  value={rmaSearch}
                  onChange={(e) => setRmaSearch(e.target.value)}
                  placeholder="Search RMA by request number, order number, or customer name..."
                  className="input pl-10"
                  aria-label="Search RMA requests"
                />
              </div>
              <select
                id="rma-type-filter"
                value={rmaTypeFilter}
                onChange={(e) => setRmaTypeFilter(e.target.value)}
                className="input w-44"
                aria-label="Filter by request type"
              >
                <option value="">All Types</option>
                <option value="RETURN">Return</option>
                <option value="REPLACEMENT">Replacement</option>
              </select>
              <select
                id="rma-status-filter"
                value={rmaStatusFilter}
                onChange={(e) => setRmaStatusFilter(e.target.value)}
                className="input w-48"
                aria-label="Filter by request status"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="PICKUP_SCHEDULED">Pickup Scheduled</option>
                <option value="ITEM_RECEIVED">Item Received</option>
                <option value="REFUND_INITIATED">Refund Initiated</option>
                <option value="REFUND_COMPLETED">Refund Completed</option>
                <option value="REPLACEMENT_SHIPPED">Replacement Shipped</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-[120px]">RMA ID</th>
                    <th className="w-[100px]">Order ID</th>
                    <th className="min-w-[180px]">Customer</th>
                    <th className="w-[110px]">Type</th>
                    <th className="w-[100px]">Date</th>
                    <th className="min-w-[150px]">Reason</th>
                    <th className="w-[130px]">Status</th>
                    <th className="w-[80px] text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isRmaLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-[var(--text-secondary)]">
                        Loading Return & Replacement requests...
                      </td>
                    </tr>
                  ) : filteredRmaRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-[var(--text-secondary)]">
                        No requests found
                      </td>
                    </tr>
                  ) : (
                    filteredRmaRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="font-semibold text-xs whitespace-nowrap">{request.rmaNumber}</td>
                        <td className="font-medium text-xs whitespace-nowrap text-[var(--text-secondary)]">
                          {request.order.orderNumber}
                        </td>
                        <td>
                          <div>
                            <p className="font-medium">{request.user.name}</p>
                            <p className="text-[var(--text-tertiary)] text-xs">{request.user.email}</p>
                          </div>
                        </td>
                        <td>
                          <SharedBadge variant={request.type === 'REPLACEMENT' ? 'info' : 'neutral'}>
                            {request.type}
                          </SharedBadge>
                        </td>
                        <td className="text-[var(--text-secondary)] whitespace-nowrap text-xs">
                          {new Date(request.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td>
                          <p className="text-sm font-medium">{reasonLabels[request.reason] || request.reason}</p>
                          {request.customerNote && (
                            <p className="text-[var(--text-secondary)] text-xs truncate max-w-[200px]" title={request.customerNote}>
                              {request.customerNote}
                            </p>
                          )}
                        </td>
                        <td>
                          <SharedBadge variant={rmaStatusVariants[request.status] || 'gray'}>
                            {request.status.replace(/_/g, ' ')}
                          </SharedBadge>
                        </td>
                        <SharedTableActionCell>
                          <SharedTableActionIcon 
                            icon={<Eye />} 
                            href={`/orders/${request.orderId}`}
                            title="Manage RMA in Order Details"
                          />
                        </SharedTableActionCell>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <SharedModal
        isOpen={shippingModal.isOpen}
        onClose={() => setShippingModal({ isOpen: false, orderId: '', awbNumber: '', courierPartner: '' })}
        title="Shipping Details"
      >
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            updateStatus(shippingModal.orderId, 'SHIPPED', shippingModal.awbNumber, shippingModal.courierPartner);
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
              onClick={() => setShippingModal({ isOpen: false, orderId: '', awbNumber: '', courierPartner: '' })}
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

