'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Mail, Eye } from 'lucide-react'
import { getFirstLetter } from '@/utils/initials'
import { SharedTableActionCell, SharedTableActionIcon } from '../../../../../../shared/components/UIPrimitives'

interface Customer {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
  orders: number
  totalSpent: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/users`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No customer data available')
      }
      const data = await res.json()
      const mapped: Customer[] = (data.data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        orders: c.orderCount || 0,
        totalSpent: c.totalSpent || '0',
      }))
      setCustomers(mapped)
    } catch {
      setCustomers([])
      setFetchError('No customer data available')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Customers</h1>
      {fetchError && <p className="text-sm text-[var(--text-secondary)] mb-4">{fetchError}</p>}

      <div className="card p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
          <input
            id="customer-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="input pl-10"
            aria-label="Search customers"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th className="min-w-[200px]">Customer</th>
                <th className="w-[150px]">Phone</th>
                <th className="w-[100px]">Orders</th>
                <th className="w-[120px]">Total Spent</th>
                <th className="w-[120px]">Joined</th>
                <th className="w-[120px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-[var(--text-secondary)]">
                    No customer data available
                  </td>
                </tr>
              )}
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[var(--surface-2)] rounded-full flex items-center justify-center font-medium">
                        {getFirstLetter(customer.name)}
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-[var(--text-tertiary)] text-xs">{customer.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-[var(--text-secondary)]">{customer.phone}</td>
                  <td>{customer.orders}</td>
                  <td className="font-medium">₹{customer.totalSpent}</td>
                  <td className="text-[var(--text-secondary)]">
                    {new Date(customer.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <SharedTableActionCell>
                    <SharedTableActionIcon 
                      icon={<Mail />} 
                      href={`mailto:${customer.email}`}
                      title="Send Email"
                    />
                    <SharedTableActionIcon 
                      icon={<Eye />} 
                      href={`/customers/${customer.id}`}
                      title="View Details"
                    />
                  </SharedTableActionCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
