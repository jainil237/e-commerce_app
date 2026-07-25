import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useState } from 'react'
import { ToastProvider, useToast } from './toast.context'

/**
 * W-06 / W-17.
 *
 * showToast sits in the dependency arrays of cart's addItem and updateQuantity,
 * so if its identity changes on every render those callbacks are rebuilt too —
 * which is what makes the checkout refetch loop (W-03) cheap to retrigger.
 */
describe('ToastProvider (W-06, W-17)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps showToast identity stable across unrelated parent re-renders', () => {
    const seen: Array<(t: 'success' | 'error' | 'info', m: string) => void> = []
    let bump: () => void = () => {}

    function Consumer() {
      const { showToast } = useToast()
      seen.push(showToast)
      return null
    }

    function Parent() {
      const [, setN] = useState(0)
      bump = () => setN(n => n + 1)
      return (
        <ToastProvider>
          <Consumer />
        </ToastProvider>
      )
    }

    render(<Parent />)
    act(() => { bump() })
    act(() => { bump() })

    expect(seen.length).toBeGreaterThanOrEqual(3)
    expect(new Set(seen).size).toBe(1)
  })

  it('keeps showToast identity stable when a toast is raised and expires', () => {
    const seen: Array<(t: 'success' | 'error' | 'info', m: string) => void> = []

    function Consumer() {
      const { showToast } = useToast()
      seen.push(showToast)
      return null
    }

    render(<ToastProvider><Consumer /></ToastProvider>)
    const first = seen[0]

    act(() => { first('success', 'added to cart') })
    act(() => { vi.advanceTimersByTime(3500) })

    expect(new Set(seen).size).toBe(1)
  })

  it('clears pending toast-removal timers on unmount', () => {
    let show: (t: 'success' | 'error' | 'info', m: string) => void = () => {}
    function Consumer() {
      show = useToast().showToast
      return null
    }

    const { unmount } = render(<ToastProvider><Consumer /></ToastProvider>)
    act(() => { show('info', 'pending') })

    // React 18 no longer warns on setState-after-unmount, so observe the
    // cleanup directly: the pending timer must actually be cleared.
    const cleared = vi.spyOn(globalThis, 'clearTimeout')
    unmount()

    expect(cleared).toHaveBeenCalled()
    cleared.mockRestore()
  })
})
