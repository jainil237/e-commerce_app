import { describe, it, expect } from 'vitest'
import { makeStore } from '@shared/state/store'
import { productsApi } from '@shared/api/productsApi'
import { baseQueryConfig } from '@shared/api/apiSlice'

/**
 * P7 / R6. Exercises the actual RTK Query wiring: the single baseQuery config
 * (credentials included, relative baseUrl — the third of the old fetcher
 * trio silently dropped this) and the cache tags meant to replace
 * inventory-snapshot.ts's "clear everything to refresh one product"
 * behaviour (W-13).
 *
 * Deliberately does not exercise the real fetch/Request pipeline: jsdom and
 * Node's undici disagree about Request/AbortSignal internals when a test
 * mocks global.fetch, which is an environment-compatibility problem, not
 * something this app's code does wrong. `upsertQueryData` seeds the cache
 * through the same reducer path a real response would, without touching
 * the network layer, which is what the tag-shape assertion actually needs.
 *
 * Note: W-13 itself is not closed by this test or this phase. Tags are
 * proven correct here for the read side; no mutation endpoint exists yet to
 * invalidate them — that lands when cart/checkout migrates.
 */
describe('RTK Query foundation', () => {
  it('the single baseQuery sends credentials and uses a relative, same-origin URL', () => {
    // Relative, not absolute: both apps proxy /api/v1/* same-origin via
    // next.config.js rewrites(). An absolute NEXT_PUBLIC_API_URL base here
    // would be the F-1/W-08 class of bug (a cross-origin credentialed fetch)
    // this consolidation exists to prevent.
    expect(baseQueryConfig.baseUrl).toBe('/api/v1')
    expect(baseQueryConfig.baseUrl.startsWith('/')).toBe(true)
    expect(baseQueryConfig.baseUrl).not.toMatch(/^https?:\/\//)
    expect(baseQueryConfig.credentials).toBe('include')
  })

  it('tags each product individually, not just the list — the mechanism W-13 needs', async () => {
    const store = makeStore()
    const args = { page: 1, limit: 12 }

    await store.dispatch(
      productsApi.util.upsertQueryData('getProducts', args, {
        success: true,
        data: [
          { id: 'p1', name: 'A', slug: 'a', category: { id: 'c', name: 'C', slug: 'c' } },
          { id: 'p2', name: 'B', slug: 'b', category: { id: 'c', name: 'C', slug: 'c' } },
        ] as never,
        meta: { total: 2, page: 1, limit: 12 },
      })
    )

    // Invalidating p1 alone must not touch p2's cached entry — that per-id
    // scoping is exactly what forceRefreshSnapshot lacks today.
    const invalidatedByP1 = productsApi.util.selectInvalidatedBy(store.getState(), [
      { type: 'Product', id: 'p1' },
    ])
    expect(invalidatedByP1.some((e) => e.endpointName === 'getProducts')).toBe(true)

    const invalidatedByUnrelatedId = productsApi.util.selectInvalidatedBy(store.getState(), [
      { type: 'Product', id: 'does-not-exist' },
    ])
    expect(invalidatedByUnrelatedId.length).toBe(0)

    // The list tag exists independently, so a write that only changes the
    // list (e.g. a new product) can invalidate without touching per-id tags.
    const invalidatedByList = productsApi.util.selectInvalidatedBy(store.getState(), [
      { type: 'ProductList' },
    ])
    expect(invalidatedByList.some((e) => e.endpointName === 'getProducts')).toBe(true)
  })
})
