import { describe, it, expect } from 'vitest'
import { safeRedirect } from './safe-redirect'

describe('safeRedirect (W-02)', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirect('/orders')).toBe('/orders')
    expect(safeRedirect('/account/settings?tab=security')).toBe('/account/settings?tab=security')
  })

  it('rejects absolute URLs', () => {
    expect(safeRedirect('https://evil.com')).toBe('/account')
    expect(safeRedirect('http://evil.com')).toBe('/account')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirect('//evil.com')).toBe('/account')
    expect(safeRedirect('/\\evil.com')).toBe('/account')
  })

  it('falls back when absent', () => {
    expect(safeRedirect(null)).toBe('/account')
    expect(safeRedirect('')).toBe('/account')
  })
})
