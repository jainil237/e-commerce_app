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
  /** Resolve false if the action failed — the deck only advances on success. */
  onAddToCart: (product: Product) => Promise<boolean>
  onAddToWishlist: (product: Product) => Promise<boolean>
}

// Distance in px before a drag counts as a swipe. Below this the card springs
// back, so a tap that wobbles does not fire an action.
const SWIPE_THRESHOLD = 70

export function SwipeDeck({ products, onAddToCart, onAddToWishlist }: SwipeDeckProps) {
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [leaving, setLeaving] = useState<SwipeAction | null>(null)
  // In-deck confirmation. The global toast fires too, but it lands top-right —
  // far from where a thumb is looking straight after a swipe.
  const [ack, setAck] = useState<{ action: 'cart' | 'wishlist'; name: string } | null>(null)
  const ackTimer = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  // The delta also lives in a ref: pointerup must read the latest value, and
  // React batches the setDrag from pointermove, so a fast flick would otherwise
  // release with stale state and drop the gesture.
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

    // Cart and wishlist advance once the action lands. A failed add stays put:
    // advancing past a product that was never saved would hide the failure.
    const run = action === 'cart' ? onAddToCart : onAddToWishlist
    void run(current).then(ok => {
      if (!ok) return
      setAck({ action, name: current.name })
      if (ackTimer.current) window.clearTimeout(ackTimer.current)
      ackTimer.current = window.setTimeout(() => setAck(null), 1800)
      if (!atEnd) go(1)
    })
  }, [products, index, atStart, atEnd, go, onAddToCart, onAddToWishlist])

  const finish = useCallback((action: SwipeAction | null) => {
    if (action) {
      setLeaving(action)
      window.setTimeout(() => {
        runAction(action)
        setLeaving(null)
      }, 200)
    }
    setDrag(null)
    dragRef.current = null
    startRef.current = null
  }, [runAction])

  const onPointerDown = (e: React.PointerEvent) => {
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

    if (horizontal && Math.abs(x) > SWIPE_THRESHOLD) { finish(x < 0 ? 'next' : 'prev'); return }
    if (!horizontal && Math.abs(y) > SWIPE_THRESHOLD) { finish(y > 0 ? 'cart' : 'wishlist'); return }
    finish(null)
  }

  if (products.length === 0 || !product) return null

  const discount = getDiscountPercentage(product.price, product.mrp)

  // Which direction the current drag is committing to, and how far along it is.
  const horizontal = drag ? Math.abs(drag.x) > Math.abs(drag.y) : false
  const travel = drag ? (horizontal ? Math.abs(drag.x) : Math.abs(drag.y)) : 0
  // 0 → 1 as the card approaches the point of no return.
  const progress = Math.min(travel / SWIPE_THRESHOLD, 1)
  const direction: SwipeAction | null = drag
    ? horizontal ? (drag.x < 0 ? 'next' : 'prev') : (drag.y > 0 ? 'cart' : 'wishlist')
    : null

  const cardStyle = drag
    ? {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.05}deg) scale(${1 - progress * 0.04})`,
        // Fades as it commits, so the exit reads as continuous with the drag.
        opacity: 1 - progress * 0.25,
        transition: 'none',
      }
    : undefined

  return (
    <div className={`ms-swipe-deck${drag ? ' ms-swipe-deck--dragging' : ''}`}>
      {/*
        Dims everything behind the card while a drag is in flight, so the card
        reads as lifted off the page. Opacity follows the drag rather than
        snapping on, and it is inert to pointers so it never eats the gesture.
      */}
      <div
        className="ms-swipe-deck__backdrop"
        style={{ opacity: drag ? progress * 0.55 : 0 }}
        aria-hidden="true"
      />

      <p className="ms-swipe-deck__counter" aria-live="polite">
        {index + 1} of {products.length}
      </p>

      <div className="ms-swipe-deck__stage">
        <div
          className={`ms-swipe-deck__card${leaving ? ` ms-swipe-deck__card--leaving-${leaving}` : ''}`}
          style={cardStyle}
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

          {/*
            Icon only — no labels. The direction is the message, and a word
            sitting over the product photo was clutter. It grows and fades in
            with the drag so intent is legible before the card commits.
          */}
          {direction && (
            <div
              className={`ms-swipe-deck__cue ms-swipe-deck__cue--${direction}`}
              style={{ opacity: progress, transform: `scale(${0.7 + progress * 0.3})` }}
              aria-hidden="true"
            >
              {direction === 'cart' && <ShoppingCart width={30} height={30} />}
              {direction === 'wishlist' && <Heart width={30} height={30} />}
              {direction === 'next' && <ChevronLeft width={30} height={30} />}
              {direction === 'prev' && <ChevronRight width={30} height={30} />}
            </div>
          )}
        </div>
      </div>

      {/*
        Buttons are not a fallback — they are the only way to reach these actions
        with a keyboard or a screen reader.
      */}
      {/*
        Confirms the action that just landed, next to the card rather than in a
        corner. role="status" so it is announced once; the global toast carries
        the same message for anyone who has scrolled away.
      */}
      {ack && (
        <div className={`ms-swipe-deck__ack ms-swipe-deck__ack--${ack.action}`} role="status">
          {ack.action === 'cart' ? <ShoppingCart width={16} height={16} /> : <Heart width={16} height={16} />}
          <span>{ack.action === 'cart' ? 'Added to cart' : 'Saved to wishlist'}</span>
        </div>
      )}

      <div className="ms-swipe-deck__controls">
        <button type="button" className="ms-swipe-deck__control" onClick={() => runAction('prev')}
                disabled={atStart} aria-label="Previous product">
          <ChevronLeft width={20} height={20} />
        </button>
        <button type="button" className="ms-swipe-deck__control ms-swipe-deck__control--wishlist"
                onClick={() => runAction('wishlist')} aria-label={`Add ${product.name} to wishlist`}>
          <Heart width={20} height={20} />
        </button>
        <button type="button" className="ms-swipe-deck__control ms-swipe-deck__control--cart"
                onClick={() => runAction('cart')} aria-label={`Add ${product.name} to cart`}>
          <ShoppingCart width={20} height={20} />
        </button>
        <button type="button" className="ms-swipe-deck__control" onClick={() => runAction('next')}
                disabled={atEnd} aria-label="Next product">
          <ChevronRight width={20} height={20} />
        </button>
      </div>
    </div>
  )
}
