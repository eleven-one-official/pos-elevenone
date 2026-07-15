import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFloorTables } from '../services/api/tables'
import type { PosTable } from '../features/pos/TableFloorPage'

/**
 * Load the table floor from the API. `tables` is null while the first load runs.
 *
 * Pass `pollMs` to keep the floor in sync across terminals — the 2 waiter tablets
 * and the cashier POS. It silently re-fetches on that interval (no loading
 * flicker; a transient failure leaves the last good floor on screen instead of
 * flashing an error) and pauses while the tab is hidden to spare tablet battery,
 * catching up the moment it refocuses.
 */
export function useTables(pollMs?: number) {
  const [tables, setTables] = useState<PosTable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guards against a slow request overlapping the next poll tick.
  const inFlight = useRef(false)

  const load = useCallback(async (silent: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    if (!silent) setError(null)
    try {
      setTables(await fetchFloorTables())
      if (silent) setError(null)
    } catch (e) {
      // A background poll keeps the last good floor rather than replacing it with
      // an error screen; only a foreground (re)load surfaces the failure.
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load tables.')
    } finally {
      inFlight.current = false
    }
  }, [])

  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    if (!pollMs) return
    const tick = () => {
      if (!document.hidden) void load(true)
    }
    const id = window.setInterval(tick, pollMs)
    // Catch up immediately when the terminal wakes / the tab refocuses.
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [pollMs, load])

  return { tables, loading: tables === null && error === null, error, reload }
}
