'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useAuth } from './auth.context'

const WishlistContext = createContext<{
  items: string[]
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

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

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

    return () => {
      cancelled = true
    }
  }, [user])

  const addToWishlist = useCallback(async (productId: string) => {
    setItems(prev => (prev.includes(productId) ? prev : [...prev, productId]))

    try {
      const res = await fetch('/api/v1/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) {
        setItems(prev => prev.filter(id => id !== productId))
      }
    } catch {
      setItems(prev => prev.filter(id => id !== productId))
    }
  }, [])

  const removeFromWishlist = useCallback(async (productId: string) => {
    setItems(prev => prev.filter(id => id !== productId))

    try {
      const res = await fetch(`/api/v1/wishlist/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        setItems(prev => [...prev, productId])
      }
    } catch {
      setItems(prev => [...prev, productId])
    }
  }, [])

  const isInWishlist = useCallback(
    (productId: string) => {
      return items.includes(productId)
    },
    [items]
  )

  return (
    <WishlistContext.Provider
      value={{ items, addToWishlist, removeFromWishlist, isInWishlist, isLoading }}
    >
      {children}
    </WishlistContext.Provider>
  )
}

export const useWishlist = () => useContext(WishlistContext)
