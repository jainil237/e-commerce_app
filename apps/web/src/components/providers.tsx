'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import useSWR, { SWRConfig } from 'swr'

// ─── Theme Context ───
const ThemeContext = createContext<{
  theme: 'light' | 'dark'
  toggleTheme: () => void
}>({
  theme: 'light',
  toggleTheme: () => {},
})

// ─── Types ───
interface User {
  id: string
  name: string
  email: string
  phone: string
  role: 'CUSTOMER' | 'ADMIN'
}

interface CartItem {
  productId: string   // Product.id — unique identifier per product
  quantity: number
  price: number       // selling price per unit (persisted for offline subtotal)
  name: string        // product name (for display even before API roundtrip)
}

/** Shape stored in localStorage under the "cart" key */
interface CartData {
  userId: string | null   // null = guest, string = logged-in user's id
  items: CartItem[]
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// ─── Auth Context ───
const AuthContext = createContext<{
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
})

// ─── Cart Context ───
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

// ─── Toast Context ───
const ToastContext = createContext<{
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}>({
  showToast: () => {},
})

// ─── Wishlist Context ───
const WishlistContext = createContext<{
  items: string[]  // productId[]
  addToWishlist: (productId: string) => Promise<void>
  removeFromWishlist: (productId: string) => Promise<void>
  isInWishlist: (productId: string) => boolean
  isLoading: boolean
}>({
  items: [],
  addToWishlist: async () => {},
  removeFromWishlist: async () => {},
  isInWishlist: () => false,
  isLoading: false,
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

// ─── Fetcher ───
const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.message || 'An error occurred')
  }
  return res.json()
}

// ─── Theme Provider ───
function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // Check local storage or system preference on mount
    const storedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (storedTheme) {
      setTheme(storedTheme)
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', newTheme)
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return newTheme
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ─── Auth Provider ───
function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { data, error, mutate } = useSWR('/api/v1/auth/me', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (data?.data) {
      setUser(data.data)
    } else {
      setUser(null)
    }
    setIsLoading(false)
  }, [data, error])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Login failed')
    setUser(result.data.user)
    mutate()
  }

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Registration failed')
    setUser(result.data.user)
    mutate()
  }

  const logout = async () => {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    setUser(null)
    mutate(undefined, false)
    // Cart cleanup is handled by CartProvider reacting to user becoming null
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Cart Provider ───
//
// Cart is stored in localStorage as { userId, items[] }.
//   - Product.id is the unique key (stored as `productId` in each CartItem).
//   - Each item stores price + name so subtotal works offline (no API needed).
//   - A `userId` field tracks ownership:
//       • null  = guest cart
//       • "abc" = belongs to user abc
//   - On login  → guest cart is claimed by the new user; mismatched user carts are replaced.
//   - On logout → cart + localStorage are wiped.
//
function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

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
  }, [user, authLoading, isHydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. SAVE to localStorage — only after hydration so we never overwrite with [] ──
  // Using `isHydrated` (state) instead of a ref ensures this effect does NOT run
  // in the same render pass where items is still []. React batches setItems + setIsHydrated
  // from the hydrate effect into a single re-render, so by the time this fires,
  // `items` already contains the loaded data.
  useEffect(() => {
    if (!isHydrated) return
    saveCartData({ userId, items })
  }, [items, userId, isHydrated])

  // ── Cart operations ──

  const addItem = useCallback(
    (productId: string, quantity = 1, productMeta?: { price: number; name: string }) => {
      setItems(prev => {
        const existing = prev.find(item => item.productId === productId)
        if (existing) {
          // Same Product.id → increment quantity, refresh price/name
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
        // New Product.id → append to the array
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
    []
  )

  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId))
  }, [])

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        setItems(prev => prev.filter(item => item.productId !== productId))
        return
      }
      setItems(prev =>
        prev.map(item =>
          item.productId === productId ? { ...item, quantity } : item
        )
      )
    },
    []
  )

  const clearCart = useCallback(() => {
    setItems([])
    setUserId(null)
    clearCartStorage()
  }, [])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      totalItems,
      subtotal,
      isHydrated,
    }}>
      {children}
    </CartContext.Provider>
  )
}

// ─── Toast Provider ───
function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg animate-slide-in ${
              toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
              toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
              'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ─── Wishlist Provider ───
function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Fetch wishlist when user logs in
  useEffect(() => {
    if (!user) {
      setItems([])
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetch('/api/v1/wishlist', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.success) {
          setItems((data.data || []).map((p: { id: string }) => p.id))
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [user])

  const addToWishlist = useCallback(async (productId: string) => {
    // Optimistic update
    setItems(prev => prev.includes(productId) ? prev : [...prev, productId])

    try {
      const res = await fetch('/api/v1/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) {
        // Rollback
        setItems(prev => prev.filter(id => id !== productId))
      }
    } catch {
      setItems(prev => prev.filter(id => id !== productId))
    }
  }, [])

  const removeFromWishlist = useCallback(async (productId: string) => {
    // Optimistic update
    setItems(prev => prev.filter(id => id !== productId))

    try {
      const res = await fetch(`/api/v1/wishlist/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        // Rollback
        setItems(prev => [...prev, productId])
      }
    } catch {
      setItems(prev => [...prev, productId])
    }
  }, [])

  const isInWishlist = useCallback((productId: string) => {
    return items.includes(productId)
  }, [items])

  return (
    <WishlistContext.Provider value={{ items, addToWishlist, removeFromWishlist, isInWishlist, isLoading }}>
      {children}
    </WishlistContext.Provider>
  )
}

// ─── Combined Providers ───
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher }}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                {children}
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </SWRConfig>
  )
}

// ─── Hooks ───
export const useTheme = () => useContext(ThemeContext)
export const useAuth = () => useContext(AuthContext)
export const useCart = () => useContext(CartContext)
export const useToast = () => useContext(ToastContext)
export const useWishlist = () => useContext(WishlistContext)
export const useStoreConfig = () => {
  // In a real app, this would be fetched from API or embedded at build time
  return {
    store: {
      name: 'MyStore',
      tagline: 'Fresh picks, delivered fast',
      primaryColor: '#1D4ED8',
      accentColor: '#F59E0B',
      currencySymbol: '₹',
      contact: {
        phone: '+91-XXXXXXXXXX',
        email: 'support@mystore.in',
        whatsapp: '+91-XXXXXXXXXX',
      },
    },
    features: {
      guestCheckout: true,
      wishlist: true,
      productReviews: true,
      couponCodes: true,
      whatsappSupport: true,
    },
    shipping: {
      freeShippingAbove: 499,
      baseShippingCharge: 49,
    },
  }
}
