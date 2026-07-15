import { useCallback, useEffect, useState } from 'react'
import { fetchFloorTables } from '../services/api/tables'
import type { PosTable } from '../features/pos/TableFloorPage'

/** Load the table floor from the API. `tables` is null while the first load runs. */
export function useTables() {
  const [tables, setTables] = useState<PosTable[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setTables(await fetchFloorTables())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tables.')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { tables, loading: tables === null && error === null, error, reload }
}
