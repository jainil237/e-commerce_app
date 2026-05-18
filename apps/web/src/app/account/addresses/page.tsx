'use client'

import { useState, useEffect } from 'react'
import { MapPin, Plus, Edit2, Trash2, Loader2 } from 'lucide-react'
import { useAuth, useToast } from '@/components/providers'

import { Input } from '@/components/atoms/Input/Input'
import { Button } from '@/components/atoms/Button/Button'

interface Address {
  id: string
  label: string
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  isDefault: boolean
}

export default function AddressesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { showToast } = useToast()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [formData, setFormData] = useState({
    label: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    isDefault: false,
  })

  useEffect(() => {
    fetchAddresses()
  }, [user])

  const fetchAddresses = async () => {
    if (!user) return
    setIsLoading(true)
    const res = await fetch('/api/v1/addresses')
    const data = await res.json()
    setAddresses(data.data || [])
    setIsLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = editingAddress ? `/api/v1/addresses/${editingAddress.id}` : '/api/v1/addresses'
    const method = editingAddress ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })

    const data = await res.json()
    if (data.success) {
      showToast('success', editingAddress ? 'Address updated' : 'Address added')
      setShowForm(false)
      setEditingAddress(null)
      setFormData({ label: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false })
      fetchAddresses()
    } else {
      showToast('error', data.message || 'Failed to save address')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this address?')) return
    const res = await fetch(`/api/v1/addresses/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      showToast('info', 'Address deleted')
      fetchAddresses()
    }
  }

  const handleEdit = (address: Address) => {
    setEditingAddress(address)
    setFormData({
      label: address.label,
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: address.isDefault,
    })
    setShowForm(true)
  }

  if (authLoading || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-16 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">My Addresses</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your saved delivery locations</p>
          </div>
          {!showForm && (
            <Button
              variant="primary-brand"
              onClick={() => {
                setEditingAddress(null)
                setFormData({ label: '', line1: '', line2: '', city: '', state: '', pincode: '', isDefault: false })
                setShowForm(true)
              }}
              leftIcon={<Plus className="w-4 h-4" />}
              className="hidden sm:inline-flex"
            >
              Add New Address
            </Button>
          )}
        </div>

        {showForm && (
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 md:p-8 mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="mb-8 pb-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingAddress ? 'Edit Address' : 'Add New Address'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">Please fill in the details below to save your delivery location.</p>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Input
                  label="Address Label"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g. Home, Office, Other"
                  required
                />
                <Input
                  label="Pincode"
                  type="text"
                  inputMode="numeric"
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 380001"
                  required
                  maxLength={6}
                />
              </div>

              <div className="space-y-6">
                <Input
                  label="Address Line 1"
                  value={formData.line1}
                  onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                  placeholder="House/Flat No., Building Name, Street"
                  required
                />
                <Input
                  label="Address Line 2 (Optional)"
                  value={formData.line2}
                  onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                  placeholder="Area, Landmark, etc."
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Input
                  label="City"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="e.g. Ahmedabad"
                  required
                />
                <Input
                  label="State"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="e.g. Gujarat"
                  required
                />
              </div>

              <div className="pt-2">
                <label className="group flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                      className="peer sr-only"
                    />
                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-md peer-checked:bg-[var(--brand-primary)] peer-checked:border-[var(--brand-primary)] transition-colors"></div>
                    <svg className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" viewBox="0 0 14 10" fill="none">
                      <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block mb-0.5">Make this my default address</span>
                    <span className="text-xs text-gray-500">We will use this address for future checkouts</span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-800">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowForm(false)
                    setEditingAddress(null)
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary-brand"
                  className="w-full sm:w-auto"
                >
                  Save Address
                </Button>
              </div>
            </form>
          </div>
        )}

        {addresses.length === 0 && !showForm ? (
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-[var(--brand-primary)]/5 rounded-full flex items-center justify-center mb-6">
              <MapPin className="w-10 h-10 text-[var(--brand-primary)]" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No addresses saved</h2>
            <p className="text-gray-500 mb-8 max-w-sm text-sm">Save your home and office addresses for a faster checkout experience.</p>
            <Button
              variant="primary-brand"
              onClick={() => setShowForm(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add New Address
            </Button>
          </div>
        ) : !showForm ? (
          <div className="grid md:grid-cols-2 gap-6">
            {addresses.map((address) => (
              <div key={address.id} className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col">
                {address.isDefault && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-xs font-bold px-4 py-1.5 rounded-bl-2xl uppercase tracking-wider">
                      Default
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-4 mb-6 flex-1">
                  <div className="w-12 h-12 rounded-full bg-[var(--brand-primary)]/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-[var(--brand-primary)]" />
                  </div>
                  <div className="pt-1">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{address.label}</h3>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-2 leading-relaxed">
                      {address.line1}
                      {address.line2 && <><br />{address.line2}</>}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {address.city}, {address.state} - <span className="font-semibold text-gray-700 dark:text-gray-300">{address.pincode}</span>
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-5 border-t border-gray-100 dark:border-gray-800">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 font-medium"
                    onClick={() => handleEdit(address)}
                    leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 px-4"
                    onClick={() => handleDelete(address.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
