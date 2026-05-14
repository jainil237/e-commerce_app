'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Minus, Plus, ShoppingCart, Heart, Share2, ChevronRight, Truck, ShieldCheck, RotateCcw, Package, Info, Tag } from 'lucide-react'
import { useCart, useToast, useStoreConfig, useAuth, useWishlist } from '@/components/providers'
import { refreshSnapshot, getSnapshot } from '@/lib/inventory-snapshot'
import { FallbackImage } from '@/components/ui/fallback-image'
import { Button } from '@/components/atoms/Button/Button'
import { Badge } from '@/components/atoms/Badge/Badge'
import styles from './product.module.css'

interface Product {
  id: string
  slug: string
  name: string
  description: string
  price: string
  mrp: string
  stock: number
  sku: string
  gstPercent: number
  weight?: number
  tags?: string[]
  images: Array<{ url: string; altText?: string; sortOrder: number }>
  category: { id: string; name: string; slug: string }
}

export default function ProductDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const { addItem, items: cartItems } = useCart()
  const { showToast } = useToast()
  const config = useStoreConfig()
  const { user } = useAuth()
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist()

  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    async function fetchProduct() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/v1/products/${slug}`)
        const data = await res.json()
        const fetchedProduct = data.data || null
        setProduct(fetchedProduct)
        if (fetchedProduct) {
          refreshSnapshot(fetchedProduct.id).catch(() => {})
        }
      } catch (error) {
        console.error("Failed to fetch product", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchProduct()
  }, [slug])

  if (isLoading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 mt-4">
            <div className="lg:col-span-5 xl:col-span-6 skeleton aspect-[4/5] rounded-3xl" />
            <div className="lg:col-span-7 xl:col-span-6 space-y-6 mt-4">
              <div className="skeleton h-6 w-32" />
              <div className="skeleton h-12 w-3/4" />
              <div className="skeleton h-10 w-1/3" />
              <div className="skeleton h-32 mt-8" />
              <div className="skeleton h-16 mt-8" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className={styles.wrapper}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center flex flex-col items-center justify-center">
          <div className="w-24 h-24 bg-[var(--surface-2)] rounded-full flex items-center justify-center mb-6">
            <Package className="w-12 h-12 text-[var(--text-tertiary)]" />
          </div>
          <h1 className="text-3xl font-black mb-4 text-[var(--text-primary)]">Product not found</h1>
          <p className="text-[var(--text-secondary)] mb-8 max-w-md">The product you're looking for doesn't exist or has been removed.</p>
          <Link href="/products">
            <Button variant="primary" size="lg">Browse all products</Button>
          </Link>
        </div>
      </div>
    )
  }

  const discount = Math.round((1 - Number(product.price) / Number(product.mrp)) * 100)

  // Use snapshot's effectiveAvailableQty (stock minus OTHER users' reservations only).
  // The user's own reservation is NOT subtracted — they can freely adjust their cart qty up to this limit.
  const snapshot = product ? getSnapshot(product.id) : null
  const effectiveStock = snapshot?.effectiveAvailableQty ?? product.stock

  // Get existing cart quantity for this product
  const existingCartItem = cartItems.find(item => item.productId === product?.id)
  const existingCartQty = existingCartItem?.quantity || 0

  // remainingAddable = how many MORE the user can add beyond what's already in cart
  // effectiveStock already includes the user's own reservation as "available"
  const remainingAddable = Math.max(0, effectiveStock - existingCartQty)

  // Determine if add-to-cart should be disabled
  const isAddToCartDisabled = remainingAddable <= 0
  const maxQuantityAllowed = Math.max(1, remainingAddable)

  const handleAddToCart = () => {
    if (isAddToCartDisabled) return
    addItem(product.id, quantity, { price: Number(product.price), name: product.name })
    showToast('success', `Added ${quantity} item${quantity > 1 ? 's' : ''} to cart`)
  }

  const wishlisted = isInWishlist(product.id)

  const handleWishlistToggle = async () => {
    if (!user) {
      showToast('info', 'Sign in to save to wishlist')
      return
    }
    if (wishlisted) {
      await removeFromWishlist(product.id)
      showToast('info', 'Removed from wishlist')
    } else {
      await addToWishlist(product.id)
      showToast('success', 'Added to wishlist')
    }
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text: `Check out ${product.name} on ${config.store.name}`,
          url: window.location.href,
        })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        showToast('success', 'Link copied to clipboard')
      }
    } catch (err) {
      console.error('Share failed', err)
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumbNav}>
        <ol className={styles.breadcrumbList}>
          <li><Link href="/" className={styles.breadcrumbLink}>Home</Link></li>
          <li><ChevronRight className={styles.breadcrumbSeparator} /></li>
          <li><Link href="/products" className={styles.breadcrumbLink}>Products</Link></li>
          <li><ChevronRight className={styles.breadcrumbSeparator} /></li>
          <li><Link href={`/products?category=${product.category.slug}`} className={styles.breadcrumbLink}>{product.category.name}</Link></li>
          <li><ChevronRight className={styles.breadcrumbSeparator} /></li>
          <li className={styles.breadcrumbCurrent}>{product.name}</li>
        </ol>
      </nav>

      <div className={styles.container}>
        <div className={styles.layoutGrid}>
          {/* Left Column: Images */}
          <div className={styles.imageSection}>
            <div className={`${styles.mainImageWrapper} group`}>
              <FallbackImage
                key={selectedImage}
                src={product.images[selectedImage]?.url}
                alt={product.images[selectedImage]?.altText || product.name}
                fill
                className={`${styles.mainImage} group-hover:scale-105`}
                priority
              />
              {discount > 0 && (
                <div className={styles.discountBadge}>
                  <Badge variant="success" size="lg" className="shadow-lg">- {discount}%</Badge>
                </div>
              )}
            </div>

            {product.images.length > 1 && (
              <div className={styles.thumbnailGallery}>
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`${styles.thumbnailBtn} ${selectedImage === index ? styles.thumbnailBtnActive : styles.thumbnailBtnInactive}`}
                    aria-label={`Select image ${index + 1}`}
                  >
                    <FallbackImage
                      src={image.url}
                      alt={image.altText || `${product.name} ${index + 1}`}
                      fill
                      className={styles.thumbnailImage}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Details */}
          <div className={styles.detailsSection}>
            <div className={styles.headerBlock}>
              <Link href={`/products?category=${product.category.slug}`}>
                <p className={styles.categoryLabel}>{product.category.name}</p>
              </Link>
              <h1 className={styles.title}>{product.name}</h1>
              
              <div className={styles.statusRow}>
                {effectiveStock > 0 ? (
                  <>
                    <span className={`${styles.statusIndicator} bg-[var(--success)]`} />
                    <span className="text-[var(--success)]">In Stock</span>
                    {effectiveStock < 10 && (
                      <span className={styles.stockAlert}>
                        {existingCartQty > 0 
                          ? `Hurry! Only ${remainingAddable} more available (${existingCartQty} in cart)`
                          : `Hurry! Only ${effectiveStock} left`
                        }
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className={`${styles.statusIndicator} bg-[var(--error)]`} />
                    <span className="text-[var(--error)]">
                      {existingCartQty >= effectiveStock 
                        ? 'Maximum available quantity already added'
                        : 'Out of Stock'
                      }
                    </span>
                  </>
                )}
              </div>

              <div className="mt-6">
                <div className={styles.pricingBlock}>
                  <span className={styles.price}>{config.store.currencySymbol}{product.price}</span>
                  {Number(product.mrp) > Number(product.price) && (
                    <>
                      <span className={styles.mrp}>{config.store.currencySymbol}{product.mrp}</span>
                      <Badge variant="success" size="sm">Save {discount}%</Badge>
                    </>
                  )}
                </div>
                <p className={styles.taxNotice}>Inclusive of all taxes</p>
              </div>
            </div>

            {/* Actions Block */}
            <div className={styles.actionBlock}>
              {remainingAddable > 0 && (
                <div className={styles.quantityRow}>
                  <span className={styles.quantityLabel}>Quantity:</span>
                  <div className={styles.quantityCtrl}>
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className={styles.quantityBtn}
                      disabled={quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <span className={styles.quantityValue}>{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxQuantityAllowed, q + 1))}
                      className={styles.quantityBtn}
                      disabled={quantity >= maxQuantityAllowed}
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.actionBtns}>
                <Button
                  variant="primary"
                  size="lg"
                  className={styles.cartBtn}
                  onClick={handleAddToCart}
                  disabled={isAddToCartDisabled}
                  leftIcon={<ShoppingCart className="w-5 h-5" />}
                >
                  {isAddToCartDisabled 
                    ? (existingCartQty >= effectiveStock ? 'Maximum quantity added' : 'Out of Stock')
                    : 'Add to Cart'
                  }
                </Button>
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className={styles.secondaryBtn} 
                  onClick={handleWishlistToggle}
                  aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart className={`w-6 h-6 transition-colors ${wishlisted ? 'fill-red-500 text-red-500' : ''}`} />
                </Button>
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className={styles.secondaryBtn}
                  onClick={handleShare}
                  aria-label="Share product"
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Trust Badges */}
            <div className={styles.trustGrid}>
              <div className={styles.trustItem}>
                <div className={styles.trustIconWrapper}>
                  <Truck className="w-6 h-6" />
                </div>
                <p className={styles.trustText}>Free Delivery<br/><span className="text-xs text-[var(--text-tertiary)] font-normal">Above {config.store.currencySymbol}{config.shipping.freeShippingAbove}</span></p>
              </div>
              <div className={styles.trustItem}>
                <div className={styles.trustIconWrapper}>
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <p className={styles.trustText}>100% Secure<br/><span className="text-xs text-[var(--text-tertiary)] font-normal">Encrypted payment</span></p>
              </div>
              <div className={styles.trustItem}>
                <div className={styles.trustIconWrapper}>
                  <RotateCcw className="w-6 h-6" />
                </div>
                <p className={styles.trustText}>Easy Returns<br/><span className="text-xs text-[var(--text-tertiary)] font-normal">7-day policy</span></p>
              </div>
            </div>

            {/* Description */}
            <div className={styles.descriptionBlock}>
              <h2 className={styles.sectionTitle}>
                <Info className="w-5 h-5 text-brand-primary" />
                Product Details
              </h2>
              <div className={styles.description}>
                <p>{product.description}</p>
              </div>
            </div>

            {/* Product Specifications */}
            <div className={styles.metadataPanel}>
              <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Specifications</h3>
              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>SKU</span>
                  <span className={`${styles.metaValue} font-mono uppercase`}>{product.sku}</span>
                </div>
                {product.weight && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Item Weight</span>
                    <span className={styles.metaValue}>{product.weight}g</span>
                  </div>
                )}
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>GST Tier</span>
                  <span className={styles.metaValue}>{product.gstPercent}%</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Category</span>
                  <span className={styles.metaValue}>{product.category.name}</span>
                </div>
              </div>

              {(() => {
                const tags = Array.isArray(product.tags) 
                  ? product.tags 
                  : (typeof product.tags === 'string' ? (product.tags as string).split(',').map(t => t.trim()).filter(Boolean) : []);
                
                if (tags.length === 0) return null;

                return (
                  <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-4 h-4 text-[var(--text-tertiary)]" />
                      <span className={styles.metaLabel}>Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <span key={tag} className="px-3 py-1 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-full text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>



        


          </div>

        </div>
      </div>
    </div>
  )
}
