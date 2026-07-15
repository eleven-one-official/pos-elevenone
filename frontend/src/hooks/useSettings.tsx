import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, fetchSettings, type StoreSettings } from '../services/api/settings'

// Store settings shared across the signed-in app (tax rate + KHR rate drive the
// order/payment math; store info prints on the receipt). Loaded once after
// login; the admin Settings screen can push fresh values in without a refetch.

type SettingsContextValue = StoreSettings & {
  reloadSettings: () => Promise<void>
  applySettings: (next: StoreSettings) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS)

  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await fetchSettings())
    } catch {
      // Keep the defaults / last good values if the server can't be reached.
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  return (
    <SettingsContext.Provider value={{ ...settings, reloadSettings, applySettings: setSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
