'use client'

import { useState, useEffect } from 'react'
import { MapPin, Plus, Edit2, Trash2, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { useToast } from '@/contexts/toast.context'

import { Input } from '@/components/atoms/Input/Input'
import { Button } from '@/components/atoms/Button/Button'
import './addresses.scss'

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
      <div className="ms-addresses__loading">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  return (
    <div className="ms-addresses">
      <div className="ms-addresses__container">
        <div className="ms-addresses__header">
          <div>
            <h1 className="ms-addresses__title">My Addresses</h1>
            <p className="ms-addresses__subtitle">Manage your saved delivery locations</p>
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
              className="ms-addresses__add-btn"
            >
              Add New Address
            </Button>
          )}
        </div>

        {showForm && (
          <div className="ms-addresses-form">
            <div className="ms-addresses-form__head">
              <h2 className="ms-addresses-form__head-title">
                {editingAddress ? 'Edit Address' : 'Add New Address'}
              </h2>
              <p className="ms-addresses-form__head-sub">Please fill in the details below to save your delivery location.</p>
            </div>

            <form onSubmit={handleSubmit} className="ms-addresses-form__form">
              <div className="ms-addresses-form__grid">
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

              <div className="ms-addresses-form__section">
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

              <div className="ms-addresses-form__grid">
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

              <label className="ms-addresses-check">
                <div className="ms-addresses-check__control">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="ms-addresses-check__input"
                  />
                  <div className="ms-addresses-check__box"></div>
                  <svg className="ms-addresses-check__tick" viewBox="0 0 14 10" fill="none">
                    <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <span className="ms-addresses-check__label">Make this my default address</span>
                  <span className="ms-addresses-check__hint">We will use this address for future checkouts</span>
                </div>
              </label>

              <div className="ms-addresses-form__actions">
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
          <div className="ms-addresses-empty">
            <div className="ms-addresses-empty__icon-wrap">
              <MapPin className="ms-addresses-empty__icon w-10 h-10" />
            </div>
            <h2 className="ms-addresses-empty__title">No addresses saved</h2>
            <p className="ms-addresses-empty__text">Save your home and office addresses for a faster checkout experience.</p>
            <Button
              variant="primary-brand"
              onClick={() => setShowForm(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add New Address
            </Button>
          </div>
        ) : !showForm ? (
          <div className="ms-addresses-grid">
            {addresses.map((address) => (
              <div key={address.id} className="ms-addresses-card">
                {address.isDefault && (
                  <div className="ms-addresses-card__badge">Default</div>
                )}

                <div className="ms-addresses-card__head">
                  <div className="ms-addresses-card__icon-wrap">
                    <MapPin className="ms-addresses-card__icon w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="ms-addresses-card__label">{address.label}</h3>
                    <p className="ms-addresses-card__lines">
                      {address.line1}
                      {address.line2 && <><br />{address.line2}</>}
                    </p>
                    <p className="ms-addresses-card__loc">
                      {address.city}, {address.state} - <span className="ms-addresses-card__pin">{address.pincode}</span>
                    </p>
                  </div>
                </div>

                <div className="ms-addresses-card__actions">
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
                    className="ms-addresses-card__delete"
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
