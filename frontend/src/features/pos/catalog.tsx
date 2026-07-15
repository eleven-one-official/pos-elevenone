import { useState } from 'react'
import { LuCakeSlice, LuCupSoda, LuUtensils } from 'react-icons/lu'
import type { IconType } from 'react-icons'

// ---------------------------------------------------------------------------
// Menu catalog — shared by the Cashier POS and the Waiter tablet so the menu,
// prices, and per-line helpers live in one place. Products are fetched from
// the backend (GET /menu-items) and mapped to this shape in services/api/menu.
// ---------------------------------------------------------------------------

export type Category = 'Food' | 'Drinks' | 'Desserts'

export type Product = {
  /** Backend menu-item id, stringified — order lines key on it. */
  id: string
  name: string
  price: number
  icon: IconType
  category: Category
  /** URL-safe name — used to look up the tile photo in /public/images/menu. */
  slug: string
  /** Image URL from the backend, when one has been uploaded. */
  image?: string | null
}

export const CATEGORIES: Category[] = ['Food', 'Drinks', 'Desserts']
export const TAX_RATE = 0.1

// Quick-note chips offered in the Internal Note popup (Odoo's preset notes).
export const NOTE_PRESETS = ['No pepper', 'Spicy', 'To go', 'No ice', 'Allergy', 'Well done', 'Gift']

/** Fallback tile icon when a product has no photo. */
export function iconForCategory(category: Category): IconType {
  if (category === 'Drinks') return LuCupSoda
  if (category === 'Desserts') return LuCakeSlice
  return LuUtensils
}

// ---------------------------------------------------------------------------
// Order line + money helpers
// ---------------------------------------------------------------------------

export type OrderLine = {
  id: string // one line per product — same id as the product
  name: string
  price: number
  qty: number
  /** Per-line discount as a percentage (0–100). */
  discount?: number
  note?: string
}

export const money = (n: number) => `$ ${n.toFixed(2)}`
// Unit price after the line's discount, and the full line net.
export const unitNet = (l: OrderLine) => l.price * (1 - (l.discount ?? 0) / 100)
export const lineNet = (l: OrderLine) => l.qty * unitNet(l)

// ---------------------------------------------------------------------------
// Product thumbnail
// ---------------------------------------------------------------------------

// Shows the backend image when set, otherwise the local photo from
// /public/images/menu (named by slug), falling back to the category icon if
// neither exists (no broken-image glyph, no emoji).
export function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <product.icon className="h-12 w-12" />
  return (
    <img
      src={product.image || `/images/menu/${product.slug}.jpg`}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}
