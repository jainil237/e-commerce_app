'use client'

import { useRef, ReactNode } from 'react'
import { Provider } from 'react-redux'
import { makeStore, AppStore } from './store'

/**
 * One store per client session, not a module-level singleton — Next.js can
 * run this component's module in a shared server context, and a singleton
 * store would leak cached query data across unrelated requests.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore>()
  if (!storeRef.current) {
    storeRef.current = makeStore()
  }
  return <Provider store={storeRef.current}>{children}</Provider>
}
