'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Search, Edit2, Trash2, Eye, MoreVertical } from 'lucide-react'
import { useToast } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'

interface Product {
  id: string
  slug: string
  name: string
  price: string
  mrp: string
  stock: number
  isActive: boolean
  category: { name: string }
  images: Array<{ url: string }>
}

export default function ProductsPage() {
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/v1/admin/products`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('No product data available')
      }
      const data = await res.json()
      setProducts(data.data || [])
    } catch {
      setProducts([])
      setFetchError('No product data available')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return
    const res = await fetch(`/api/v1/admin/products/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await res.json()
    if (data.success) {
      showToast('success', 'Product deleted')
      fetchProducts()
    } else {
      showToast('error', data.message || 'Failed to delete')
    }
  }

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link href="/products/new" className="btn btn-primary btn-md">
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Link>
      </div>
      {fetchError && <p className="text-sm text-gray-500 mb-4">{fetchError}</p>}

      <div className="card p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="input pl-10"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No product data available
                  </td>
                </tr>
              )}
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden">
                        <FallbackImage
                          src={product.images[0]?.url}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </td>
                  <td className="text-gray-500">{product.category?.name}</td>
                  <td>
                    <span className="font-medium">₹{product.price}</span>
                    {Number(product.mrp) > Number(product.price) && (
                      <span className="text-gray-400 line-through ml-2">₹{product.mrp}</span>
                    )}
                  </td>
                  <td>
                    <span className={product.stock < 10 ? 'text-red-600 font-medium' : ''}>
                      {product.stock}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${product.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Link 
                        href={`/products/${product.slug}`} 
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="View"
                      >
                        <Eye className="w-4 h-4 text-gray-500" />
                      </Link>
                      <Link 
                        href={`/products/edit/${product.id}`} 
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </Link>
                      <button 
                        onClick={() => handleDelete(product.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
