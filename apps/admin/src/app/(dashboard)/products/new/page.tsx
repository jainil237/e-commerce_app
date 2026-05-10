import { ProductForm } from '@/components/products/product-form'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/products" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add New Product</h1>
          <p className="text-gray-500 text-sm">Create a new product in your catalog.</p>
        </div>
      </div>

      <ProductForm mode="create" />
    </div>
  )
}
