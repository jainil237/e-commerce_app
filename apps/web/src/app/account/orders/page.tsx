'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, ChevronRight, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/contexts/auth.context'
import { Button } from '@/components/atoms/Button/Button'
import './orders.scss'

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
      <div className="ms-orders__loading">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="ms-orders__gate">
        <p className="ms-orders__gate-text">Please login to view your orders</p>
        <Link href="/account/login" className="btn btn-primary btn-sm mt-4">
          Login
        </Link>
      </div>
    )
  }

  return (
    <div className="ms-orders">
      <div className="ms-orders__container">
        <div className="ms-orders__header">
          <h1 className="ms-orders__title">My Orders</h1>
          <p className="ms-orders__subtitle">Track and manage your recent purchases</p>
        </div>

        {orders.length === 0 ? (
          <div className="ms-orders-empty">
            <div className="ms-orders-empty__icon-wrap">
              <Package className="ms-orders-empty__icon w-10 h-10" />
            </div>
            <h2 className="ms-orders-empty__title">No orders yet</h2>
            <p className="ms-orders-empty__text">Start shopping to see your orders here</p>
            <Link href="/products">
              <Button variant="primary-brand" size="lg">Browse Products</Button>
            </Link>
          </div>
        ) : (
          <div className="ms-orders-list">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block">
                <div className="ms-orders-card">
                  <div className="ms-orders-card__top">
                    <div className="ms-orders-card__id-row">
                      <div className="ms-orders-card__icon-wrap">
                        <Package className="ms-orders-card__icon w-6 h-6" />
                      </div>
                      <div>
                        <p className="ms-orders-card__number">Order #{order.orderNumber}</p>
                        <p className="ms-orders-card__date">
                          Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                    <span className={clsx('ms-orders-card__status', statusColors[order.status] || 'badge-neutral')}>
                      {order.status}
                    </span>
                  </div>

                  <div className="ms-orders-card__footer">
                    <div className="ms-orders-card__stat">
                      <span className="ms-orders-card__stat-label">Items</span>
                      <span className="ms-orders-card__stat-value">
                        {order.items.length} item{order.items.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="ms-orders-card__stat">
                      <span className="ms-orders-card__stat-label">Total Amount</span>
                      <span className="ms-orders-card__total">₹{order.total}</span>
                    </div>

                    <div className="ms-orders-card__view">
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
