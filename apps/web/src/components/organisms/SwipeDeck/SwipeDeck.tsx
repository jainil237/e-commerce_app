'use client'

import './swipe-deck.scss'
import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ShoppingCart, Heart } from 'lucide-react'
import { formatCurrency, getDiscountPercentage } from '@shared/utils'
import type { Product } from '@shared/types'

type SwipeAction = 'prev' | 'next' | 'cart' | 'wishlist'

export interface SwipeDeckProps {
  products: Product[]
  onAddToCart: (product: Product) => void | Promise<void>
  onAddToWishlist: (product: Product) => void | Promise<void>
}

// Distance in px before a drag counts as a swipe. Below this the card springs
// back, so a tap that wobbles does not fire an action.
const SWIPE_THRESHOLD = 70

export function SwipeDeck({ products, onAddToCart, onAddToWishlist }: SwipeDeckProps) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [leaving, setLeaving] = useState<SwipeAction | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  // The delta also lives in a ref: pointerup must read the latest value, and
  // React batches the setDrag from pointermove, so a fast flick would otherwise
  // release with stale (or null) state and drop the gesture.
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const product = products[index]
  const atStart = index === 0
  const atEnd = index >= products.length - 1

  const go = useCallback((delta: number) => {
    setIndex(i => Math.min(Math.max(i + delta, 0), products.length - 1))
  }, [products.length])

  const runAction = useCallback((action: SwipeAction) => {
    const current = products[index]
    if (!current) return

    if (action === 'prev') { if (!atStart) go(-1); return }
    if (action === 'next') { if (!atEnd) go(1); return }

    // Cart and wishlist keep the card in place — the customer is acting on this
    // product, not dismissing it, and auto-advancing would hide what they did.
    if (action === 'cart') void onAddToCart(current)
    if (action === 'wishlist') void onAddToWishlist(current)
  }, [products, index, atStart, atEnd, go, onAddToCart, onAddToWishlist])

  const finish = useCallback((action: SwipeAction | null) => {
    if (action) {
      setLeaving(action)
      // Let the card animate out before the state change swaps its content.
      window.setTimeout(() => {
        runAction(action)
        setLeaving(null)
      }, 180)
    }
    setDrag(null)
    dragRef.current = null
    startRef.current = null
  }, [runAction])

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore secondary buttons and anything starting on a control.
    if (e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    dragRef.current = { x: 0, y: 0 }
    setDrag({ x: 0, y: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return
    const next = { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y }
    dragRef.current = next
    setDrag(next)
  }

  const onPointerUp = () => {
    const current = dragRef.current
    if (!current) { finish(null); return }

    const { x, y } = current
    // Whichever axis travelled further wins, so a diagonal flick resolves to one
    // action rather than firing both.
    const horizontal = Math.abs(x) > Math.abs(y)

    if (horizontal && Math.abs(x) > SWIPE_THRESHOLD) {
      finish(x < 0 ? 'next' : 'prev')
      return
    }
    if (!horizontal && Math.abs(y) > SWIPE_THRESHOLD) {
      finish(y > 0 ? 'cart' : 'wishlist')
      return
    }
    finish(null)
  }

  if (products.length === 0) return null
  if (!product) return null

  const discount = getDiscountPercentage(product.price, product.mrp)

  // Live drag feedback: follow the finger, with a slight tilt on horizontal moves.
  const dragStyle = drag
    ? {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04}deg)`,
        transition: 'none',
      }
    : undefined

  // Which hint to light up while dragging.
  const activeHint: SwipeAction | null = drag
    ? Math.abs(drag.x) > Math.abs(drag.y)
      ? Math.abs(drag.x) > SWIPE_THRESHOLD ? (drag.x < 0 ? 'next' : 'prev') : null
      : Math.abs(drag.y) > SWIPE_THRESHOLD ? (drag.y > 0 ? 'cart' : 'wishlist') : null
    : null

  return (
    <div className="ms-swipe-deck">
      <p className="ms-swipe-deck__counter" aria-live="polite">
        {index + 1} of {products.length}
      </p>

      <div className="ms-swipe-deck__stage">
        {/* Direction hints, lit as the drag passes the threshold. */}
        <span className={`ms-swipe-deck__hint ms-swipe-deck__hint--up${activeHint === 'wishlist' ? ' is-active' : ''}`}>
          <Heart width={16} height={16} /> Wishlist
        </span>
        <span className={`ms-swipe-deck__hint ms-swipe-deck__hint--down${activeHint === 'cart' ? ' is-active' : ''}`}>
          <ShoppingCart width={16} height={16} /> Add to cart
        </span>

        <div
          className={`ms-swipe-deck__card${leaving ? ` ms-swipe-deck__card--leaving-${leaving}` : ''}`}
          style={dragStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => finish(null)}
        >
          <Link href={`/products/${product.slug}`} className="ms-swipe-deck__media" draggable={false}>
            {product.images?.[0]?.url ? (
              <img
                src={product.images[0].url}
                alt={product.images[0].altText || product.name}
                className="ms-swipe-deck__image"
                draggable={false}
              />
            ) : (
              <div className="ms-swipe-deck__image ms-swipe-deck__image--fallback" />
            )}
          </Link>

          <div className="ms-swipe-deck__body">
            {product.category?.name && (
              <p className="ms-swipe-deck__eyebrow">{product.category.name}</p>
            )}
            <Link href={`/products/${product.slug}`} className="ms-swipe-deck__name">
              {product.name}
            </Link>
            <p className="ms-swipe-deck__price">
              <span className="ms-swipe-deck__price-now">{formatCurrency(product.price)}</span>
              {discount > 0 && (
                <>
                  <span className="ms-swipe-deck__price-mrp">{formatCurrency(product.mrp)}</span>
                  <span className="ms-swipe-deck__badge">{discount}% off</span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/*
        Buttons are not a fallback — they are the only way to reach these actions
        with a keyboard or a screen reader, and swipe alone would make the mode
        unusable for anyone who cannot perform the gesture.
      */}
      <div className="ms-swipe-deck__controls">
        <button
          type="button"
          className="ms-swipe-deck__control"
          onClick={() => runAction('prev')}
          disabled={atStart}
          aria-label="Previous product"
        >
          <ChevronLeft width={22} height={22} />
        </button>
        <button
          type="button"
          className="ms-swipe-deck__control ms-swipe-deck__control--wishlist"
          onClick={() => runAction('wishlist')}
          aria-label={`Add ${product.name} to wishlist`}
        >
          <Heart width={22} height={22} />
        </button>
        <button
          type="button"
          className="ms-swipe-deck__control ms-swipe-deck__control--cart"
          onClick={() => runAction('cart')}
          aria-label={`Add ${product.name} to cart`}
        >
          <ShoppingCart width={22} height={22} />
        </button>
        <button
          type="button"
          className="ms-swipe-deck__control"
          onClick={() => runAction('next')}
          disabled={atEnd}
          aria-label="Next product"
        >
          <ChevronRight width={22} height={22} />
        </button>
      </div>

      <p className="ms-swipe-deck__legend">
        Swipe left/right to browse · up to save · down to add to cart
      </p>
    </div>
  )
}
