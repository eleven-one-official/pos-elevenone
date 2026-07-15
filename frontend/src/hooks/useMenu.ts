import { useCallback, useEffect, useState } from 'react'
import { fetchProducts } from '../services/api/menu'
import type { Product } from '../features/pos/catalog'

/** Load the menu from the API. `products` is null while the first load runs. */
export function useMenu() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setProducts(await fetchProducts())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the menu.')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { products, loading: products === null && error === null, error, reload }
}
