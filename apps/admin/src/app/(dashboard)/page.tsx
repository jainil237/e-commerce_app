'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
} from 'lucide-react'
import { useAuth } from '@/components/providers'
import RevenueWeeklyChart from '@/components/dashboard/RevenueWeeklyChart'
import HierarchicalBarChart from '@/components/dashboard/HierarchicalBarChart'

interface DashboardStats {
  revenue: { value: number; change: number }
  orders: { value: number; change: number }
  products: { value: number; change: number }
  customers: { value: number; change: number }
  recentOrders: Array<{
    id: string
    orderNumber: string
    customer: string
    total: string
    status: string
    createdAt: string
  }>
}

interface HierarchyNode {
  name: string
  value?: number
  children?: HierarchyNode[]
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  
  // Weekly revenue state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [weeklyRevenue, setWeeklyRevenue] = useState<Array<{ name: string; revenue: number }>>([])
  const [prevWeeklyRevenue, setPrevWeeklyRevenue] = useState<Array<{ name: string; revenue: number }>>([])
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false)

  // Hierarchical sales state
  const [hierarchicalSales, setHierarchicalSales] = useState<HierarchyNode | null>(null)
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false)

  useEffect(() => {
    fetchDashboard(selectedMonth, selectedYear)
    fetchHierarchicalSales(selectedMonth, selectedYear)
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    fetchWeeklyData()
  }, [selectedMonth, selectedYear])

  const fetchWeeklyData = async () => {
    setIsWeeklyLoading(true)
    try {
      // Calculate previous month
      let prevMonth = selectedMonth - 1
      let prevYear = selectedYear
      if (prevMonth === 0) {
        prevMonth = 12
        prevYear -= 1
      }

      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/v1/admin/dashboard/revenue-weekly?month=${selectedMonth}&year=${selectedYear}`, { credentials: 'include' }),
        fetch(`/api/v1/admin/dashboard/revenue-weekly?month=${prevMonth}&year=${prevYear}`, { credentials: 'include' })
      ])

      const currentData = await currentRes.json()
      const prevData = await prevRes.json()

      if (currentData.success) setWeeklyRevenue(currentData.data)
      if (prevData.success) setPrevWeeklyRevenue(prevData.data)
    } catch (error) {
      console.error('Failed to fetch weekly revenue:', error)
    } finally {
      setIsWeeklyLoading(false)
    }
  }

  const fetchHierarchicalSales = async (month: number, year: number) => {
    setIsHierarchyLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/dashboard/hierarchical-sales?month=${month}&year=${year}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setHierarchicalSales(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch hierarchical sales:', error)
    } finally {
      setIsHierarchyLoading(false)
    }
  }

  const fetchDashboard = async (month: number, year: number) => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const fromDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
      const toDate = new Date(year, month, 0).toISOString().split('T')[0]

      const endpoints = [
        `/api/v1/admin/dashboard/summary?month=${month}&year=${year}`,
        `/api/v1/admin/orders?limit=5&fromDate=${fromDate}&toDate=${toDate}`,
      ]

      const responses = await Promise.all(
        endpoints.map((url) =>
          fetch(url, { credentials: 'include' }).then((res) => (res.ok ? res.json() : null))
        )
      )

      const [summaryData, ordersData] = responses

      if (!summaryData?.success) {
        throw new Error('No dashboard data available')
      }

      const summary = summaryData.data || {}
      
      setStats({
        revenue: summary.revenue || { value: 0, change: 0 },
        orders: summary.orders || { value: 0, change: 0 },
        products: summary.products || { value: 0, change: 0 },
        customers: summary.customers || { value: 0, change: 0 },
        recentOrders: ordersData?.success
          ? ordersData.data.map((o: any) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              customer: o.user?.name || 'Guest',
              total: o.total,
              status: o.status,
              createdAt: o.createdAt,
            }))
          : [],
      })
    } catch (error) {
      console.error('Dashboard fetch error:', error)
      setFetchError('Failed to load dashboard statistics')
    } finally {
      setIsLoading(false)
    }
  }

  const revenueSeries = useMemo(() => {
    if (weeklyRevenue.length === 0) return []
    
    const currentMonthLabel = new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'short', year: 'numeric' })
    
    let prevMonth = selectedMonth - 1
    let prevYear = selectedYear
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear -= 1
    }
    const prevMonthLabel = new Date(prevYear, prevMonth - 1).toLocaleString('default', { month: 'short', year: 'numeric' })

    return [
      {
        id: 'current',
        label: currentMonthLabel,
        color: '#3b82f6',
        values: weeklyRevenue
      },
      {
        id: 'previous',
        label: prevMonthLabel,
        color: '#94a3b8',
        values: prevWeeklyRevenue
      }
    ]
  }, [weeklyRevenue, prevWeeklyRevenue, selectedMonth, selectedYear])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--surface-1)]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-blue-400/20 border-b-blue-400 rounded-full animate-spin-reverse"></div>
            </div>
          </div>
          <p className="text-[var(--text-secondary)] font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Intelligence...</p>
        </div>
      </div>
    )
  }
 
  const statCards = [
    { label: 'Total Revenue', key: 'revenue', icon: DollarSign, prefix: '₹', color: 'blue', gradient: 'from-blue-500/10 to-indigo-500/10' },
    { label: 'Orders', key: 'orders', icon: ShoppingCart, prefix: '', color: 'purple', gradient: 'from-purple-500/10 to-pink-500/10' },
    { label: 'Products', key: 'products', icon: Package, prefix: '', color: 'orange', gradient: 'from-orange-500/10 to-amber-500/10' },
    { label: 'Customers', key: 'customers', icon: Users, prefix: '', color: 'green', gradient: 'from-green-500/10 to-emerald-500/10' },
  ]
 
  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="mb-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tight">Intelligence Dashboard</h1>
          <p className="text-[var(--text-secondary)] mt-2 flex items-center gap-2 font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            Real-time analytics • {user?.name}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-[var(--surface-0)] p-1.5 rounded-2xl shadow-lg border border-[var(--border-base)]">
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-1)] rounded-xl border border-[var(--border-base)]">
            <Calendar className="w-4 h-4 text-blue-500" />
            <select 
              id="month-selector"
              name="selectedMonth"
              aria-label="Select month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer uppercase tracking-wider text-[var(--text-primary)]"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1} className="bg-[var(--surface-0)]">
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-1)] rounded-xl border border-[var(--border-base)]">
            <select 
              id="year-selector"
              name="selectedYear"
              aria-label="Select year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs font-bold bg-transparent outline-none cursor-pointer uppercase tracking-wider text-[var(--text-primary)]"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = new Date().getFullYear() - i
                return <option key={y} value={y} className="bg-[var(--surface-0)]">{y}</option>
              })}
            </select>
          </div>
        </div>
      </div>
 
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {statCards.map((card) => {
          const data = stats?.[card.key as keyof DashboardStats] as { value: number; change: number }
          const isPositive = data?.change >= 0
          return (
            <div key={card.label} className={`group relative overflow-hidden bg-[var(--surface-0)] p-6 rounded-3xl shadow-sm border border-[var(--border-base)] hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}>
              <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 bg-gradient-to-br ${card.gradient} rounded-full group-hover:scale-125 transition-transform duration-700 blur-2xl opacity-60`}></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className={`p-3.5 rounded-2xl bg-${card.color}-500/10 text-${card.color}-600 dark:text-${card.color}-400 border border-${card.color}-500/20`}>
                    <card.icon className="w-6 h-6" />
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${isPositive ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'}`}>
                    {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {Math.abs(data?.change || 0)}%
                  </div>
                </div>
                <p className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
                  {card.prefix}{data?.value?.toLocaleString('en-IN') || 0}
                </p>
                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-[0.15em] mt-2">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts Section */}
      <div className="grid lg:grid-cols-5 gap-8 mb-10">
        {/* Revenue Weekly Chart */}
        <div className="lg:col-span-3 bg-[var(--surface-0)] p-8 rounded-3xl shadow-sm border border-[var(--border-base)]">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Revenue Performance</h2>
              <p className="text-sm text-gray-500">Weekly earnings comparison</p>
            </div>
            <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                <span className="text-[var(--text-primary)]">Current</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                <span className="text-gray-400">Previous</span>
              </div>
            </div>
          </div>
          
          <div className="h-[340px] relative">
            {isWeeklyLoading && (
              <div className="absolute inset-0 bg-[var(--surface-0)]/60 backdrop-blur-[2px] flex items-center justify-center z-10 rounded-2xl">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">Syncing...</span>
                </div>
              </div>
            )}
            {revenueSeries.length > 0 ? (
              <RevenueWeeklyChart series={revenueSeries} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-50 rounded-3xl">
                <TrendingUp className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">No revenue insights available</p>
              </div>
            )}
          </div>
        </div>

        {/* Hierarchical Sales Chart */}
        <div className="lg:col-span-2 bg-[var(--surface-0)] p-8 rounded-3xl shadow-sm border border-[var(--border-base)]">
          <div className="mb-14">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Top Categories & Products</h2>
            <p className="text-sm text-gray-500">Hierarchical sales distribution</p>
          </div>
          
          <div className="min-h-[340px] relative">
            {isHierarchyLoading && (
              <div className="absolute inset-0 bg-[var(--surface-0)]/60 backdrop-blur-[2px] flex items-center justify-center z-30 rounded-2xl">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {hierarchicalSales ? (
              <HierarchicalBarChart data={hierarchicalSales} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-50 rounded-3xl">
                <Package className="w-12 h-12 mb-2 opacity-20" />
                <p className="text-sm font-medium">Analyzing product hierarchy...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-[var(--surface-0)] rounded-3xl shadow-sm border border-[var(--border-base)] overflow-hidden">
        <div className="p-8 border-b border-[var(--border-base)] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Recent Transactions</h2>
            <p className="text-sm text-gray-500">Monitor latest order activity</p>
          </div>
          <button className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">View All Activity</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--surface-1)]">
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-8 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-base)]">
              {(stats?.recentOrders?.length || 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-gray-400 italic">
                    No recent transactions detected
                  </td>
                </tr>
              )}
              {stats?.recentOrders?.map((order) => (
                <tr key={order.id} className="hover:bg-[var(--surface-1)] transition-colors">
                  <td className="px-8 py-5 text-sm font-bold text-[var(--text-primary)]">{order.orderNumber}</td>
                  <td className="px-8 py-5 text-sm text-[var(--text-secondary)] font-medium">{order.customer}</td>
                  <td className="px-8 py-5 text-sm font-bold text-[var(--text-primary)]">₹{order.total}</td>
                  <td className="px-8 py-5">
                    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      order.status === 'DELIVERED' ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' :
                      order.status === 'SHIPPED' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' :
                      order.status === 'PROCESSING' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                      order.status === 'CANCELLED' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-[var(--surface-1)] text-[var(--text-secondary)]'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-sm text-gray-400 font-medium">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
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
