import { api } from './apiSlice'
import type { Product } from '../types'

export interface ProductListParams {
  category?: string | null
  search?: string | null
  sort?: string
  minPrice?: string | null
  maxPrice?: string | null
  inStock?: boolean
  page: number
  limit: number
}

interface ProductListResponse {
  success: boolean
  data: Product[]
  meta?: { total: number; page: number; limit: number }
}

function buildQuery(params: ProductListParams): string {
  const q = new URLSearchParams()
  if (params.category) q.set('category', params.category)
  if (params.search) q.set('search', params.search)
  if (params.sort) q.set('sort', params.sort)
  if (params.minPrice) q.set('minPrice', params.minPrice)
  if (params.maxPrice) q.set('maxPrice', params.maxPrice)
  if (params.inStock) q.set('inStock', 'true')
  q.set('page', String(params.page))
  q.set('limit', String(params.limit))
  return q.toString()
}

export const productsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getProducts: build.query<ProductListResponse, ProductListParams>({
      query: (params) => `products?${buildQuery(params)}`,
      // W-13: refreshing one product used to clear every cached snapshot
      // (inventory-snapshot.ts's forceRefreshSnapshot). RTK Query invalidates
      // by tag instead — a single-product write only busts that product's tag
      // and the list tag, never the other products' individual entries.
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((p) => ({ type: 'Product' as const, id: p.id })),
              { type: 'ProductList' as const },
            ]
          : [{ type: 'ProductList' as const }],
    }),
    getProductBySlug: build.query<{ success: boolean; data: Product & { discount: number } }, string>({
      query: (slug) => `products/${slug}`,
      providesTags: (_result, _error, slug) => [{ type: 'Product', id: slug }],
    }),
  }),
})

export const { useGetProductsQuery, useGetProductBySlugQuery } = productsApi
