'use client';

import React, { useState } from 'react';
import { ShoppingCart, Heart, Share2, Info, Edit3, Package, Minus, Plus } from 'lucide-react';
import { Product, ViewerContext } from '../../types';
import { SharedButton } from '../../components/UIPrimitives';
import { 
  ProductBreadcrumbs, 
  ProductGallery, 
  ProductInfo, 
  ProductPricing, 
  ProductSpecifications,
  TrustBadges
} from './components';

interface ProductDetailsPageProps {
  product: Product;
  viewer: ViewerContext;
  onBack?: () => void;
  // Customer actions
  onAddToCart?: (quantity: number) => void;
  onWishlistToggle?: () => void;
  onShare?: () => void;
  isInWishlist?: boolean;
  isAddToCartDisabled?: boolean;
  maxQuantityAllowed?: number;
  cartQuantity?: number;
  // Admin actions
  onEdit?: () => void;
  onToggleActive?: () => void;
}

export const ProductDetailsPage: React.FC<ProductDetailsPageProps> = ({
  product,
  viewer,
  onBack,
  onAddToCart,
  onWishlistToggle,
  onShare,
  isInWishlist = false,
  isAddToCartDisabled = false,
  maxQuantityAllowed = 99,
  cartQuantity = 0,
  onEdit,
  onToggleActive,
}) => {
  const [quantity, setQuantity] = useState(1);
  const isCustomer = viewer === 'customer';
  const isAdmin = viewer === 'admin';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ProductBreadcrumbs product={product} viewer={viewer} />

      <div className="grid lg:grid-cols-12 gap-12">
        {/* Left: Gallery */}
        <div className="lg:col-span-5 xl:col-span-7">
          <ProductGallery product={product} />
        </div>

        {/* Right: Info & Actions */}
        <div className="lg:col-span-7 xl:col-span-5 space-y-10 lg:pl-4">
          <ProductInfo product={product} viewer={viewer} />
          
          <ProductPricing product={product} viewer={viewer} />

          {/* Customer Actions */}
          {isCustomer && (
            <div className="space-y-6 pt-4 border-t border-[var(--border-subtle)]">
              {maxQuantityAllowed > 0 && !isAddToCartDisabled && (
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">Quantity</span>
                  <div className="flex items-center bg-[var(--surface-2)] rounded-xl p-1 border border-[var(--border-subtle)]">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="p-2 hover:bg-[var(--surface-1)] rounded-lg transition-colors text-[var(--text-primary)] disabled:opacity-20"
                      disabled={quantity <= 1}
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <span className="w-12 text-center font-bold text-lg">{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(maxQuantityAllowed, q + 1))}
                      className="p-2 hover:bg-[var(--surface-1)] rounded-lg transition-colors text-[var(--text-primary)] disabled:opacity-20"
                      disabled={quantity >= maxQuantityAllowed}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <SharedButton
                  variant="primary"
                  size="lg"
                  className="flex-1 h-14 rounded-2xl text-lg font-black"
                  onClick={() => onAddToCart?.(quantity)}
                  disabled={isAddToCartDisabled}
                  leftIcon={<ShoppingCart className="w-6 h-6" />}
                >
                  {isAddToCartDisabled ? 'Out of Stock' : 'Add to Cart'}
                </SharedButton>
                
                <SharedButton
                  variant="secondary"
                  size="lg"
                  className="w-14 h-14 p-0 rounded-2xl flex-shrink-0"
                  onClick={onWishlistToggle}
                  leftIcon={<Heart className={`w-6 h-6 ${isInWishlist ? 'fill-red-500 text-red-500' : ''}`} />}
                />

                <SharedButton
                  variant="secondary"
                  size="lg"
                  className="w-14 h-14 p-0 rounded-2xl flex-shrink-0"
                  onClick={onShare}
                  leftIcon={<Share2 className="w-6 h-6" />}
                />
              </div>

              <TrustBadges />
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && (
            <div className="pt-6 border-t border-[var(--border-subtle)] space-y-4">
              <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-4">
                <Package className="w-5 h-5" />
                <span className="text-sm font-medium">Inventory & Management</span>
              </div>
              <div className="flex gap-4">
                <SharedButton
                  variant="primary"
                  size="lg"
                  className="flex-1 rounded-2xl font-bold"
                  onClick={onEdit}
                  leftIcon={<Edit3 className="w-5 h-5" />}
                >
                  Edit Product Details
                </SharedButton>
                <SharedButton
                  variant="secondary"
                  size="lg"
                  className={`flex-1 rounded-2xl font-bold ${product.isActive ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                  onClick={onToggleActive}
                >
                  {product.isActive ? 'Deactivate Product' : 'Activate Product'}
                </SharedButton>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-4 pt-8">
            <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2">
              <Info className="w-6 h-6 text-[var(--brand-primary)]" />
              Product Description
            </h2>
            <div className="prose prose-sm max-w-none text-[var(--text-secondary)] leading-relaxed">
              {product.description}
            </div>
          </div>

          <ProductSpecifications product={product} />
        </div>
      </div>
    </div>
  );
};
