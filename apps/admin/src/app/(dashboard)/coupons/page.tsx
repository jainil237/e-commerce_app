'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { useToast } from '@/components/providers'

interface Coupon {
  id: string
  code: string
  type: 'PERCENTAGE' | 'FLAT'
  value: string
  minOrder: string
  maxDiscount: string | null
  usageLimit: number
  usedCount: number
  validFrom: string
  validUntil: string
  isActive: boolean
}

export default function CouponsPage() {
  const { showToast } = useToast()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    type: 'PERCENTAGE',
    value: '',
    minOrder: '0',
    maxDiscount: '',
    usageLimit: '100',
    validFrom: '',
    validUntil: '',
    isActive: true,
  })

  useEffect(() => {
    fetchCoupons()
  }, [])

  const fetchCoupons = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/coupons`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No coupon data available')
      }
      const data = await res.json()
      setCoupons(data.data || [])
    } catch {
      setCoupons([])
      setFetchError('No coupon data available')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = editingCoupon 
      ? `/api/v1/admin/coupons/${editingCoupon.id}`
      : `/api/v1/admin/coupons`
    const method = editingCoupon ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData),
    })

    const data = await res.json()
    if (data.success) {
      showToast('success', editingCoupon ? 'Coupon updated' : 'Coupon created')
      setShowForm(false)
      setEditingCoupon(null)
      setFormData({
        code: '', type: 'PERCENTAGE', value: '', minOrder: '0',
        maxDiscount: '', usageLimit: '100', validFrom: '', validUntil: '', isActive: true
      })
      fetchCoupons()
    } else {
      showToast('error', data.message || 'Failed to save coupon')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coupon?')) return
    const res = await fetch(`/api/v1/admin/coupons/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json()
    if (data.success) {
      showToast('success', 'Coupon deleted')
      fetchCoupons()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <button
          onClick={() => {
            setEditingCoupon(null)
            setFormData({
              code: '', type: 'PERCENTAGE', value: '', minOrder: '0',
              maxDiscount: '', usageLimit: '100', validFrom: '', validUntil: '', isActive: true
            })
            setShowForm(true)
          }}
          className="btn btn-primary btn-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Coupon
        </button>
      </div>
      {fetchError && <p className="text-sm text-gray-500 mb-4">{fetchError}</p>}

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4">{editingCoupon ? 'Edit Coupon' : 'Create Coupon'}</h2>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="input"
                placeholder="SAVE10"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'PERCENTAGE' | 'FLAT' })}
                className="input"
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                className="input"
                placeholder={formData.type === 'PERCENTAGE' ? '10' : '100'}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Order Amount</label>
              <input
                type="number"
                value={formData.minOrder}
                onChange={(e) => setFormData({ ...formData, minOrder: e.target.value })}
                className="input"
                placeholder="500"
              />
            </div>
            {formData.type === 'PERCENTAGE' && (
              <div>
                <label className="block text-sm font-medium mb-1">Max Discount (optional)</label>
                <input
                  type="number"
                  value={formData.maxDiscount}
                  onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                  className="input"
                  placeholder="200"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Usage Limit</label>
              <input
                type="number"
                value={formData.usageLimit}
                onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                className="input"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid From</label>
              <input
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid Until</label>
              <input
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                className="input"
                required
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              <span className="text-sm">Active</span>
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn btn-primary btn-sm">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Min Order</th>
                <th>Usage</th>
                <th>Valid Until</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && coupons.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    No coupon data available
                  </td>
                </tr>
              )}
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="font-mono font-medium">{coupon.code}</td>
                  <td>
                    {coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : `₹${coupon.value}`}
                    {coupon.maxDiscount && <span className="text-gray-400 text-xs"> (max ₹{coupon.maxDiscount})</span>}
                  </td>
                  <td>₹{coupon.minOrder}</td>
                  <td>{coupon.usedCount}/{coupon.usageLimit}</td>
                  <td className="text-gray-500">
                    {new Date(coupon.validUntil).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <span className={`badge ${coupon.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingCoupon(coupon)
                          setFormData({
                            code: coupon.code,
                            type: coupon.type,
                            value: coupon.value,
                            minOrder: coupon.minOrder,
                            maxDiscount: coupon.maxDiscount || '',
                            usageLimit: String(coupon.usageLimit),
                            validFrom: coupon.validFrom.split('T')[0],
                            validUntil: coupon.validUntil.split('T')[0],
                            isActive: coupon.isActive,
                          })
                          setShowForm(true)
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(coupon.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
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
