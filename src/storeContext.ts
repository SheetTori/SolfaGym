import { createContext, useContext } from 'react'
import type { Store } from './storage/progress'
import type { VocalRange } from './core/transpose'

export interface StoreContextValue {
  store: Store
  update: (fn: (s: Store) => Store) => void
  vocalRange: VocalRange
}

export const StoreContext = createContext<StoreContextValue | null>(null)

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('StoreProvider の外で useStore を呼んでいる')
  return value
}
