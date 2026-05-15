'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/providers'
import { ProductDetailsPage } from '@shared/pages/product/ProductDetailsPage'
import { Product } from '@shared/types'

export default function AdminProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const slug = params.slug as string

  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchProduct()
  }, [slug])

  const fetchProduct = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/products/${slug}`)
      const data = await res.json()
      setProduct(data.data || null)
    } catch (error) {
      console.error('Failed to fetch product', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleActive = async () => {
    if (!product) return
    try {
      const res = await fetch(`/api/v1/admin/products/${product.id}/toggle`, {
        method: 'PATCH',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', `Product ${product.isActive ? 'deactivated' : 'activated'}`)
        fetchProduct()
      } else {
        showToast('error', data.message || 'Failed to toggle status')
      }
    } catch (error) {
      showToast('error', 'Something went wrong')
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Product not found</h1>
        <button onClick={() => router.push('/products')} className="text-[var(--brand-primary)] font-bold">
          Back to products
        </button>
      </div>
    )
  }

  return (
    <div className="-m-8">
      <ProductDetailsPage
        product={product as any}
        viewer="admin"
        onBack={() => router.push('/products')}
        onEdit={() => router.push(`/products/edit/${product.id}`)}
        onToggleActive={handleToggleActive}
      />
    </div>
  )
}
