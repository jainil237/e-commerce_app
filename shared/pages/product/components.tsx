'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Info, Tag, Plus, Minus, ShoppingCart, Heart, Share2, Truck, ShieldCheck, RotateCcw } from 'lucide-react';
import { FallbackImage } from '../../components/FallbackImage';
import { SharedBadge, SharedButton } from '../../components/UIPrimitives';
import { Product, ViewerContext } from '../../types';
import { formatCurrency, getDiscountPercentage, parseTags } from '../../utils';

// --- Subcomponents ---

export const ProductBreadcrumbs: React.FC<{ product: Product; viewer: ViewerContext }> = ({ product, viewer }) => {
  const isCustomer = viewer === 'customer';
  const homeLink = isCustomer ? '/' : '/dashboard';
  const productsLink = isCustomer ? '/products' : '/products';

  return (
    <nav className="mb-6 overflow-x-auto whitespace-nowrap hide-scrollbar">
      <ol className="flex items-center text-sm text-[var(--text-tertiary)]">
        <li><Link href={homeLink} className="hover:text-[var(--text-primary)] transition-colors">Home</Link></li>
        <li><ChevronRight className="w-4 h-4 mx-2" /></li>
        <li><Link href={productsLink} className="hover:text-[var(--text-primary)] transition-colors">Products</Link></li>
        <li><ChevronRight className="w-4 h-4 mx-2" /></li>
        <li>
          <Link 
            href={isCustomer ? `/products?category=${product.category.slug}` : `/categories/${product.category.id}`} 
            className="hover:text-[var(--text-primary)] transition-colors"
          >
            {product.category.name}
          </Link>
        </li>
        <li><ChevronRight className="w-4 h-4 mx-2" /></li>
        <li className="text-[var(--text-primary)] font-medium truncate max-w-[200px]">{product.name}</li>
      </ol>
    </nav>
  );
};

export const ProductGallery: React.FC<{ product: Product }> = ({ product }) => {
  const [selectedImage, setSelectedImage] = useState(0);
  const discount = getDiscountPercentage(product.price, product.mrp);

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/5] bg-[var(--surface-2)] rounded-3xl overflow-hidden group">
        <FallbackImage
          key={selectedImage}
          src={product.images[selectedImage]?.url}
          alt={product.images[selectedImage]?.altText || product.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          priority
        />
        {discount > 0 && (
          <div className="absolute top-4 left-4">
            <SharedBadge variant="success" className="shadow-lg">- {discount}%</SharedBadge>
          </div>
        )}
      </div>

      {product.images.length > 1 && (
        <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
          {product.images.map((image, index) => (
            <button
              key={index}
              onClick={() => setSelectedImage(index)}
              className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                selectedImage === index ? 'border-[var(--brand-primary)]' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
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
    <div className="space-y-2">
      <Link href={`/products?category=${product.category.slug}`}>
        <p className="text-sm font-bold text-[var(--brand-primary)] uppercase tracking-wider">{product.category.name}</p>
      </Link>
      <h1 className="text-3xl font-black text-[var(--text-primary)] leading-tight">{product.name}</h1>
      
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-[var(--success)]' : 'bg-[var(--error)]'}`} />
          <span className={`text-sm font-bold ${product.stock > 0 ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
            {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
          </span>
        </div>
        {viewer === 'admin' && (
          <div className="text-sm text-[var(--text-secondary)] border-l pl-4 border-[var(--border-subtle)]">
            <span className="font-bold">{product.stock}</span> units available
          </div>
        )}
      </div>
    </div>
  );
};

export const ProductPricing: React.FC<{ product: Product; viewer: ViewerContext }> = ({ product, viewer }) => {
  const discount = getDiscountPercentage(product.price, product.mrp);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-black text-[var(--text-primary)]">{formatCurrency(product.price)}</span>
        {discount > 0 && (
          <>
            <span className="text-xl text-[var(--text-tertiary)] line-through font-medium">{formatCurrency(product.mrp)}</span>
            <SharedBadge variant="success">Save {discount}%</SharedBadge>
          </>
        )}
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">Inclusive of all taxes</p>
      
      {viewer === 'admin' && (
        <div className="mt-4 p-4 bg-[var(--surface-0)] rounded-2xl border border-[var(--border-subtle)] shadow-sm space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">MRP</span>
            <span className="font-medium">{formatCurrency(product.mrp)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Selling Price</span>
            <span className="font-medium">{formatCurrency(product.price)}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2 border-[var(--border-subtle)]">
            <span className="text-[var(--text-primary)] font-bold">Margin</span>
            <span className="text-[var(--success)] font-bold">{formatCurrency(Number(product.mrp) - Number(product.price))}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const ProductSpecifications: React.FC<{ product: Product }> = ({ product }) => {
  const tags = parseTags(product.tags);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface-0)] rounded-3xl p-6 border border-[var(--border-subtle)] shadow-sm">
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Specifications</h3>
        <div className="grid grid-cols-2 gap-y-4 gap-x-8">
          <div className="space-y-1">
            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">SKU</span>
            <p className="text-sm font-mono font-medium text-[var(--text-primary)] uppercase">{product.sku}</p>
          </div>
          {product.weight && (
            <div className="space-y-1">
              <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">Weight</span>
              <p className="text-sm font-medium text-[var(--text-primary)]">{product.weight}g</p>
            </div>
          )}
          <div className="space-y-1">
            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">GST Tier</span>
            <p className="text-sm font-medium text-[var(--text-primary)]">{product.gstPercent}%</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">Category</span>
            <p className="text-sm font-medium text-[var(--text-primary)]">{product.category.name}</p>
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-wider">Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-full text-xs font-medium text-[var(--text-secondary)]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const TrustBadges: React.FC = () => {
  return (
    <div className="grid grid-cols-3 gap-4 py-6 border-y border-[var(--border-subtle)]">
      <div className="text-center space-y-2">
        <div className="w-10 h-10 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto">
          <Truck className="w-5 h-5 text-[var(--brand-primary)]" />
        </div>
        <p className="text-[10px] font-bold text-[var(--text-secondary)] leading-tight">Free<br/>Delivery</p>
      </div>
      <div className="text-center space-y-2">
        <div className="w-10 h-10 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto">
          <ShieldCheck className="w-5 h-5 text-[var(--brand-primary)]" />
        </div>
        <p className="text-[10px] font-bold text-[var(--text-secondary)] leading-tight">100%<br/>Secure</p>
      </div>
      <div className="text-center space-y-2">
        <div className="w-10 h-10 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto">
          <RotateCcw className="w-5 h-5 text-[var(--brand-primary)]" />
        </div>
        <p className="text-[10px] font-bold text-[var(--text-secondary)] leading-tight">Easy<br/>Returns</p>
      </div>
    </div>
  );
};
