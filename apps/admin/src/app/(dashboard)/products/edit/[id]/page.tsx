'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { ProductForm } from '@/components/products/product-form'
import { useToast } from '@/components/providers'

export default function EditProductPage() {
  const params = useParams()
  const { showToast } = useToast()
  
  const [initialData, setInitialData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchProduct() {
      try {
        const id = params.id as string
        const res = await fetch(`/api/v1/admin/products/${id}`, {
          credentials: 'include'
        })
        const data = await res.json()
        
        if (data.success) {
          setInitialData({
            ...data.data,
            tags: data.data.tags ? data.data.tags : ''
          })
        } else {
          showToast('error', data.message || 'Product not found')
        }
      } catch (e: any) {
        showToast('error', 'Failed to fetch product')
      } finally {
        setIsLoading(false)
      }
    }
    
    if (params.id) {
      fetchProduct()
    }
  }, [params.id, showToast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!initialData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold mb-2">Product not found</h2>
        <Link href="/products" className="text-blue-600 hover:underline">
          Return to products
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Product</h1>
          <p className="text-gray-500 text-sm">Update your existing product catalog entry.</p>
        </div>
      </div>

      <ProductForm mode="edit" initialData={initialData} />
    </div>
  )
}
