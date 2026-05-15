'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/providers'
import { CustomerDetailsPage } from '@shared/pages/customer/CustomerDetailsPage'
import { User, Order } from '@shared/types'

export default function AdminCustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const id = params.id as string

  const [customer, setCustomer] = useState<User | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchCustomerData()
  }, [id])

  const fetchCustomerData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${id}`, {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        setCustomer(data.data)
        setOrders(data.data.orders || [])
      } else {
        showToast('error', data.message || 'Failed to fetch customer data')
      }
    } catch (error) {
      console.error('Failed to fetch customer', error)
      showToast('error', 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Customer not found</h1>
        <button onClick={() => router.push('/customers')} className="text-[var(--brand-primary)] font-bold">
          Back to customers
        </button>
      </div>
    )
  }

  return (
    <div className="-m-8">
      <CustomerDetailsPage
        customer={customer}
        orders={orders}
        viewer="admin"
        onBack={() => router.push('/customers')}
        onViewOrder={(orderId) => router.push(`/orders/${orderId}`)}
      />
    </div>
  )
}
