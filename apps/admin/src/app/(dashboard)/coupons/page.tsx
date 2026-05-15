'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { useToast } from '@/components/providers'
import { Coupon } from '@shared/types'
import { SharedTableActionCell, SharedTableActionIcon, SharedBadge } from '../../../../../../shared/components/UIPrimitives'

export default function CouponsPage() {
  const { showToast } = useToast()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [formData, setFormData] = useState({
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    minOrderValue: '0',
    maxUsage: '100',
    perUserLimit: '1',
    expiresAt: '',
    validFrom: '',
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
        code: '', discountType: 'PERCENTAGE', discountValue: '', minOrderValue: '0',
        maxUsage: '100', perUserLimit: '1', expiresAt: '', validFrom: '', isActive: true
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
              code: '', discountType: 'PERCENTAGE', discountValue: '', minOrderValue: '0',
              maxUsage: '100', perUserLimit: '1', expiresAt: '', validFrom: '', isActive: true
            })
            setShowForm(true)
          }}
          className="btn btn-primary btn-md"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Coupon
        </button>
      </div>
      {fetchError && <p className="text-sm text-[var(--text-secondary)] mb-4">{fetchError}</p>}

      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4">{editingCoupon ? 'Edit Coupon' : 'Create Coupon'}</h2>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="coupon-code" className="block text-sm font-medium mb-1">Code</label>
              <input
                id="coupon-code"
                name="code"
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="input"
                placeholder="SAVE10"
                required
              />
            </div>
            <div>
              <label htmlFor="discount-type" className="block text-sm font-medium mb-1">Type</label>
              <select
                id="discount-type"
                name="discountType"
                value={formData.discountType}
                onChange={(e) => setFormData({ ...formData, discountType: e.target.value as 'PERCENTAGE' | 'FLAT' })}
                className="input"
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat Amount</option>
              </select>
            </div>
            <div>
              <label htmlFor="discount-value" className="block text-sm font-medium mb-1">Value</label>
              <input
                id="discount-value"
                name="discountValue"
                type="number"
                value={formData.discountValue}
                onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                className="input"
                placeholder={formData.discountType === 'PERCENTAGE' ? '10' : '100'}
                required
              />
            </div>
            <div>
              <label htmlFor="min-order" className="block text-sm font-medium mb-1">Min Order Amount</label>
              <input
                id="min-order"
                name="minOrderValue"
                type="number"
                value={formData.minOrderValue}
                onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                className="input"
                placeholder="500"
              />
            </div>
            <div>
              <label htmlFor="usage-limit" className="block text-sm font-medium mb-1">Total Usage Limit</label>
              <input
                id="usage-limit"
                name="maxUsage"
                type="number"
                value={formData.maxUsage}
                onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                className="input"
                placeholder="100"
              />
            </div>
            <div>
              <label htmlFor="per-user-limit" className="block text-sm font-medium mb-1">Per Customer Limit</label>
              <input
                id="per-user-limit"
                name="perUserLimit"
                type="number"
                value={formData.perUserLimit}
                onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
                className="input"
                placeholder="1"
              />
            </div>
            <div>
              <label htmlFor="valid-from" className="block text-sm font-medium mb-1">Valid From</label>
              <input
                id="valid-from"
                name="validFrom"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="expires-at" className="block text-sm font-medium mb-1">Expires At</label>
              <input
                id="expires-at"
                name="expiresAt"
                type="date"
                value={formData.expiresAt}
                onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                className="input"
                required
              />
            </div>
            <label htmlFor="is-active" className="flex items-center gap-2">
              <input
                id="is-active"
                name="isActive"
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
                <th className="min-w-[120px]">Code</th>
                <th className="w-[100px]">Discount</th>
                <th className="w-[120px]">Min Order</th>
                <th className="w-[120px]">Total Usage</th>
                <th className="w-[120px]">Per Customer</th>
                <th className="w-[120px]">Valid From</th>
                <th className="w-[120px]">Valid Until</th>
                <th className="w-[100px]">Status</th>
                <th className="w-[120px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && coupons.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-[var(--text-secondary)]">
                    No coupon data available
                  </td>
                </tr>
              )}
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="font-mono font-medium">{coupon.code}</td>
                  <td>
                    {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}
                  </td>
                  <td>₹{coupon.minOrderValue || '0'}</td>
                  <td>{coupon.usedCount}/{coupon.maxUsage || '∞'}</td>
                  <td>{coupon.perUserLimit || '1'}</td>
                  <td className="text-[var(--text-secondary)]">
                    {coupon.validFrom ? new Date(coupon.validFrom).toLocaleDateString('en-IN') : '-'}
                  </td>
                  <td className="text-[var(--text-secondary)]">
                    {coupon.expiresAt ? new Date(coupon.expiresAt).toLocaleDateString('en-IN') : 'No expiry'}
                  </td>
                  <td>
                    <SharedBadge variant={coupon.isActive ? 'success' : 'gray'}>
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </SharedBadge>
                  </td>
                  <SharedTableActionCell>
                    <SharedTableActionIcon 
                      icon={<Edit2 />} 
                      onClick={() => {
                        setEditingCoupon(coupon)
                        setFormData({
                          code: coupon.code,
                          discountType: coupon.discountType,
                          discountValue: String(coupon.discountValue) ?? '',
                          minOrderValue: String(coupon.minOrderValue) || '0',
                          maxUsage: String(coupon.maxUsage) || '',
                          perUserLimit: String(coupon.perUserLimit) || '1',
                          expiresAt: coupon.expiresAt ? coupon.expiresAt.split('T')[0] : '',
                          validFrom: coupon.validFrom ? coupon.validFrom.split('T')[0] : '',
                          isActive: coupon.isActive,
                        })
                        setShowForm(true)
                      }}
                      title="Edit"
                    />
                    <SharedTableActionIcon 
                      icon={<Trash2 />} 
                      onClick={() => handleDelete(coupon.id)}
                      variant="danger"
                      title="Delete"
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
