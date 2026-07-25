'use client'

import { createContext, useContext, ReactNode } from 'react'
import storeConfig from '@config/store.config.json'

const StoreConfigContext = createContext<typeof storeConfig>(storeConfig)

export function StoreConfigProvider({ children }: { children: ReactNode }) {
  return (
    <StoreConfigContext.Provider value={storeConfig}>
      {children}
    </StoreConfigContext.Provider>
  )
}

export const useStoreConfig = () => useContext(StoreConfigContext)
