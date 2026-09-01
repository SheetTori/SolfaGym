import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_STORE, loadStore, saveStore, type Store } from './storage/progress'
import { VOCAL_PRESETS, type VocalRange } from './core/transpose'
import { StoreContext } from './storeContext'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => {
    try {
      return loadStore()
    } catch {
      return DEFAULT_STORE
    }
  })

  const update = useCallback((fn: (s: Store) => Store) => {
    setStore((prev) => {
      const next = fn(prev)
      saveStore(next)
      return next
    })
  }, [])

  const vocalRange = useMemo<VocalRange>(() => {
    const { vocalPreset, customLowMidi, customHighMidi } = store.settings
    if (vocalPreset === 'custom') {
      return { lowMidi: customLowMidi, highMidi: customHighMidi }
    }
    return VOCAL_PRESETS[vocalPreset]
  }, [store.settings])

  const value = useMemo(() => ({ store, update, vocalRange }), [store, update, vocalRange])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
