'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  X,
  Check,
  RotateCcw,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { useAuth, useToast } from '@/components/providers'
import { SharedBadge, SharedButton } from '@shared/components/UIPrimitives'
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
  const { showToast } = useToast()
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Restock Modal State
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false)
  const [restockItems, setRestockItems] = useState<Array<{ productId: string; name: string; sku: string; quantity: number; currentStock: number; selected: boolean }>>([])
  const [isRestocking, setIsRestocking] = useState(false)

  // Weekly revenue state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [weeklyRevenue, setWeeklyRevenue] = useState<Array<{ name: string; revenue: number }>>([])
  const [prevWeeklyRevenue, setPrevWeeklyRevenue] = useState<Array<{ name: string; revenue: number }>>([])
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false)

  // Hierarchical sales state
  const [hierarchicalSales, setHierarchicalSales] = useState<HierarchyNode | null>(null)
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false)

  // Low stock state
  const [lowStock, setLowStock] = useState<Array<{ id: string; name: string; stock: number; sku: string }>>([])
  const [isLowStockLoading, setIsLowStockLoading] = useState(false)

  useEffect(() => {
    fetchDashboard(selectedMonth, selectedYear)
    fetchHierarchicalSales(selectedMonth, selectedYear)
    fetchLowStock()
  }, [selectedMonth, selectedYear])

  useEffect(() => {
    fetchWeeklyData()
  }, [selectedMonth, selectedYear])

  const fetchWeeklyData = async () => {
    setIsWeeklyLoading(true)
    try {
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

  const fetchLowStock = async () => {
    setIsLowStockLoading(true)
    try {
      const res = await fetch('/api/v1/admin/dashboard/low-stock', { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setLowStock(data.data)
        setRestockItems(data.data.map((p: any) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          quantity: 10,
          currentStock: p.stock,
          selected: true
        })))
      }
    } catch (error) {
      console.error('Failed to fetch low stock:', error)
    } finally {
      setIsLowStockLoading(false)
    }
  }

  const handleRestock = async () => {
    const itemsToRestock = restockItems.filter(item => item.selected && item.quantity > 0)
    if (itemsToRestock.length === 0) {
      showToast('info', 'Please select at least one product with quantity > 0')
      return
    }

    setIsRestocking(true)
    try {
      const res = await fetch('/api/v1/admin/inventory/bulk-restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToRestock }),
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Inventory restocked successfully')
        setIsRestockModalOpen(false)
        fetchLowStock()
        fetchDashboard(selectedMonth, selectedYear)
      } else {
        showToast('error', data.message || 'Failed to restock inventory')
      }
    } catch (error) {
      showToast('error', 'An error occurred while restocking')
    } finally {
      setIsRestocking(false)
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
      { id: 'current', label: currentMonthLabel, color: '#3b82f6', values: weeklyRevenue },
      { id: 'previous', label: prevMonthLabel, color: '#94a3b8', values: prevWeeklyRevenue }
    ]
  }, [weeklyRevenue, prevWeeklyRevenue, selectedMonth, selectedYear])

  if (isLoading) {
    return (
      <div className="ms-admin__loading">
        <div className="ms-spinner ms-spinner--lg" />
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
    <div className="ms-dash">
      <div className="ms-dash__header">
        <div>
          <h1 className="ms-dash__title">Intelligence Dashboard</h1>
          <p className="ms-dash__subtitle">
            <span className="ms-dash__live-dot" />
            Real-time analytics • {user?.name}
          </p>
        </div>
        <div className="ms-dash__filters">
          <div className="ms-dash__filter">
            <Calendar className="ms-dash__filter-icon w-4 h-4" />
            <select
              id="month-selector"
              name="selectedMonth"
              aria-label="Select month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="ms-dash__select"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div className="ms-dash__filter">
            <select
              id="year-selector"
              name="selectedYear"
              aria-label="Select year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="ms-dash__select"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = new Date().getFullYear() - i
                return <option key={y} value={y}>{y}</option>
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="ms-stat-grid">
        {statCards.map((card) => {
          const data = stats?.[card.key as keyof DashboardStats] as { value: number; change: number }
          const isPositive = (data?.change ?? 0) >= 0
          return (
            <div key={card.label} className="ms-card ms-card--stat">
              <div className="ms-card__top">
                <div className="ms-card__icon">
                  <card.icon className="w-6 h-6" />
                </div>
                <div className={clsx('ms-card__delta', isPositive ? 'ms-card__delta--up' : 'ms-card__delta--down')}>
                  {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {Math.abs(data?.change || 0)}%
                </div>
              </div>
              <p className="ms-card__value">
                {card.prefix}{data?.value?.toLocaleString('en-IN') || 0}
              </p>
              <p className="ms-card__label">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Section */}
      <div className="ms-charts">
        <div className="ms-chart-card ms-chart-card--span3">
          <div className="ms-chart-card__header">
            <div>
              <h2 className="ms-chart-card__title">Revenue Performance</h2>
              <p className="ms-chart-card__sub">Weekly earnings comparison</p>
            </div>
            <div className="ms-chart-card__legend">
              <div className="ms-chart-card__legend-item">
                <span className="ms-chart-card__legend-dot ms-chart-card__legend-dot--current" />
                Current
              </div>
              <div className="ms-chart-card__legend-item">
                <span className="ms-chart-card__legend-dot ms-chart-card__legend-dot--previous" />
                Previous
              </div>
            </div>
          </div>

          <div className="ms-chart-card__body">
            {isWeeklyLoading && (
              <div className="ms-chart-card__overlay"><div className="ms-spinner" /></div>
            )}
            {revenueSeries.length > 0 ? (
              <RevenueWeeklyChart series={revenueSeries} />
            ) : (
              <div className="ms-chart-card__empty">
                <TrendingUp className="w-12 h-12 opacity-20" />
                <p>No revenue insights available</p>
              </div>
            )}
          </div>
        </div>

        <div className="ms-chart-card ms-chart-card--span2">
          <div className="ms-chart-card__header">
            <div>
              <h2 className="ms-chart-card__title">Top Categories & Products</h2>
              <p className="ms-chart-card__sub">Hierarchical sales distribution</p>
            </div>
          </div>

          <div className="ms-chart-card__body">
            {isHierarchyLoading && (
              <div className="ms-chart-card__overlay"><div className="ms-spinner" /></div>
            )}
            {hierarchicalSales ? (
              <HierarchicalBarChart data={hierarchicalSales} />
            ) : (
              <div className="ms-chart-card__empty">
                <Package className="w-12 h-12 opacity-20" />
                <p>Analyzing product hierarchy...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="ms-panel">
        <div className="ms-panel__header">
          <div>
            <h2 className="ms-panel__title">Recent Transactions</h2>
            <p className="ms-panel__sub">Monitor latest order activity</p>
          </div>
          <Link href="/orders" className="ms-panel__link">View All Activity</Link>
        </div>
        <div className="ms-table-container">
          <table className="ms-table">
            <thead className="ms-table__head">
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="ms-table__body">
              {(stats?.recentOrders?.length || 0) === 0 && (
                <tr>
                  <td colSpan={5} className="ms-table__empty">No recent transactions detected</td>
                </tr>
              )}
              {stats?.recentOrders?.map((order) => (
                <tr key={order.id}>
                  <td className="ms-table__strong">{order.orderNumber}</td>
                  <td className="ms-table__muted">{order.customer}</td>
                  <td className="ms-table__mono">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="ms-table__strong">₹{order.total}</td>
                  <td>
                    <SharedBadge
                      variant={
                        order.status === 'DELIVERED' ? 'success' :
                        order.status === 'SHIPPED' ? 'info' :
                        order.status === 'PROCESSING' ? 'warning' :
                        order.status === 'CANCELLED' ? 'error' : 'neutral'
                      }
                    >
                      {order.status}
                    </SharedBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div className="ms-panel ms-panel--alert">
          <div className="ms-panel__header ms-panel__header--alert">
            <div className="ms-panel__head-left">
              <div className="ms-panel__head-icon">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="ms-panel__title">Inventory Alerts</h2>
                <p className="ms-panel__sub">Critical stock levels detected ({"<"} 10 units)</p>
              </div>
            </div>
            <button onClick={() => setIsRestockModalOpen(true)} className="ms-panel__link ms-panel__link--danger">
              Restock All
            </button>
          </div>
          <div className="ms-table-container">
            <table className="ms-table">
              <thead className="ms-table__head">
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Current Stock</th>
                  <th>Status</th>
                  <th className="ms-table__right">Action</th>
                </tr>
              </thead>
              <tbody className="ms-table__body">
                {lowStock.map((product) => (
                  <tr key={product.id}>
                    <td className="ms-table__strong">{product.name}</td>
                    <td className="ms-table__mono">{product.sku}</td>
                    <td>
                      <span className={clsx('ms-panel__stock', product.stock === 0 ? 'ms-panel__stock--out' : 'ms-panel__stock--low')}>
                        {product.stock}
                      </span>
                    </td>
                    <td>
                      <SharedBadge variant={product.stock === 0 ? 'error' : 'warning'}>
                        {product.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                      </SharedBadge>
                    </td>
                    <td className="ms-table__right">
                      <Link href={`/products/edit/${product.id}`} className="ms-panel__manage">Manage</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {isRestockModalOpen && (
        <div className="ms-admin-modal">
          <div className="ms-admin-modal__backdrop" onClick={() => setIsRestockModalOpen(false)} />
          <div className="ms-admin-modal__card">
            <div className="ms-admin-modal__header">
              <div className="ms-admin-modal__head-left">
                <div className="ms-admin-modal__head-icon">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="ms-admin-modal__title">Bulk Restock</h3>
                  <p className="ms-admin-modal__sub">Update stock levels for selected products</p>
                </div>
              </div>
              <button onClick={() => setIsRestockModalOpen(false)} className="ms-admin-modal__close" aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="ms-admin-modal__scroll">
              <table className="ms-table">
                <thead className="ms-table__head">
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={restockItems.every(i => i.selected)}
                        onChange={(e) => setRestockItems(restockItems.map(i => ({ ...i, selected: e.target.checked })))}
                        className="ms-admin-modal__check"
                        aria-label="Select all"
                      />
                    </th>
                    <th>Product</th>
                    <th>Current</th>
                    <th className="ms-table__right">Add Stock</th>
                  </tr>
                </thead>
                <tbody className="ms-table__body">
                  {restockItems.map((item, idx) => (
                    <tr key={item.productId} className={item.selected ? 'ms-admin-modal__row-selected' : 'ms-admin-modal__row-dim'}>
                      <td>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const newItems = [...restockItems]
                            newItems[idx].selected = e.target.checked
                            setRestockItems(newItems)
                          }}
                          className="ms-admin-modal__check"
                          aria-label={`Select ${item.name}`}
                        />
                      </td>
                      <td>
                        <p className="ms-table__strong">{item.name}</p>
                        <p className="ms-table__mono">{item.sku}</p>
                      </td>
                      <td>
                        <SharedBadge variant={item.currentStock === 0 ? 'error' : 'warning'}>
                          {item.currentStock}
                        </SharedBadge>
                      </td>
                      <td className="ms-table__right">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...restockItems]
                            newItems[idx].quantity = parseInt(e.target.value) || 0
                            setRestockItems(newItems)
                          }}
                          className="ms-admin-modal__qty"
                          aria-label={`Restock quantity for ${item.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ms-admin-modal__footer">
              <p className="ms-admin-modal__count">
                {restockItems.filter(i => i.selected).length} products selected
              </p>
              <div className="ms-admin-modal__actions">
                <button onClick={() => setIsRestockModalOpen(false)} className="ms-admin-modal__cancel">
                  Cancel
                </button>
                <SharedButton
                  onClick={handleRestock}
                  isLoading={isRestocking}
                  leftIcon={<Check className="w-4 h-4" />}
                  className="rounded-2xl px-8"
                >
                  Confirm Restock
                </SharedButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
