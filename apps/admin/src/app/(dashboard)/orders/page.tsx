'use client'

import { useState, useEffect } from 'react'
import { Search, Eye, Truck } from 'lucide-react'
import { useToast } from '@/components/providers'

interface Order {
  id: string
  orderNumber: string
  status: string
  paymentStatus: string
  total: string
  createdAt: string
  user: { name: string; email: string }
}

const statusColors: Record<string, string> = {
  PENDING: 'badge-warning',
  PROCESSING: 'badge-info',
  SHIPPED: 'badge-info',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
}

export default function OrdersPage() {
  const { showToast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders()
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

  const updateStatus = async (orderId: string, newStatus: string) => {
    const res = await fetch(`/api/v1/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json()
    if (data.success) {
      showToast('success', 'Order status updated')
      fetchOrders()
    } else {
      showToast('error', data.message || 'Failed to update')
    }
  }

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.user.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = !statusFilter || o.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
      {fetchError && <p className="text-sm text-[var(--text-secondary)] mb-4">{fetchError}</p>}

      <div className="card p-4 mb-6">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
            <input
              id="order-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
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
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[var(--text-secondary)]">
                    No order data available
                  </td>
                </tr>
              )}
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td className="font-medium">{order.orderNumber}</td>
                  <td>
                    <div>
                      <p>{order.user.name}</p>
                      <p className="text-[var(--text-tertiary)] text-xs">{order.user.email}</p>
                    </div>
                  </td>
                  <td className="font-medium">₹{order.total}</td>
                  <td>
                    <span className={`badge ${statusColors[order.status] || 'badge-gray'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${order.paymentStatus === 'PAID' ? 'badge-success' : 'badge-warning'}`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {new Date(order.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <select
                        value={order.status}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className="input text-sm py-1 px-2 w-32"
                        aria-label={`Update status for order ${order.orderNumber}`}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PROCESSING">Processing</option>
                        <option value="SHIPPED">Shipped</option>
                        <option value="DELIVERED">Delivered</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      <button className="p-2 hover:bg-[var(--surface-1)] rounded-lg" title="View Details">
                        <Eye className="w-4 h-4 text-[var(--text-secondary)]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
