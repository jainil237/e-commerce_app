import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// jsdom implements neither of these, and the contexts under test call both.
// Guarded because some test files opt into the `node` environment (no DOM at
// all) via a `@vitest-environment node` docblock — this setup file still runs
// for them.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  if (!window.scrollTo) {
    window.scrollTo = (() => {}) as typeof window.scrollTo
  }
}
