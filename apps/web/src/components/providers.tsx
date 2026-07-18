'use client'

import { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import {
  StoreConfigProvider,
  ThemeProvider,
  ToastProvider,
  AuthProvider,
  WishlistProvider,
  CartProvider
} from '@/contexts'

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.message || 'An error occurred')
  }
  return res.json()
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher }}>
      <StoreConfigProvider>
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
      </StoreConfigProvider>
    </SWRConfig>
  )
}

// Re-export hooks to maintain backward compatibility for existing imports
export {
  useTheme,
  useAuth,
  useCart,
  useToast,
  useWishlist,
  useStoreConfig
} from '@/contexts'
