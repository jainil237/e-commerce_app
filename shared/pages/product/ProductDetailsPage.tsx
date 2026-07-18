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
    <div className="ms-pdp-layout">
      {/* Left: Gallery */}
      <div>
        <ProductGallery product={product} />
      </div>

      {/* Right: Info & Actions */}
      <div className="ms-pdp-info">
        <ProductInfo product={product} viewer={viewer} />

        <ProductPricing product={product} viewer={viewer} />

        {/* Customer Actions */}
        {isCustomer && (
          <div className="ms-pdp-info__actions">
            {maxQuantityAllowed > 0 && !isAddToCartDisabled && (
              <div className="ms-pdp-info__qty-row">
                <span className="ms-pdp-info__qty-label">Quantity</span>
                <div className="ms-pdp-info__qty-ctrl">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="ms-pdp-info__qty-btn"
                    disabled={quantity <= 1}
                  >
                    <Minus size={20} />
                  </button>
                  <span className="ms-pdp-info__qty-value">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(maxQuantityAllowed, q + 1))}
                    className="ms-pdp-info__qty-btn"
                    disabled={quantity >= maxQuantityAllowed}
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            )}

            <div className="ms-pdp-info__cta-row">
              <SharedButton
                variant="primary"
                size="lg"
                className="ms-pdp-info__cta-main"
                onClick={() => onAddToCart?.(quantity)}
                disabled={isAddToCartDisabled}
                leftIcon={<ShoppingCart size={22} />}
              >
                {isAddToCartDisabled ? 'Out of Stock' : 'Add to Cart'}
              </SharedButton>

              <SharedButton
                variant="secondary"
                size="lg"
                className="ms-pdp-info__cta-icon"
                onClick={onWishlistToggle}
                leftIcon={<Heart size={22} style={isInWishlist ? { fill: 'var(--error)', color: 'var(--error)' } : undefined} />}
              />

              <SharedButton
                variant="secondary"
                size="lg"
                className="ms-pdp-info__cta-icon"
                onClick={onShare}
                leftIcon={<Share2 size={22} />}
              />
            </div>

            <TrustBadges />
          </div>
        )}

        {/* Admin Actions */}
        {isAdmin && (
          <div className="ms-pdp-admin-actions">
            <div className="ms-pdp-admin-actions__label">
              <Package size={18} />
              <span>Inventory &amp; Management</span>
            </div>
            <div className="ms-pdp-admin-actions__row">
              <SharedButton
                variant="primary"
                size="lg"
                onClick={onEdit}
                leftIcon={<Edit3 size={18} />}
              >
                Edit Product Details
              </SharedButton>
              <SharedButton
                variant="secondary"
                size="lg"
                onClick={onToggleActive}
              >
                {product.isActive ? 'Deactivate Product' : 'Activate Product'}
              </SharedButton>
            </div>
          </div>
        )}

        {/* Description */}
        <div className="ms-pdp-info__section">
          <h2 className="ms-pdp-info__section-title">
            <Info size={22} style={{ color: 'var(--brand-primary)' }} />
            Product Description
          </h2>
          <p className="ms-pdp-info__description">{product.description}</p>
        </div>

        <ProductSpecifications product={product} />
      </div>
    </div>
  );
};
