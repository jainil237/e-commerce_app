import Link from 'next/link'
import { FallbackImage } from '@/components/ui/fallback-image'
import { getFirstLetter } from '@/utils/initials'

interface Category {
  id: string
  name: string
  slug: string
  imageUrl?: string
  productCount?: number
}

interface CategoryCardProps {
  category: Category
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link href={`/products?category=${category.slug}`}>
      <div className="card overflow-hidden group">
        <div className="relative aspect-square bg-gray-100">
          {category.imageUrl ? (
            <FallbackImage
              src={category.imageUrl}
              alt={category.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200">
              <span className="text-4xl font-bold text-blue-300">{getFirstLetter(category.name)}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-white font-semibold text-lg">{category.name}</h3>
            {category.productCount !== undefined && (
              <p className="text-white/80 text-sm">{category.productCount} products</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
