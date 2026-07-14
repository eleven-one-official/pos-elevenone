import { useMemo, useState } from 'react'
import {
  LuArrowRightLeft,
  LuBeef,
  LuCake,
  LuCakeSlice,
  LuChevronLeft,
  LuChevronRight,
  LuCitrus,
  LuCoffee,
  LuCupSoda,
  LuDelete,
  LuFileText,
  LuFish,
  LuGlassWater,
  LuHouse,
  LuIceCreamBowl,
  LuKeyboard,
  LuMenu,
  LuNotebookPen,
  LuPizza,
  LuReceipt,
  LuRotateCcw,
  LuSalad,
  LuSandwich,
  LuSearch,
  LuSoup,
  LuSplit,
  LuStar,
  LuStickyNote,
  LuUser,
  LuUsers,
  LuUtensils,
  LuWifi,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import type { Cashier } from '../auth/CashierLoginDialog'
import type { PosTable } from './TableFloorPage'

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

type Category = 'Food' | 'Drinks' | 'Desserts'

type Product = {
  id: string
  name: string
  price: number
  icon: IconType
  category: Category
}

// Placeholder catalog — each tile shows a real photo from /public/images/menu
// (named by product id), falling back to the react-icon if the photo is missing.
// Wire products and prices to the backend once the product API exists.
const PRODUCTS: Product[] = [
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

const CATEGORIES: Category[] = ['Food', 'Drinks', 'Desserts']
const TAX_RATE = 0.1

// ---------------------------------------------------------------------------
// Order state
// ---------------------------------------------------------------------------

type OrderLine = {
  id: string // one line per product — same id as the product
  name: string
  price: number
  qty: number
  note?: string
}

// Pre-filled sample order so the screen mirrors the reference on first open.
const INITIAL_LINES: OrderLine[] = [
  { id: 'pasta-4-formaggi', name: 'Pasta 4 formaggi', price: 6.33, qty: 1 },
  { id: 'vegetarian', name: 'Vegetarian', price: 8.05, qty: 1, note: 'No pepper on pizza' },
  { id: 'ice-tea', name: 'Ice Tea', price: 2.53, qty: 1 },
]

const money = (n: number) => `$ ${n.toFixed(2)}`

type NumpadMode = 'qty' | 'disc' | 'price'

// ---------------------------------------------------------------------------
// Control buttons
// ---------------------------------------------------------------------------

type Control = { icon: IconType; label: string; badge?: number; active?: boolean; span2?: boolean }

// Product thumbnail — shows the real photo from /public/images/menu, and falls
// back to the product's react-icon if the image is missing or fails to load
// (no broken-image glyph, no emoji).
function ProductThumb({ product }: { product: Product }) {
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrderPage({
  cashier,
  table,
  onBack,
}: {
  cashier: Cashier
  table: PosTable
  onBack: () => void
}) {
  const [lines, setLines] = useState<OrderLine[]>(INITIAL_LINES)
  const [selectedId, setSelectedId] = useState<string | null>('ice-tea')
  const [mode, setMode] = useState<NumpadMode>('qty')
  const [entry, setEntry] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('Food')
  const [search, setSearch] = useState('')

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.price, 0), [lines])
  const taxes = subtotal * TAX_RATE
  const total = subtotal + taxes
  const guests = table.guests > 0 ? table.guests : 2

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return PRODUCTS.filter(
      (p) => (term ? p.name.toLowerCase().includes(term) : p.category === category),
    )
  }, [category, search])

  function addProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === product.id)
      if (existing) {
        return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
    setSelectedId(product.id)
    setEntry(null)
  }

  function selectLine(id: string) {
    setSelectedId(id)
    setEntry(null)
  }

  function setQty(id: string, qty: number) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)))
  }

  function switchMode(next: NumpadMode) {
    setMode(next)
    setEntry(null)
  }

  function pressKey(key: string) {
    if (key === 'Qty') return switchMode('qty')
    if (key === '% Disc') return switchMode('disc')
    if (key === 'Price') return switchMode('price')
    if (!selectedId || mode !== 'qty') return // only quantity editing is wired up

    const current = entry ?? String(lines.find((l) => l.id === selectedId)?.qty ?? 0)
    let next: string
    if (key === 'del') next = current.slice(0, -1)
    else if (key === '+/-') next = current.startsWith('-') ? current.slice(1) : `-${current}`
    else if (key === '.') next = current.includes('.') ? current : `${current}.`
    else next = (entry === null ? '' : current) + key

    setEntry(next)
    const parsed = Number(next)
    setQty(selectedId, Number.isFinite(parsed) ? parsed : 0)
  }

  const CONTROLS: Control[] = [
    { icon: LuRotateCcw, label: 'Refund' },
    { icon: LuUser, label: 'Alexa Laza', active: true },
    { icon: LuStickyNote, label: 'Customer Note' },
    { icon: LuNotebookPen, label: 'Internal Note' },
    { icon: LuReceipt, label: 'Bill' },
    { icon: LuSplit, label: 'Split' },
    { icon: LuUsers, label: 'Dine-in Guests', badge: guests },
    { icon: LuArrowRightLeft, label: 'Transfer' },
    { icon: LuKeyboard, label: 'Enter Code' },
    { icon: LuStar, label: 'Reward' },
    { icon: LuFileText, label: 'Quotation/Order', span2: true },
  ]

  const NUMPAD: { k: string; mode?: NumpadMode; icon?: IconType }[] = [
    { k: '1' }, { k: '2' }, { k: '3' }, { k: 'Qty', mode: 'qty' },
    { k: '4' }, { k: '5' }, { k: '6' }, { k: '% Disc', mode: 'disc' },
    { k: '7' }, { k: '8' }, { k: '9' }, { k: 'Price', mode: 'price' },
    { k: '+/-' }, { k: '0' }, { k: '.' }, { k: 'del', icon: LuDelete },
  ]

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex-1">
          <ElevenOneLogo tone="dark" />
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-neutral-700 transition hover:bg-neutral-100"
        >
          <LuChevronLeft className="h-5 w-5" />
          BACK
        </button>
        <div className="flex flex-1 items-center justify-end gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b2138] text-xs font-bold text-white">
              {cashier.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <span className="text-sm font-semibold text-neutral-800">{cashier.name}</span>
          </div>
          <LuWifi className="h-5 w-5 text-emerald-500" />
          <LuMenu className="h-5 w-5 text-neutral-500" />
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — current order */}
        <div className="flex w-[42%] min-w-[440px] flex-col border-r border-neutral-200 bg-white">
          {/* Order lines */}
          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
                <LuUtensils className="h-8 w-8" />
                <p className="text-sm">Tap a product to start the order</p>
              </div>
            ) : (
              lines.map((line) => {
                const selected = line.id === selectedId
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => selectLine(line.id)}
                    className={`flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3 text-left transition ${
                      selected ? 'border-l-4 border-l-emerald-500 bg-emerald-50' : 'border-l-4 border-l-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-emerald-800">{line.name}</p>
                      <p className="mt-0.5 text-sm text-emerald-600">
                        {line.qty.toFixed(2)} Units x {money(line.price)} / Units
                      </p>
                      {line.note && (
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          <LuStickyNote className="h-3.5 w-3.5" />
                          {line.note}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold text-emerald-700">{money(line.qty * line.price)}</span>
                  </button>
                )
              })
            )}
          </div>

          {/* Total */}
          <div className="border-t border-neutral-200 px-4 py-3 text-right">
            <div className="text-2xl font-bold text-neutral-900">Total: {money(total)}</div>
            <div className="text-sm text-neutral-500">Taxes: {money(taxes)}</div>
          </div>

          {/* Control buttons */}
          <div className="grid grid-cols-3 border-t border-l border-neutral-200">
            {CONTROLS.map((c) => (
              <button
                key={c.label}
                type="button"
                className={`relative flex items-center justify-center gap-2 border-b border-r border-neutral-200 px-2 py-3 text-sm font-medium transition ${
                  c.span2 ? 'col-span-2' : ''
                } ${
                  c.active
                    ? 'bg-[#2b2138] text-white hover:bg-[#37294a]'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <c.icon className="h-4.5 w-4.5 shrink-0" />
                <span className="truncate">{c.label}</span>
                {c.badge != null && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-800 px-1 text-xs font-bold text-white">
                    {c.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Payment + numpad */}
          <div className="flex border-t border-neutral-200">
            {/* Payment / order name */}
            <div className="flex w-[26%] min-w-[110px] flex-col border-r border-neutral-200">
              <button
                type="button"
                className="flex items-center gap-1.5 border-b border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                <LuChevronRight className="h-4 w-4" />
                Payment
              </button>
              <button
                type="button"
                className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-[#2b2138] px-2 py-4 text-center text-white transition hover:bg-[#37294a]"
              >
                <LuUtensils className="h-6 w-6" />
                <span className="text-xs font-medium opacity-80">Order</span>
                <span className="text-sm font-bold">Table {table.label}</span>
              </button>
            </div>

            {/* Numpad */}
            <div className="grid flex-1 grid-cols-4">
              {NUMPAD.map((key) => {
                const isMode = key.mode != null
                const active = key.mode === mode
                return (
                  <button
                    key={key.k}
                    type="button"
                    onClick={() => pressKey(key.k)}
                    className={`flex h-14 items-center justify-center border-b border-r border-neutral-200 text-lg font-semibold transition ${
                      active
                        ? 'bg-emerald-100 text-emerald-700'
                        : isMode
                          ? 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                          : 'bg-white text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    {key.icon ? <key.icon className="h-5 w-5" /> : <span className={isMode ? 'text-sm' : ''}>{key.k}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right — product catalog */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumb + categories + search */}
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5">
            <button
              type="button"
              onClick={() => setSearch('')}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
              aria-label="Home"
            >
              <LuHouse className="h-5 w-5" />
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c)
                  setSearch('')
                }}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  category === c && !search
                    ? 'bg-primary/10 text-primary'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {c}
              </button>
            ))}
            <div className="relative ml-auto w-72">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-3 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Products */}
          <div className="flex-1 overflow-y-auto p-4">
            {visibleProducts.length === 0 ? (
              <p className="mt-10 text-center text-sm text-neutral-400">No products match “{search}”.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
                  >
                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
                      <ProductThumb product={product} />
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/85 text-[11px] font-bold italic text-neutral-500 shadow-sm">
                        i
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col px-2.5 py-2">
                      <span className="line-clamp-2 text-sm font-medium leading-tight text-neutral-800">
                        {product.name}
                      </span>
                      <span className="mt-1 text-sm font-bold text-primary">{money(product.price)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
