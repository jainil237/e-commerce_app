'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Tag, Truck, ShieldCheck, RotateCcw } from 'lucide-react';
import { FallbackImage } from '../../components/FallbackImage';
import { SharedBadge } from '../../components/UIPrimitives';
import { Product, ViewerContext } from '../../types';
import { formatCurrency, getDiscountPercentage, parseTags } from '../../utils';

// --- Subcomponents ---

export const ProductBreadcrumbs: React.FC<{ product: Product; viewer: ViewerContext }> = ({ product, viewer }) => {
  const isCustomer = viewer === 'customer';
  const homeLink = isCustomer ? '/' : '/dashboard';
  const productsLink = isCustomer ? '/products' : '/products';

  return (
    <nav className="ms-breadcrumb">
      <ol className="ms-breadcrumb">
        <li>
          <Link href={homeLink} className="ms-breadcrumb__link">Home</Link>
        </li>
        <li className="ms-breadcrumb__sep"><ChevronRight size={16} /></li>
        <li>
          <Link href={productsLink} className="ms-breadcrumb__link">Products</Link>
        </li>
        <li className="ms-breadcrumb__sep"><ChevronRight size={16} /></li>
        <li>
          <Link
            href={isCustomer ? `/products?category=${product.category.slug}` : `/categories/${product.category.id}`}
            className="ms-breadcrumb__link"
          >
            {product.category.name}
          </Link>
        </li>
        <li className="ms-breadcrumb__sep"><ChevronRight size={16} /></li>
        <li className="ms-breadcrumb__current">{product.name}</li>
      </ol>
    </nav>
  );
};

export const ProductGallery: React.FC<{ product: Product }> = ({ product }) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const discount = getDiscountPercentage(product.price, product.mrp);

  return (
    <div className="ms-gallery">
      <div className="ms-gallery__main">
        <FallbackImage
          key={selectedImage}
          src={product.images[selectedImage]?.url}
          alt={product.images[selectedImage]?.altText || product.name}
          fill
          className="object-cover"
          priority
        />
        {discount > 0 && (
          <div className="ms-gallery__badge">
            <SharedBadge variant="success">- {discount}%</SharedBadge>
          </div>
        )}
      </div>

      {product.images.length > 1 && (
        <div className="ms-gallery__thumbs">
          {product.images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={`ms-gallery__thumb${selectedImage === index ? ' ms-gallery__thumb--active' : ''}`}
            >
              <FallbackImage
                src={image.url}
                alt={image.altText || `${product.name} ${index + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const ProductInfo: React.FC<{ product: Product; viewer: ViewerContext }> = ({ product, viewer }) => {
  return (
    <div className="ms-pdp-info__pricing">
      <Link href={`/products?category=${product.category.slug}`}>
        <p className="ms-pdp-info__cat">{product.category.name}</p>
      </Link>
      <h1 className="ms-pdp-info__name">{product.name}</h1>

      <div className="ms-pdp-info__stock">
        <div className="ms-pdp-info__stock-indicator">
          <span className={`ms-pdp-info__stock-dot ms-pdp-info__stock-dot--${product.stock > 0 ? 'in' : 'out'}`} />
          <span className={`ms-pdp-info__stock-text ms-pdp-info__stock-text--${product.stock > 0 ? 'in' : 'out'}`}>
            {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
        {viewer === 'admin' && (
          <div className="ms-pdp-info__stock-qty">
            <span style={{ fontWeight: 700 }}>{product.stock}</span> units available
          </div>
        )}
      </div>
    </div>
  );
};

export const ProductPricing: React.FC<{ product: Product; viewer: ViewerContext }> = ({ product, viewer }) => {
  const discount = getDiscountPercentage(product.price, product.mrp);

  return (
    <div className="ms-pdp-info__pricing">
      <div className="ms-pdp-info__price-row">
        <span className="ms-pdp-info__price">{formatCurrency(product.price)}</span>
        {discount > 0 && (
          <>
            <span className="ms-pdp-info__mrp">{formatCurrency(product.mrp)}</span>
            <SharedBadge variant="success">Save {discount}%</SharedBadge>
          </>
        )}
      </div>
      <p className="ms-pdp-info__tax">Inclusive of all taxes</p>

      {viewer === 'admin' && (
        <div className="ms-pdp-admin-pricing">
          <div className="ms-pdp-admin-pricing__row">
            <span>MRP</span>
            <span>{formatCurrency(product.mrp)}</span>
          </div>
          <div className="ms-pdp-admin-pricing__row">
            <span>Selling Price</span>
            <span>{formatCurrency(product.price)}</span>
          </div>
          <div className="ms-pdp-admin-pricing__row ms-pdp-admin-pricing__row--total">
            <span>Margin</span>
            <span>{formatCurrency(Number(product.mrp) - Number(product.price))}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProductSpecifications: React.FC<{ product: Product }> = ({ product }) => {
  const tags = parseTags(product.tags);

  return (
    <div className="ms-spec-card">
      <h3 className="ms-spec-card__title">Specifications</h3>
      <div className="ms-spec-card__grid">
        <div className="ms-spec-card__item">
          <span className="ms-spec-card__key">SKU</span>
          <p className="ms-spec-card__val ms-spec-card__val--mono">{product.sku}</p>
        </div>
        {product.weight && (
          <div className="ms-spec-card__item">
            <span className="ms-spec-card__key">Weight</span>
            <p className="ms-spec-card__val">{product.weight}g</p>
          </div>
        )}
        <div className="ms-spec-card__item">
          <span className="ms-spec-card__key">GST Tier</span>
          <p className="ms-spec-card__val">{product.gstPercent}%</p>
        </div>
        <div className="ms-spec-card__item">
          <span className="ms-spec-card__key">Category</span>
          <p className="ms-spec-card__val">{product.category.name}</p>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="ms-spec-card__tags-section">
          <div className="ms-spec-card__tags-label">
            <Tag size={14} />
            <span>Tags</span>
          </div>
          <div className="ms-spec-card__tags">
            {tags.map(tag => (
              <span key={tag} className="ms-badge ms-badge--neutral ms-badge--sm">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const TrustBadges: React.FC = () => {
  return (
    <div className="ms-trust-row">
      <div className="ms-trust-row__item">
        <div className="ms-trust-row__icon"><Truck size={20} /></div>
        <p className="ms-trust-row__label">Free<br />Delivery</p>
      </div>
      <div className="ms-trust-row__item">
        <div className="ms-trust-row__icon"><ShieldCheck size={20} /></div>
        <p className="ms-trust-row__label">100%<br />Secure</p>
      </div>
      <div className="ms-trust-row__item">
        <div className="ms-trust-row__icon"><RotateCcw size={20} /></div>
        <p className="ms-trust-row__label">Easy<br />Returns</p>
      </div>
    </div>
  );
};
