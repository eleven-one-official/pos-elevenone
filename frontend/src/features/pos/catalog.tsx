import { useState } from 'react'
import {
  LuBeef,
  LuCake,
  LuCakeSlice,
  LuCitrus,
  LuCoffee,
  LuCupSoda,
  LuFish,
  LuGlassWater,
  LuIceCreamBowl,
  LuPizza,
  LuSalad,
  LuSandwich,
  LuSoup,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'

// ---------------------------------------------------------------------------
// Menu catalog — shared by the Cashier POS and the Waiter tablet so the menu,
// prices, and per-line helpers live in one place. Wire products and prices to
// the backend (GET /menu-items) once that API is consumed.
// ---------------------------------------------------------------------------

export type Category = 'Food' | 'Drinks' | 'Desserts'

export type Product = {
  id: string
  name: string
  price: number
  icon: IconType
  category: Category
}

// Placeholder catalog — each tile shows a real photo from /public/images/menu
// (named by product id), falling back to the react-icon if the photo is missing.
export const PRODUCTS: Product[] = [
  { id: 'bacon-burger', name: 'Bacon Burger', price: 8.63, icon: LuBeef, category: 'Food' },
  { id: 'cheese-burger', name: 'Cheese Burger', price: 8.05, icon: LuBeef, category: 'Food' },
  { id: 'chicken-curry-sandwich', name: 'Chicken Curry Sandwich', price: 3.45, icon: LuSandwich, category: 'Food' },
  { id: 'club-sandwich', name: 'Club Sandwich', price: 3.91, icon: LuSandwich, category: 'Food' },
  { id: 'funghi', name: 'Funghi', price: 8.05, icon: LuPizza, category: 'Food' },
  { id: 'lunch-maki-18pc', name: 'Lunch Maki 18pc', price: 13.8, icon: LuFish, category: 'Food' },
  { id: 'lunch-salmon-20pc', name: 'Lunch Salmon 20pc', price: 15.87, icon: LuFish, category: 'Food' },
  { id: 'lunch-temaki-mix-3pc', name: 'Lunch Temaki mix 3pc', price: 16.1, icon: LuFish, category: 'Food' },
  { id: 'margherita', name: 'Margherita', price: 8.05, icon: LuPizza, category: 'Food' },
  { id: 'mozzarella-sandwich', name: 'Mozzarella Sandwich', price: 4.49, icon: LuSandwich, category: 'Food' },
  { id: 'pasta-4-formaggi', name: 'Pasta 4 formaggi', price: 6.33, icon: LuSoup, category: 'Food' },
  { id: 'pasta-bolognese', name: 'Pasta Bolognese', price: 5.18, icon: LuSoup, category: 'Food' },
  { id: 'salmon-and-avocado', name: 'Salmon and Avocado', price: 10.64, icon: LuSalad, category: 'Food' },
  { id: 'spicy-tuna-sandwich', name: 'Spicy Tuna Sandwich', price: 3.45, icon: LuSandwich, category: 'Food' },
  { id: 'vegetarian', name: 'Vegetarian', price: 8.05, icon: LuSalad, category: 'Food' },
  { id: 'ice-tea', name: 'Ice Tea', price: 2.53, icon: LuCupSoda, category: 'Drinks' },
  { id: 'coca-cola', name: 'Coca-Cola', price: 2.2, icon: LuCupSoda, category: 'Drinks' },
  { id: 'sparkling-water', name: 'Sparkling Water', price: 1.5, icon: LuGlassWater, category: 'Drinks' },
  { id: 'coffee', name: 'Coffee', price: 2.8, icon: LuCoffee, category: 'Drinks' },
  { id: 'orange-juice', name: 'Orange Juice', price: 3.1, icon: LuCitrus, category: 'Drinks' },
  { id: 'tiramisu', name: 'Tiramisu', price: 4.5, icon: LuCakeSlice, category: 'Desserts' },
  { id: 'ice-cream', name: 'Ice Cream', price: 3.2, icon: LuIceCreamBowl, category: 'Desserts' },
  { id: 'cheesecake', name: 'Cheesecake', price: 4.8, icon: LuCake, category: 'Desserts' },
]

export const CATEGORIES: Category[] = ['Food', 'Drinks', 'Desserts']
export const TAX_RATE = 0.1

// Quick-note chips offered in the Internal Note popup (Odoo's preset notes).
export const NOTE_PRESETS = ['No pepper', 'Spicy', 'To go', 'No ice', 'Allergy', 'Well done', 'Gift']

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

// Shows the real photo from /public/images/menu, and falls back to the
// product's react-icon if the image is missing or fails to load (no
// broken-image glyph, no emoji).
export function ProductThumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <product.icon className="h-12 w-12" />
  return (
    <img
      src={`/images/menu/${product.id}.jpg`}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  )
}
