'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Order } from '@shared/types'

interface TrackingModalProps {
  isOpen: boolean
  onClose: () => void
  order: Order
}

export const TrackingModal: React.FC<TrackingModalProps> = ({ isOpen, onClose, order }) => {
  const [partners, setPartners] = useState<string[]>([])
  const [trackingUrls, setTrackingUrls] = useState<Record<string, string>>({})
  const [selectedCourier, setSelectedCourier] = useState<string>('')
  const [awb, setAwb] = useState<string>('')
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch courier config on mount
  useEffect(() => {
    if (isOpen) {
      fetchCourierConfig()
      // Pre-fill from order tracking data if available
      if (order.tracking) {
        setSelectedCourier(order.tracking.courier || '')
        setAwb(order.tracking.trackingId || '')
      }
    }
  }, [isOpen, order.tracking])

  const fetchCourierConfig = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/v1/orders/courier-config')
      const data = await res.json()
      if (data.success && data.data) {
        setPartners(data.data.partners || [])
        setTrackingUrls(data.data.trackingUrls || {})
      }
    } catch (error) {
      console.error('Failed to fetch courier config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTrack = () => {
    if (!selectedCourier || !awb.trim()) {
      return
    }

    const template = trackingUrls[selectedCourier]
    if (!template) {
      return
    }

    const url = template.replace('{awb}', awb.trim())
    setTrackingUrl(url)
    setLoadError(false)
  }

  const handleClose = () => {
    setTrackingUrl(null)
    setLoadError(false)
    setSelectedCourier(order.tracking?.courier || '')
    setAwb(order.tracking?.trackingId || '')
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface-0)] rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-base)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Track Your Delivery</h2>
          <button
            onClick={handleClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!trackingUrl ? (
            <div className="space-y-4">
              {/* Courier Dropdown */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Courier Partner
                </label>
                <select
                  value={selectedCourier}
                  onChange={(e) => setSelectedCourier(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-2 border border-[var(--border-base)] rounded-md bg-[var(--surface-0)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                >
                  <option value="">Select a courier...</option>
                  {partners.map((partner) => (
                    <option key={partner} value={partner}>
                      {partner}
                    </option>
                  ))}
                </select>
              </div>

              {/* AWB Input */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  AWB / Tracking Number
                </label>
                <input
                  type="text"
                  value={awb}
                  onChange={(e) => setAwb(e.target.value)}
                  placeholder="Enter your tracking number"
                  className="w-full px-4 py-2 border border-[var(--border-base)] rounded-md bg-[var(--surface-0)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                />
              </div>

              {/* Track Button */}
              <button
                onClick={handleTrack}
                disabled={!selectedCourier || !awb.trim()}
                className="w-full px-4 py-2 bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] font-semibold rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Track Delivery
              </button>
            </div>
          ) : (
            /* Iframe or Fallback */
            <div className="space-y-4">
              {loadError ? (
                <div className="text-center py-8">
                  <p className="text-[var(--text-secondary)] mb-4">
                    Unable to load tracking page in this browser
                  </p>
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] font-semibold rounded-md hover:opacity-90 transition"
                  >
                    Open in New Tab
                  </a>
                </div>
              ) : (
                <iframe
                  src={trackingUrl}
                  onError={() => setLoadError(true)}
                  className="w-full h-[500px] border border-[var(--border-base)] rounded-md"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title="Courier Tracking Page"
                />
              )}

              {/* Back Button */}
              <button
                onClick={() => {
                  setTrackingUrl(null)
                  setLoadError(false)
                }}
                className="w-full px-4 py-2 border border-[var(--border-base)] text-[var(--text-primary)] font-semibold rounded-md hover:bg-[var(--surface-2)] transition"
              >
                Enter Different Tracking Number
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
