'use client'

import { useEffect, useId, useState } from 'react'
import { Order } from '@shared/types'
import { SharedModal } from '@shared/components/UIPrimitives'

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
  const courierId = useId()
  const awbId = useId()

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

    const url = template.replace('{awb}', encodeURIComponent(awb.trim()))
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
    <SharedModal isOpen={isOpen} onClose={handleClose} title="Track Your Delivery" size="2xl">
      <div className="max-h-[75vh] overflow-y-auto">
          {!trackingUrl ? (
            <div className="space-y-4">
              {/* Courier Dropdown */}
              <div>
                <label htmlFor={courierId} className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  Courier Partner
                </label>
                <select
                  id={courierId}
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
                <label htmlFor={awbId} className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
                  AWB / Tracking Number
                </label>
                <input
                  id={awbId}
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
                /* allow-scripts + allow-same-origin together let the framed page
                   remove its own sandbox. Courier pages are third-party today, but a
                   Store.config.json template pointing at our own origin would then
                   escape into the session, so allow-same-origin stays out. */
                <iframe
                  src={trackingUrl}
                  onError={() => setLoadError(true)}
                  className="w-full h-[500px] border border-[var(--border-base)] rounded-md"
                  sandbox="allow-scripts allow-forms"
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
    </SharedModal>
  )
}
