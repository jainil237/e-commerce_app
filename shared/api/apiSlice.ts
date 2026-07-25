import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

/**
 * The single fetch entry point for both apps. Was three separate `fetcher`
 * definitions (providers.tsx, auth.context.tsx, products-client.tsx) — the
 * third silently dropped credentials, which is exactly the class of bug this
 * consolidation exists to make structurally impossible.
 *
 * baseUrl is relative: both apps proxy /api/v1/* to the server via next.config.js
 * rewrites(), so a relative path stays same-origin and needs no CORS handling.
 * This must stay relative — do not switch to NEXT_PUBLIC_API_URL here, that
 * env var is for server-side (SSR) fetches only, which this client-side layer
 * is not.
 */
// Exported so a test can assert on the declared config directly, rather than
// exercising the real fetch/Request machinery — jsdom and Node's undici
// disagree about Request/AbortSignal internals when a test environment mocks
// global.fetch, which makes an end-to-end HTTP test brittle for no benefit
// here: what actually matters is that these two values are what they should be.
export const baseQueryConfig = {
  baseUrl: '/api/v1',
  credentials: 'include' as const,
}

const baseQuery = fetchBaseQuery(baseQueryConfig)

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Product', 'ProductList'],
  endpoints: () => ({}),
})
