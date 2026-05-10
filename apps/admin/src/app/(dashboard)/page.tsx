'use client'

import { useState, useEffect } from 'react'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { useAuth } from '@/components/providers'

interface DashboardStats {
  revenue: { value: number; change: number }
  orders: { value: number; change: number }
  products: { value: number; change: number }
  customers: { value: number; change: number }
  revenueChart: Array<{ date: string; revenue: number }>
  topProducts: Array<{ name: string; sales: number }>
  recentOrders: Array<{
    id: string
    orderNumber: string
    customer: string
    total: string
    status: string
    createdAt: string
  }>
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const emptyStats: DashboardStats = {
    revenue: { value: 0, change: 0 },
    orders: { value: 0, change: 0 },
    products: { value: 0, change: 0 },
    customers: { value: 0, change: 0 },
    revenueChart: [],
    topProducts: [],
    recentOrders: [],
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/dashboard/summary`, {
        credentials: 'include',
      })

      if (!res.ok) {
        throw new Error('No dashboard data available')
      }

      const data = await res.json()
      const summary = data.data || {}
      setStats({
        ...emptyStats,
        revenue: { value: Number(summary.totalRevenue || 0), change: 0 },
        orders: { value: Number(summary.totalOrders || 0), change: 0 },
        products: { value: Number(summary.totalProducts || 0), change: 0 },
        customers: { value: Number(summary.totalUsers || 0), change: 0 },
      })
    } catch {
      setStats(emptyStats)
      setFetchError('No dashboard data available')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="skeleton w-8 h-8 rounded-full" />
      </div>
    )
  }

  const statCards = [
    { label: 'Total Revenue', key: 'revenue', icon: DollarSign, prefix: '₹' },
    { label: 'Orders', key: 'orders', icon: ShoppingCart, prefix: '' },
    { label: 'Products', key: 'products', icon: Package, prefix: '' },
    { label: 'Customers', key: 'customers', icon: Users, prefix: '' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.name}</p>
        {fetchError && (
          <p className="text-sm text-gray-500 mt-2">{fetchError}</p>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card) => {
          const data = stats?.[card.key as keyof DashboardStats] as { value: number; change: number }
          const isPositive = data?.change >= 0
          return (
            <div key={card.label} className="stat-card">
              <div className="flex items-center justify-between">
                <card.icon className="w-5 h-5 text-gray-400" />
                <div className={`flex items-center text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {Math.abs(data?.change || 0)}%
                </div>
              </div>
              <div className="mt-3">
                <p className="stat-value">
                  {card.prefix}{data?.value?.toLocaleString('en-IN') || 0}
                </p>
                <p className="stat-label">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Revenue Overview</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.revenueChart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Top Selling Products</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.topProducts || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={12} width={100} />
                <Tooltip />
                <Bar dataKey="sales" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Recent Orders</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recentOrders?.length || 0) === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    No order data available
                  </td>
                </tr>
              )}
              {stats?.recentOrders?.map((order) => (
                <tr key={order.id}>
                  <td className="font-medium">{order.orderNumber}</td>
                  <td>{order.customer}</td>
                  <td>₹{order.total}</td>
                  <td>
                    <span className={`badge ${
                      order.status === 'DELIVERED' ? 'badge-success' :
                      order.status === 'SHIPPED' ? 'badge-info' :
                      order.status === 'PROCESSING' ? 'badge-warning' :
                      order.status === 'CANCELLED' ? 'badge-error' : 'badge-gray'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString('en-IN')}
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
