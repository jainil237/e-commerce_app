'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useAuth } from './auth.context'
import { useToast } from './toast.context'
import { validateCartQuantity, clearSnapshots, forceRefreshSnapshot } from '../lib/inventory-snapshot'

export interface CartItem {
  productId: string   // Product.id — unique identifier per product
  quantity: number
  price: number       // selling price per unit (persisted for offline subtotal)
  name: string        // product name (for display even before API roundtrip)
}

/** Shape stored in localStorage under the "cart" key */
export interface CartData {
  userId: string | null   // null = guest, string = logged-in user's id
  items: CartItem[]
}

const CartContext = createContext<{
  items: CartItem[]
  addItem: (productId: string, quantity?: number, productMeta?: { price: number; name: string }) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
  isHydrated: boolean
}>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
  subtotal: 0,
  isHydrated: false,
})

// ─── localStorage helpers ───
const CART_KEY = 'cart'

function loadCartData(): CartData {
  if (typeof window === 'undefined') return { userId: null, items: [] }
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return { userId: null, items: [] }
    const parsed = JSON.parse(raw)

    // Handle legacy format – old code stored a plain CartItem[] array
    if (Array.isArray(parsed)) {
      return {
        userId: null,
        items: parsed.map(migrateItem),
      }
    }

    // New format: { userId, items }
    return {
      userId: parsed.userId ?? null,
      items: Array.isArray(parsed.items) ? parsed.items.map(migrateItem) : [],
    }
  } catch {
    localStorage.removeItem(CART_KEY)
    return { userId: null, items: [] }
  }
}

/** Normalise a single item — handles both old and new shapes */
function migrateItem(item: Record<string, unknown>): CartItem {
  return {
    productId: (item.productId as string) ?? '',
    quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
    price: typeof item.price === 'number' ? item.price : 0,
    name: typeof item.name === 'string' ? item.name : '',
  }
}

function saveCartData(data: CartData) {
  if (typeof window === 'undefined') return
  localStorage.setItem(CART_KEY, JSON.stringify(data))
}

function clearCartStorage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CART_KEY)
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<CartItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // ── 0. Ensure guest session ID exists ──
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem('cartSessionId')) {
      localStorage.setItem('cartSessionId', crypto.randomUUID())
    }
  }, [])

  // ── 1. HYDRATE from localStorage — runs once on mount ──
  useEffect(() => {
    const data = loadCartData()
    setItems(data.items)
    setUserId(data.userId)
    setIsHydrated(true)
  }, [])

  // ── 2. REACT to auth state changes (login / logout) ──
  // We wait for both hydration AND auth to finish loading before making decisions.
  useEffect(() => {
    if (!isHydrated || authLoading) return

    if (user) {
      // User is logged in
      if (userId === null) {
        // Guest cart → claim it for this user
        setUserId(user.id)
      } else if (userId !== user.id) {
        // Cart belongs to a different user → replace with empty cart for new user
        setItems([])
        setUserId(user.id)
      }
      // userId === user.id → keep items as-is
    } else if (userId !== null) {
      // User logged out (was logged in, now null) → clear everything
      setItems([])
      setUserId(null)
      clearCartStorage()
    }
    // user === null && userId === null → guest, nothing to do
  }, [user, authLoading, isHydrated, userId])

  // ── 3. SAVE to localStorage — only after hydration so we never overwrite with [] ──
  useEffect(() => {
    if (!isHydrated) return
    saveCartData({ userId, items })
  }, [items, userId, isHydrated])

  // ── Ref to always have latest items without stale closures ──
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // ── Cart operations ──

  const addItem = useCallback(
    async (productId: string, quantity = 1, productMeta?: { price: number; name: string }) => {
      const currentItems = itemsRef.current

      // Get existing cart quantity for this product
      const existingItem = currentItems.find(item => item.productId === productId)
      const existingCartQty = existingItem?.quantity || 0
      const newTotalQty = existingCartQty + quantity

      // Validate against snapshot locally
      let snapCheck = validateCartQuantity(productId, newTotalQty)

      // If validation fails, force refresh snapshot and retry once
      if (!snapCheck.valid && snapCheck.error) {
        try {
          await forceRefreshSnapshot(productId)
          snapCheck = validateCartQuantity(productId, newTotalQty)
        } catch (refreshErr) {
          console.warn('Failed to force refresh snapshot:', refreshErr)
        }

        if (!snapCheck.valid && snapCheck.error) {
          showToast('error', snapCheck.error)
          return
        }
      }

      setItems(prev => {
        const existing = prev.find(item => item.productId === productId)
        if (existing) {
          return prev.map(item =>
            item.productId === productId
              ? {
                  ...item,
                  quantity: item.quantity + quantity,
                  ...(productMeta ? { price: productMeta.price, name: productMeta.name } : {}),
                }
              : item
          )
        }
        return [
          ...prev,
          {
            productId,
            quantity,
            price: productMeta?.price ?? 0,
            name: productMeta?.name ?? '',
          },
        ]
      })
    },
    [showToast]
  )

  const removeItem = useCallback(async (productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId))
  }, [])

  const updateQuantity = useCallback(
    async (productId: string, quantity: number) => {
      const currentItems = itemsRef.current

      // Remove if qty drops to 0 or below
      if (quantity <= 0) {
        setItems(prev => prev.filter(item => item.productId !== productId))
        return
      }

      const existingItem = currentItems.find(item => item.productId === productId)
      const existingCartQty = existingItem?.quantity || 0

      // DECREMENT is always allowed — only validate on INCREMENT
      if (quantity > existingCartQty) {
        let snapCheck = validateCartQuantity(productId, quantity)

        if (!snapCheck.valid && snapCheck.error) {
          try {
            await forceRefreshSnapshot(productId)
            snapCheck = validateCartQuantity(productId, quantity)
          } catch (refreshErr) {
            console.warn('Failed to force refresh snapshot:', refreshErr)
          }

          if (!snapCheck.valid && snapCheck.error) {
            showToast('error', snapCheck.error)
            return
          }
        }
      }

      setItems(prev =>
        prev.map(item =>
          item.productId === productId ? { ...item, quantity } : item
        )
      )
    },
    [showToast]
  )

  const clearCart = useCallback(() => {
    setItems([])
    setUserId(null)
    clearCartStorage()
    clearSnapshots()
  }, [])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
        isHydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
