'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { useToast } from '@/components/providers'

interface StoreConfig {
  store: {
    name: string
    tagline: string
    logo: string
    email: string
    phone: string
    address: string
  }
  branding: {
    primaryColor: string
    secondaryColor: string
  }
  shipping: {
    freeShippingMin: string
    defaultCharge: string
  }
  features: {
    guestCheckout: boolean
    wishlist: boolean
    coupons: boolean
    cod: boolean
  }
}

export default function SettingsPage() {
  const { showToast } = useToast()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/settings`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No settings data available')
      }
      const data = await res.json()
      setConfig(data.data || null)
    } catch {
      setConfig(null)
      setFetchError('No settings data available')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!config) {
      showToast('error', 'No settings data available')
      return
    }
    setIsSaving(true)
    const res = await fetch(`/api/v1/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(config),
    })
    const data = await res.json()
    if (data.success) {
      showToast('success', 'Settings saved')
    } else {
      showToast('error', data.message || 'Failed to save')
    }
    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!config) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <div className="card p-6">
          <p className="text-gray-500">{fetchError || 'No settings data available'}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-primary btn-md"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </button>
      </div>

      <div className="space-y-6">
        {/* Store Info */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Store Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Store Name</label>
              <input
                type="text"
                value={config?.store.name || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  store: { ...config!.store, name: e.target.value }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tagline</label>
              <input
                type="text"
                value={config?.store.tagline || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  store: { ...config!.store, tagline: e.target.value }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={config?.store.email || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  store: { ...config!.store, email: e.target.value }
                })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={config?.store.phone || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  store: { ...config!.store, phone: e.target.value }
                })}
                className="input"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Address</label>
              <textarea
                value={config?.store.address || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  store: { ...config!.store, address: e.target.value }
                })}
                className="input"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Branding */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Branding</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={config?.branding.primaryColor || '#3b82f6'}
                  onChange={(e) => setConfig({
                    ...config!,
                    branding: { ...config!.branding, primaryColor: e.target.value }
                  })}
                  className="w-12 h-10 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={config?.branding.primaryColor || ''}
                  onChange={(e) => setConfig({
                    ...config!,
                    branding: { ...config!.branding, primaryColor: e.target.value }
                  })}
                  className="input flex-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Secondary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={config?.branding.secondaryColor || '#1e40af'}
                  onChange={(e) => setConfig({
                    ...config!,
                    branding: { ...config!.branding, secondaryColor: e.target.value }
                  })}
                  className="w-12 h-10 rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={config?.branding.secondaryColor || ''}
                  onChange={(e) => setConfig({
                    ...config!,
                    branding: { ...config!.branding, secondaryColor: e.target.value }
                  })}
                  className="input flex-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Shipping */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Shipping</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Free Shipping Minimum</label>
              <input
                type="number"
                value={config?.shipping.freeShippingMin || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  shipping: { ...config!.shipping, freeShippingMin: e.target.value }
                })}
                className="input"
                placeholder="500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Shipping Charge</label>
              <input
                type="number"
                value={config?.shipping.defaultCharge || ''}
                onChange={(e) => setConfig({
                  ...config!,
                  shipping: { ...config!.shipping, defaultCharge: e.target.value }
                })}
                className="input"
                placeholder="50"
              />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Features</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config?.features.guestCheckout || false}
                onChange={(e) => setConfig({
                  ...config!,
                  features: { ...config!.features, guestCheckout: e.target.checked }
                })}
                className="w-4 h-4"
              />
              <span>Enable Guest Checkout</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config?.features.wishlist || false}
                onChange={(e) => setConfig({
                  ...config!,
                  features: { ...config!.features, wishlist: e.target.checked }
                })}
                className="w-4 h-4"
              />
              <span>Enable Wishlist</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config?.features.coupons || false}
                onChange={(e) => setConfig({
                  ...config!,
                  features: { ...config!.features, coupons: e.target.checked }
                })}
                className="w-4 h-4"
              />
              <span>Enable Coupons</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config?.features.cod || false}
                onChange={(e) => setConfig({
                  ...config!,
                  features: { ...config!.features, cod: e.target.checked }
                })}
                className="w-4 h-4"
              />
              <span>Enable Cash on Delivery</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
