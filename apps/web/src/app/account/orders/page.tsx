'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers'
import { Button } from '@/components/atoms/Button/Button'

interface Order {
  id: string
  orderNumber: string
  status: string
  total: string
  createdAt: string
  items: Array<{
    productId: string
    productName: string
    quantity: number
    price: string
  }>
}

const statusColors: Record<string, string> = {
  PENDING: 'badge-warning',
  PROCESSING: 'badge-info',
  SHIPPED: 'badge-info',
  CONFIRMED: 'badge-success',
  DELIVERED: 'badge-success',
  CANCELLED: 'badge-error',
}

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchOrders() {
      if (!user) return
      const res = await fetch('/api/v1/orders')
      const data = await res.json()
      setOrders(data.data || [])
      setIsLoading(false)
    }
    fetchOrders()
  }, [user])

  if (authLoading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <p className="text-[var(--text-secondary)]">Please login to view your orders</p>
        <Link href="/account/login" className="btn btn-primary btn-sm mt-4">
          Login
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">My Orders</h1>
          <p className="text-[var(--text-secondary)] mt-1">Track and manage your recent purchases</p>
        </div>

        {orders.length === 0 ? (
          <div className="card p-16 text-center border-dashed">
            <div className="w-20 h-20 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Package className="w-10 h-10 text-[var(--text-tertiary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">No orders yet</h2>
            <p className="text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">Start shopping to see your orders here</p>
            <Link href="/products">
              <Button variant="primary-brand" size="lg">Browse Products</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block group">
                <div className="card card-hover p-6 md:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
                        <Package className="w-6 h-6 text-[var(--brand-primary)]" />
                      </div>
                      <div>
                        <p className="font-bold text-[var(--text-primary)] text-lg">Order #{order.orderNumber}</p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${statusColors[order.status] || 'badge-neutral'}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-6 border-t border-[var(--border-subtle)]">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-widest text-[var(--text-tertiary)] font-bold">Items</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {order.items.length} item{order.items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-widest text-[var(--text-tertiary)] font-bold">Total Amount</span>
                      <span className="text-sm font-bold text-[var(--brand-primary)]">₹{order.total}</span>
                    </div>
                    
                    <div className="ml-auto flex items-center text-sm font-bold text-[var(--brand-primary)] group-hover:translate-x-1 transition-transform">
                      View Details
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
