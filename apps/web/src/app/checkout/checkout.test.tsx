import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
const clearCart = vi.fn()
const showToast = vi.fn()

const cartItems = [{ productId: 'p1', quantity: 2, price: 100, name: 'Thing' }]

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))
// Every mocked hook must return a stable identity. Returning a fresh object
// per call makes any effect keyed on it loop forever, which is a bug in the
// test rather than in the page.
const authValue = { user: { id: 'u1', name: 'A', email: 'a@b.c' }, isLoading: false }
const cartValue = { items: cartItems, subtotal: 200, clearCart, isHydrated: true }
const toastValue = { showToast }
const configValue = {
  shipping: { freeShippingAbove: 1000, baseShippingCharge: 50 },
  store: { name: 'Test', primaryColor: '#000' },
}

vi.mock('@/contexts/auth.context', () => ({ useAuth: () => authValue }))
vi.mock('@/contexts/cart.context', () => ({ useCart: () => cartValue }))
vi.mock('@/contexts/toast.context', () => ({ useToast: () => toastValue }))
vi.mock('@/contexts/store-config.context', () => ({ useStoreConfig: () => configValue }))

import CheckoutPage from './page'

/** Server says the product is 120, not the 100 held in localStorage. */
const validateResponse = {
  success: true,
  data: { items: [{ productId: 'p1', quantity: 2, valid: true, product: { id: 'p1', name: 'Thing', price: 120 } }] },
}

let orderCalls = 0

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/addresses')) {
      return json({ success: true, data: [{ id: 'a1', isDefault: true, name: 'Home', line1: 'X', city: 'Y', state: 'Z', pincode: '1', phone: '2' }] })
    }
    if (u.includes('validate-checkout')) return json(validateResponse)
    if (u.includes('coupons/available')) return json({ success: true, data: [] })
    if (u.includes('/orders') && init?.method === 'POST') {
      orderCalls++
      return json({ success: true, data: { order: { id: 'o1' }, razorpay: { key: 'rzp_test_placeholder', orderId: 'ro1', amount: 1, currency: 'INR' } } })
    }
    return json({ success: true, data: {} })
  })
}

/** A real-looking key takes the Razorpay script branch instead of mock mode. */
function mockFetchWithRealKey() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/addresses')) {
      return json({ success: true, data: [{ id: 'a1', isDefault: true, name: 'Home', line1: 'X', city: 'Y', state: 'Z', pincode: '1', phone: '2' }] })
    }
    if (u.includes('validate-checkout')) return json(validateResponse)
    if (u.includes('coupons/available')) return json({ success: true, data: [] })
    if (u.includes('/orders') && init?.method === 'POST') {
      orderCalls++
      return json({ success: true, data: { order: { id: 'o1' }, razorpay: { key: 'rzp_live_abc123', orderId: 'ro1', amount: 1, currency: 'INR' } } })
    }
    return json({ success: true, data: {} })
  })
}

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response

function mockFetchWithFailingAddresses() {
  return vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/addresses')) return json({ success: false }, false)
    if (u.includes('validate-checkout')) return json(validateResponse)
    if (u.includes('coupons/available')) return json({ success: true, data: [] })
    return json({ success: true, data: {} })
  })
}

describe('Checkout (W-03, W-04, W-07)', () => {
  beforeEach(() => {
    orderCalls = 0
    vi.stubGlobal('fetch', mockFetch())
    vi.stubGlobal('localStorage', {
      getItem: () => 'sess-1', setItem: () => {}, removeItem: () => {},
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('W-03: does not refetch validate-checkout in a loop', async () => {
    render(<CheckoutPage />)
    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some((c: unknown[]) => String(c[0]).includes('validate-checkout'))).toBe(true)
    })
    // Let any feedback loop run: each setState would retrigger the effect.
    await new Promise(r => setTimeout(r, 300))

    const validateCalls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => String(c[0]).includes('validate-checkout')).length

    // Unbounded before the fix. Allow for StrictMode double-invocation.
    expect(validateCalls).toBeLessThanOrEqual(2)
  })

  it('W-07: totals use the server-confirmed price, not the localStorage one', async () => {
    const { container } = render(<CheckoutPage />)
    // localStorage subtotal is 200 (2 x 100); server says 240 (2 x 120).
    // 240 is under the 1000 free-shipping threshold, so total = 240 + 50 = 290.
    // Before the fix the page showed 200 + 50 = 250 — a price the server would
    // not have charged. Asserted on whole-document text because the currency
    // formatter may split the value across nodes.
    await waitFor(() => {
      expect(container.textContent).toMatch(/290/)
    })
    expect(container.textContent).not.toMatch(/250/)
  })

  it('W-04: a second pay click while one order is in flight creates no second order', async () => {
    const user = userEvent.setup()
    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /place order|pay/i })).toBeEnabled())
    const payButton = screen.getByRole('button', { name: /place order|pay/i })

    await user.click(payButton)
    await user.click(payButton)
    await user.click(payButton)

    await waitFor(() => expect(orderCalls).toBeGreaterThan(0))
    expect(orderCalls).toBe(1)
  })

  it('W-09: a failed address fetch renders a distinct error, not the empty state', async () => {
    vi.stubGlobal('fetch', mockFetchWithFailingAddresses())
    render(<CheckoutPage />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load/i)
    })
    // The pre-fix behaviour: an unhandled rejection left the UI showing this
    // exact empty-list copy, indistinguishable from a genuinely empty address book.
    expect(screen.queryByText(/no saved addresses found/i)).not.toBeInTheDocument()
  })

  it('Review finding: releases the guard if the Razorpay SDK throws on open()', async () => {
    vi.stubGlobal('fetch', mockFetchWithRealKey())

    // jsdom does not execute injected <script> tags, so script.onload never
    // fires on its own — intercept the element to drive it deterministically
    // and stand in for the SDK constructor throwing.
    let scriptEl: HTMLScriptElement | undefined
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'script') scriptEl = el as HTMLScriptElement
      return el
    })
    ;(window as unknown as { Razorpay: unknown }).Razorpay = class {
      constructor() {
        throw new Error('SDK failed to initialize')
      }
    }

    const user = userEvent.setup()
    render(<CheckoutPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /place order|pay/i })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: /place order|pay/i }))

    await waitFor(() => expect(scriptEl).toBeDefined())
    scriptEl!.onload?.(new Event('load'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /place order|pay/i })).toBeEnabled()
    })
    expect(showToast).toHaveBeenCalledWith('error', expect.stringMatching(/payment gateway/i))
  })
})
