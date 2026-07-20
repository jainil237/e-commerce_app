import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

/**
 * Found during P8 manual QA (320px reflow pass), not part of the original
 * register: this page called /api/v1/cart/validate, which does not exist —
 * the server only has /snapshot and /validate-checkout (cart.routes.ts).
 * Every request 404'd. The catch block only logs, so nothing surfaced the
 * failure; the cart silently never enriched items with live price, stock,
 * or images, and every stock-limit control was inert.
 */

const items = [{ productId: 'p1', quantity: 1, price: 999, name: 'Wireless Charging Pad' }]

vi.mock('@/contexts', () => ({
  useCart: () => ({
    items, removeItem: vi.fn(), updateQuantity: vi.fn(), clearCart: vi.fn(),
    subtotal: 999, totalItems: 1, isHydrated: true,
  }),
  useToast: () => ({ showToast: vi.fn() }),
  useStoreConfig: () => ({ shipping: { freeShippingAbove: 1000, baseShippingCharge: 50 } }),
}))

import CartPage from './page'

describe('Cart (regression: /cart/validate-checkout, not /cart/validate)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/cart/validate-checkout')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: [{
                productId: 'p1',
                valid: true,
                availableStock: 44,
                product: { id: 'p1', name: 'Wireless Charging Pad', slug: 'wireless-charging-pad', price: '999', mrp: '1799', stock: 44, gstPercent: 18, images: [] },
              }],
            },
          }),
        }
      }
      // Any other path — including the old, wrong /cart/validate — 404s,
      // matching the real server's actual behaviour.
      return { ok: false, status: 404, json: async () => ({ success: false }) }
    }) as unknown as ReturnType<typeof vi.fn>
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('calls /cart/validate-checkout and renders the enriched product', async () => {
    render(<CartPage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cart/validate-checkout'),
        expect.anything()
      )
    })

    // Proves the response was actually parsed and rendered, not just requested —
    // this text only appears once productMap is populated from a 200 response.
    await waitFor(() => {
      expect(screen.getByText('Wireless Charging Pad')).toBeInTheDocument()
    })
  })

  it('never requests the stale /cart/validate path', async () => {
    render(<CartPage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const requestedUrls = fetchMock.mock.calls.map((c) => String(c[0]))
    const hitStalePath = requestedUrls.some(
      (u) => u.includes('/cart/validate') && !u.includes('/cart/validate-checkout')
    )
    expect(hitStalePath).toBe(false)
  })
})
