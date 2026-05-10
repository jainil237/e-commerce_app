'use client'

import { useState, useEffect } from 'react'
import { Search, Mail, Eye } from 'lucide-react'
import { getFirstLetter } from '@/utils/initials'

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
        totalSpent: '0',
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
      {fetchError && <p className="text-sm text-gray-500 mb-4">{fetchError}</p>}

      <div className="card p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="input pl-10"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>Joined</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No customer data available
                  </td>
                </tr>
              )}
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-medium">
                        {getFirstLetter(customer.name)}
                      </div>
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-gray-400 text-xs">{customer.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-gray-500">{customer.phone}</td>
                  <td>{customer.orders}</td>
                  <td className="font-medium">₹{customer.totalSpent}</td>
                  <td className="text-gray-500">
                    {new Date(customer.createdAt).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <a 
                        href={`mailto:${customer.email}`}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Send Email"
                      >
                        <Mail className="w-4 h-4 text-gray-500" />
                      </a>
                      <button className="p-2 hover:bg-gray-100 rounded-lg" title="View Details">
                        <Eye className="w-4 h-4 text-gray-500" />
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
