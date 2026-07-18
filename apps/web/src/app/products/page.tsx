import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { ProductsClient } from './products-client'

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

async function getCategories() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  try {
    const res = await fetch(`${apiUrl}/categories`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      console.error(`Failed to fetch categories: ${res.statusText}`)
      return []
    }
    const data = await res.json()
    return data.data || []
  } catch (err) {
    console.error('Error fetching categories:', err)
    return []
  }
}

async function getProducts(searchParams: PageProps['searchParams']) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
  const params = new URLSearchParams()
  
  Object.entries(searchParams).forEach(([key, val]) => {
    if (val) {
      if (Array.isArray(val)) {
        params.set(key, val[0])
      } else {
        params.set(key, val)
      }
    }
  })
  
  if (!params.has('page')) params.set('page', '1')
  if (!params.has('limit')) params.set('limit', '12')

  try {
    const res = await fetch(`${apiUrl}/products?${params.toString()}`, {
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`Failed to fetch products: ${res.statusText}`)
      return { success: false, data: [], meta: { total: 0, page: 1, limit: 12 } }
    }
    return await res.json()
  } catch (err) {
    console.error('Error fetching products:', err)
    return { success: false, data: [], meta: { total: 0, page: 1, limit: 12 } }
  }
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const [categories, initialProductsData] = await Promise.all([
    getCategories(),
    getProducts(searchParams),
  ])

  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" /></div>}>
      <ProductsClient
        initialProductsData={initialProductsData}
        categories={categories}
      />
    </Suspense>
  )
}
