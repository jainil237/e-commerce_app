'use client'

import React from 'react'
import { ArrowLeft, Mail, Phone, Calendar, MapPin, Package, ShoppingBag, ExternalLink } from 'lucide-react'
import { SharedButton, SharedBadge, SharedTableActionCell, SharedTableActionIcon } from '../../components/UIPrimitives'
import { User, Order, ViewerContext } from '../../types'
import { formatDate, formatCurrency } from '../../utils'

interface CustomerDetailsPageProps {
  customer: User
  orders: Order[]
  viewer: ViewerContext
  onBack: () => void
  onViewOrder: (orderId: string) => void
}

export const CustomerDetailsPage: React.FC<CustomerDetailsPageProps> = ({
  customer,
  orders,
  viewer,
  onBack,
  onViewOrder,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-[var(--surface-1)] rounded-full transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-[var(--text-primary)]">
            {viewer === 'admin' ? 'Customer Profile' : 'My Profile'}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {customer.name} • Customer ID: {customer.id.slice(0, 8)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Basic Info & Addresses */}
        <div className="lg:col-span-1 space-y-8">
          {/* Basic Info Card */}
          <div className="card p-6 md:p-8">
            <div className="w-20 h-20 bg-[var(--surface-2)] rounded-3xl flex items-center justify-center text-3xl font-black text-[var(--brand-primary)] mb-6">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            
            <h2 className="text-xl font-bold mb-6">Basic Information</h2>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)]">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Email</p>
                  <p className="text-sm font-medium">{customer.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)]">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Phone</p>
                  <p className="text-sm font-medium">{customer.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-secondary)]">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Member Since</p>
                  <p className="text-sm font-medium">{formatDate(customer.createdAt)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Addresses Card */}
          <div className="card p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Addresses</h2>
              <MapPin className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
            
            <div className="space-y-4">
              {customer.addresses && customer.addresses.length > 0 ? (
                customer.addresses.map((addr) => (
                  <div key={addr.id} className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-[var(--brand-primary)]">
                        {addr.label}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[10px] bg-[var(--brand-primary)] text-white px-2 py-0.5 rounded-full font-bold">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-primary)]">{addr.line1}</p>
                    {addr.line2 && <p className="text-sm text-[var(--text-primary)]">{addr.line2}</p>}
                    <p className="text-sm text-[var(--text-secondary)]">
                      {addr.city}, {addr.state} - {addr.pincode}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] italic">No addresses saved</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Orders */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stats Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-6 bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-accent)] text-white border-none shadow-xl shadow-blue-500/20">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <ShoppingBag className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-white/70 text-[10px] font-black uppercase tracking-widest">Total Orders</p>
                  <p className="text-3xl font-black leading-none mt-1">{customer.orderCount || orders.length}</p>
                </div>
              </div>
            </div>
            
            <div className="card p-6 border-[var(--border-subtle)]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--brand-primary)] border border-[var(--border-subtle)]">
                  <span className="text-2xl font-black">₹</span>
                </div>
                <div>
                  <p className="text-[var(--text-tertiary)] text-[10px] font-black uppercase tracking-widest">Total Spent</p>
                  <p className="text-3xl font-black text-[var(--text-primary)] leading-none mt-1">
                    {formatCurrency(Number(customer.totalSpent || 0))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order History */}
          <div className="card overflow-hidden">
            <div className="p-6 md:p-8 border-b border-[var(--border-subtle)]">
              <h2 className="text-xl font-bold">Order History</h2>
            </div>
            
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-32">Order #</th>
                    <th className="min-w-[150px]">Date</th>
                    <th className="w-32">Status</th>
                    <th className="w-32">Total</th>
                    <th className="w-24 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length > 0 ? (
                    orders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-bold">{order.orderNumber}</td>
                        <td className="text-[var(--text-secondary)]">{formatDate(order.createdAt)}</td>
                        <td>
                          <SharedBadge 
                            variant={
                              order.status === 'DELIVERED' ? 'success' :
                              order.status === 'CANCELLED' ? 'error' : 'info'
                            }
                          >
                            {order.status}
                          </SharedBadge>
                        </td>
                        <td className="font-bold text-[var(--brand-primary)]">
                          {formatCurrency(Number(order.total))}
                        </td>
                        <SharedTableActionCell>
                          <SharedTableActionIcon
                            onClick={() => onViewOrder(order.id)}
                            title="View Order"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </SharedTableActionIcon>
                        </SharedTableActionCell>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-[var(--text-tertiary)] italic">
                        No order history found for this customer
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
