import { api } from './client'
import { iconForCategory, type Category, type Product } from '../../features/pos/catalog'

// ---------------------------------------------------------------------------
// GET /menu-items → the POS Product shape
// ---------------------------------------------------------------------------

type ApiMenuItem = {
  id: number
  category_id: number | null
  name: string
  slug: string
  description: string | null
  price: string // decimal cast serializes as a string, e.g. "6.50"
  image: string | null
  is_available: boolean
  sort_order: number
  category?: { id: number; name: string; slug: string } | null
}

// Backend category slugs → POS category tabs.
const CATEGORY_BY_SLUG: Record<string, Category> = {
  food: 'Food',
  drink: 'Drinks',
  dessert: 'Desserts',
}

function toProduct(item: ApiMenuItem): Product {
  const category = CATEGORY_BY_SLUG[item.category?.slug ?? ''] ?? 'Food'
  return {
    id: String(item.id), // order lines key on the string id; parse back for POSTs
    name: item.name,
    price: Number(item.price),
    icon: iconForCategory(category),
    category,
    slug: item.slug,
    image: item.image,
  }
}

/** Fetch the available menu, mapped to the POS product shape. */
export async function fetchProducts(): Promise<Product[]> {
  const items = await api<ApiMenuItem[]>('/menu-items?is_available=1')
  return items.map(toProduct)
}
