'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Package, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/providers'

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
  PENDING: 'bg-yellow-100 text-yellow-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-purple-100 text-purple-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
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
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[--brand-primary]" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 text-center">
        <p className="text-gray-500">Please login to view your orders</p>
        <Link href="/account/login" className="btn btn-primary btn-sm mt-4">
          Login
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold mb-6">My Orders</h1>

        {orders.length === 0 ? (
          <div className="card p-12 text-center">
            <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-lg font-semibold mb-2">No orders yet</h2>
            <p className="text-gray-500 mb-4">Start shopping to see your orders here</p>
            <Link href="/products" className="btn btn-primary btn-sm">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium">Order #{order.orderNumber}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[order.status] || 'bg-gray-100 text-gray-700'}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>{order.items.length} item{order.items.length > 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span className="font-medium text-gray-900">₹{order.total}</span>
                  </div>

                  <div className="flex items-center justify-end mt-2">
                    <span className="text-sm text-[--brand-primary] flex items-center">
                      View Details
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </span>
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
