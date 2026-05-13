'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, X, Loader2 } from 'lucide-react'
import { useToast } from '@/components/providers'
import { FallbackImage } from '@/components/ui/fallback-image'

interface Category {
  id: string
  name: string
}

interface ProductFormProps {
  initialData?: any
  mode: 'create' | 'edit'
}

export function ProductForm({ initialData, mode }: ProductFormProps) {
  const router = useRouter()
  const { showToast } = useToast()
  
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)
  
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    slug: initialData?.slug || '',
    description: initialData?.description || '',
    price: initialData?.price || '',
    mrp: initialData?.mrp || '',
    stock: initialData?.stock || '0',
    sku: initialData?.sku || '',
    categoryId: initialData?.categoryId || '',
    weight: initialData?.weight || '',
    tags: initialData?.tags || '',
    gstPercent: initialData?.gstPercent || '18',
    isFeatured: initialData?.isFeatured || false,
    isActive: initialData?.isActive !== false,
  })

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch(`/api/v1/admin/categories`, {
          credentials: 'include'
        })
        const data = await res.json()
        if (data.success) {
          setCategories(data.data)
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err)
      }
    }
    fetchCategories()
    
    if (initialData?.images?.length) {
       setImagePreviews(initialData.images.map((img: any) => img.url))
    }
  }, [initialData])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      
      if (images.length + selectedFiles.length > 5) {
        showToast('error', 'Maximum 5 images allowed')
        return
      }

      setImages(prev => [...prev, ...selectedFiles])
      
      selectedFiles.forEach(file => {
        const reader = new FileReader()
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string])
        }
        reader.readAsDataURL(file)
      })
    }
  }

  const removeImage = (index: number) => {
    // Note: Due to limitations, we only allow removing newly added files from form state,
    // or wiping them sequentially. Realistically backend does not support deleting old images without explicit endpoints.
    setImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setIsCreatingCategory(true)
    try {
      const res = await fetch(`/api/v1/admin/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName, description: 'Added from product form' }),
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setCategories(prev => [...prev, data.data].sort((a, b) => a.name.localeCompare(b.name)))
        setFormData(prev => ({ ...prev, categoryId: data.data.id }))
        setIsAddingCategory(false)
        setNewCategoryName('')
        showToast('success', 'Category added successfully')
      } else {
        throw new Error(data.message || 'Failed to create category')
      }
    } catch (err: any) {
      showToast('error', err.message)
    } finally {
      setIsCreatingCategory(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const payload = new FormData()
      
      const jsonData = {
        ...formData,
        tags: formData.tags ? formData.tags.toString().split(',').map((t: string) => t.trim()).join(',') : ''
      }
      
      payload.append('data', JSON.stringify(jsonData))
      images.forEach(img => payload.append('images', img))

      const url = mode === 'create' 
        ? `/api/v1/admin/products`
        : `/api/v1/admin/products/${initialData.id}`

      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        credentials: 'include',
        body: payload
      })

      const data = await res.json()

      if (data.success) {
        showToast('success', `Product ${mode === 'create' ? 'created' : 'updated'} successfully`)
        router.push('/products')
        router.refresh()
      } else {
        throw new Error(data.message || 'Something went wrong')
      }
    } catch (err: any) {
      showToast('error', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Product Name *</label>
            <input 
              id="name"
              name="name"
              required
              type="text" 
              className="input w-full"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium">Slug (auto-generated if empty)</label>
            <input 
              id="slug"
              name="slug"
              type="text" 
              className="input w-full"
              value={formData.slug}
              onChange={e => setFormData({...formData, slug: e.target.value})}
            />
          </div>
          
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="description" className="text-sm font-medium">Description *</label>
            <textarea 
              id="description"
              name="description"
              required
              rows={4}
              className="input w-full"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="categoryId" className="text-sm font-medium">Category *</label>
            {!isAddingCategory ? (
              <select 
                id="categoryId"
                name="categoryId"
                required
                className="input w-full"
                value={formData.categoryId}
                onChange={e => {
                  if (e.target.value === 'new') {
                    setIsAddingCategory(true)
                  } else {
                    setFormData({...formData, categoryId: e.target.value})
                  }
                }}
              >
                <option value="">Select a category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="new" className="font-semibold text-blue-600">+ Add New Category...</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input 
                  id="newCategoryName"
                  name="newCategoryName"
                  type="text"
                  placeholder="New category name"
                  className="input flex-1"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateCategory()
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={!newCategoryName.trim() || isCreatingCategory}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isCreatingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCategory(false)
                    setNewCategoryName('')
                    setFormData(f => ({...f, categoryId: ''}))
                  }}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="sku" className="text-sm font-medium">SKU *</label>
            <input 
              id="sku"
              name="sku"
              required
              type="text" 
              className="input w-full"
              value={formData.sku}
              onChange={e => setFormData({...formData, sku: e.target.value})}
            />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-4">Pricing & Inventory</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="price" className="text-sm font-medium">Selling Price (₹) *</label>
            <input 
              id="price"
              name="price"
              required
              type="number" 
              step="0.01"
              min="0"
              className="input w-full"
              value={formData.price}
              onChange={e => setFormData({...formData, price: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="mrp" className="text-sm font-medium">MRP (₹) *</label>
            <input 
              id="mrp"
              name="mrp"
              required
              type="number" 
              step="0.01"
              min="0"
              className="input w-full"
              value={formData.mrp}
              onChange={e => setFormData({...formData, mrp: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="stock" className="text-sm font-medium">Stock *</label>
            <input 
              id="stock"
              name="stock"
              required
              type="number" 
              min="0"
              className="input w-full"
              value={formData.stock}
              onChange={e => setFormData({...formData, stock: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="gstPercent" className="text-sm font-medium">GST (%) *</label>
            <input 
              id="gstPercent"
              name="gstPercent"
              required
              type="number" 
              step="0.01"
              min="0"
              className="input w-full"
              value={formData.gstPercent}
              onChange={e => setFormData({...formData, gstPercent: e.target.value})}
            />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-4">Media</h2>
        
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {imagePreviews.map((url, i) => (
              <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <FallbackImage src={url} alt={formData.name || 'Product preview'} fill className="object-cover" />
                <button 
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 bg-white rounded-full p-1 shadow-md hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ))}
            
            {imagePreviews.length < 5 && (
              <label htmlFor="image-upload" className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                <Camera className="w-6 h-6 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Add Image</span>
                <input 
                  id="image-upload"
                  name="images"
                  type="file" 
                  accept="image/jpeg,image/png,image/webp" 
                  className="hidden" 
                  onChange={handleImageChange}
                  multiple
                />
              </label>
            )}
          </div>
          <p className="text-sm text-gray-500">Upload up to 5 images (JPEG, PNG, WebP). Max 5MB each.</p>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-semibold mb-4">Additional Details</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="weight" className="text-sm font-medium">Weight (grams)</label>
            <input 
              id="weight"
              name="weight"
              type="number" 
              min="0"
              className="input w-full"
              value={formData.weight}
              onChange={e => setFormData({...formData, weight: e.target.value})}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="tags" className="text-sm font-medium">Tags (comma separated)</label>
            <input 
              id="tags"
              name="tags"
              type="text" 
              className="input w-full"
              value={formData.tags}
              onChange={e => setFormData({...formData, tags: e.target.value})}
            />
          </div>
        </div>

        <div className="flex items-center gap-6 mt-4">
          <label htmlFor="isActive" className="flex items-center gap-2 cursor-pointer">
            <input 
              id="isActive"
              name="isActive"
              type="checkbox" 
              checked={formData.isActive}
              onChange={e => setFormData({...formData, isActive: e.target.checked})}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Active (Visible on store)</span>
          </label>
          
          <label htmlFor="isFeatured" className="flex items-center gap-2 cursor-pointer">
            <input 
              id="isFeatured"
              name="isFeatured"
              type="checkbox" 
              checked={formData.isFeatured}
              onChange={e => setFormData({...formData, isFeatured: e.target.checked})}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Featured Product</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button 
          type="button" 
          onClick={() => router.back()}
          className="btn btn-secondary btn-lg"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn btn-primary btn-lg"
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === 'create' ? 'Create Product' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
