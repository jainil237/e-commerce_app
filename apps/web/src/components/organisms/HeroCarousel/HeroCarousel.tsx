'use client'

import './hero-carousel.scss'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency, getDiscountPercentage } from '@shared/utils'

export interface HeroCarouselProduct {
  id: string
  slug: string
  name: string
  price: string
  mrp: string
  images?: Array<{ url: string }>
  category?: { name: string }
}

const AUTOPLAY_MS = 3500

export function HeroCarousel({ products }: { products: HeroCarouselProduct[] }) {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const count = products.length

  const goTo = useCallback((next: number) => {
    setIndex(((next % count) + count) % count)
  }, [count])

  // Autoplay pauses on hover/focus, and for anyone who asked for less motion.
  const prefersReducedMotion = useRef(false)
  useEffect(() => {
    prefersReducedMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (count <= 1 || isPaused || prefersReducedMotion.current) return
    const id = setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [count, isPaused])

  if (count === 0) return null

  return (
    <section
      className="ms-hero-carousel"
      aria-roledescription="carousel"
      aria-label="Featured products"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
    >
      <div className="ms-hero-carousel__viewport">
        <div
          className="ms-hero-carousel__track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {products.map((product, i) => {
            const discount = getDiscountPercentage(product.price, product.mrp)
            return (
              // The whole slide is the link — the brief asks for clicking a
              // slide to open its product.
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="ms-hero-carousel__slide"
                // Off-screen slides must not be reachable by keyboard.
                tabIndex={i === index ? 0 : -1}
                aria-hidden={i !== index}
                aria-label={`${product.name}, ${formatCurrency(product.price)}`}
              >
                {product.images?.[0]?.url ? (
                  <img
                    src={product.images[0].url}
                    alt=""
                    className="ms-hero-carousel__image"
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                ) : (
                  <div className="ms-hero-carousel__image ms-hero-carousel__image--fallback" />
                )}

                <div className="ms-hero-carousel__scrim" />

                <div className="ms-hero-carousel__content">
                  {product.category?.name && (
                    <p className="ms-hero-carousel__eyebrow">{product.category.name}</p>
                  )}
                  <h2 className="ms-hero-carousel__title">{product.name}</h2>
                  <p className="ms-hero-carousel__price">
                    <span className="ms-hero-carousel__price-now">
                      {formatCurrency(product.price)}
                    </span>
                    {discount > 0 && (
                      <>
                        <span className="ms-hero-carousel__price-mrp">
                          {formatCurrency(product.mrp)}
                        </span>
                        <span className="ms-hero-carousel__badge">{discount}% off</span>
                      </>
                    )}
                  </p>
                  <span className="ms-hero-carousel__cta">Shop this product</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="ms-hero-carousel__nav ms-hero-carousel__nav--prev"
            onClick={() => goTo(index - 1)}
            aria-label="Previous product"
          >
            <ChevronLeft width={22} height={22} />
          </button>
          <button
            type="button"
            className="ms-hero-carousel__nav ms-hero-carousel__nav--next"
            onClick={() => goTo(index + 1)}
            aria-label="Next product"
          >
            <ChevronRight width={22} height={22} />
          </button>

          <div className="ms-hero-carousel__dots" role="tablist" aria-label="Choose product">
            {products.map((product, i) => (
              <button
                key={product.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={product.name}
                className={`ms-hero-carousel__dot${i === index ? ' ms-hero-carousel__dot--active' : ''}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
