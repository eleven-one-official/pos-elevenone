import { useEffect, useMemo, useState } from 'react'
import {
  LuArrowRightLeft,
  LuCheck,
  LuChefHat,
  LuChevronLeft,
  LuDelete,
  LuHouse,
  LuInfo,
  LuLoaderCircle,
  LuMinus,
  LuNotebookPen,
  LuPlus,
  LuRefreshCw,
  LuSearch,
  LuStickyNote,
  LuTrash2,
  LuUsers,
  LuUtensils,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import Modal from '../../components/ui/Modal'
import NumberPadDialog from '../../components/ui/NumberPadDialog'
import OnScreenKeyboard from '../../components/ui/OnScreenKeyboard'
import {
  CATEGORIES,
  NOTE_PRESETS,
  ProductThumb,
  lineNet,
  money,
  type Category,
  type OrderLine,
  type Product,
} from '../pos/catalog'
import { printOrderTickets, stationForCategory, stationLabel } from '../kitchen/printKitchenTicket'
import { createOrder, updateOrder, type OrderPayload } from '../../services/api/orders'
import { useMenu } from '../../hooks/useMenu'
import { useTables } from '../../hooks/useTables'
import type { PosTable } from '../pos/TableFloorPage'
import type { Waiter } from './WaiterLoginDialog'

// The waiter takes and fires orders only — payment, discounts, splits and
// refunds stay on the cashier station. So the screen keeps just what's needed
// tableside: build the order, adjust quantities, add cooking notes, set the
// guest count, and send the order to the kitchen and bar printers.

type DialogKind = 'info' | 'note' | 'guests' | 'transfer' | null

type Control = {
  id: Exclude<DialogKind, null>
  icon: IconType
  label: string
  badge?: number
  /** Requires an order line to be selected first. */
  needsLine?: boolean
}

// Numpad keys for direct quantity entry (integer quantities only).
const NUMPAD: { k: string; icon?: IconType }[] = [
  { k: '1' }, { k: '2' }, { k: '3' },
  { k: '4' }, { k: '5' }, { k: '6' },
  { k: '7' }, { k: '8' }, { k: '9' },
  { k: 'C' }, { k: '0' }, { k: 'del', icon: LuDelete },
]

export default function WaiterOrderPage({
  waiter,
  table,
  onBack,
}: {
  waiter: Waiter
  table: PosTable
  onBack: () => void
}) {
  const [lines, setLines] = useState<OrderLine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('Food')
  const [search, setSearch] = useState('')
  const [keyboardFor, setKeyboardFor] = useState<null | 'search' | 'note'>(null)

  const [activeTable, setActiveTable] = useState<PosTable>(table)
  const [guestCount, setGuestCount] = useState(table.guests > 0 ? table.guests : 2)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  // Internal-note draft lives only while its popup is open.
  const [noteDraft, setNoteDraft] = useState('')

  // Menu + floor from the backend (floor is only needed for the Transfer popup).
  const { products, loading: menuLoading, error: menuError, reload: reloadMenu } = useMenu()
  const { tables } = useTables()

  // Backend order — created on the first "Send to Kitchen", updated after that.
  const [backendOrderId, setBackendOrderId] = useState<number | null>(null)
  // Local placeholder until the backend issues the real order number.
  const [orderNo, setOrderNo] = useState(() =>
    String(Math.floor(Date.now() / 1000) % 1000000).padStart(6, '0'),
  )

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + lineNet(l), 0), [lines])
  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines])
  const selectedLine = lines.find((l) => l.id === selectedId) ?? null

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (products ?? []).filter(
      (p) => (term ? p.name.toLowerCase().includes(term) : p.category === category),
    )
  }, [products, category, search])

  function notify(message: string) {
    setToast(message)
  }

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
    setSent(false)
  }

  function selectLine(id: string) {
    setSelectedId(id)
    setEntry(null)
  }

  function updateLine(id: string, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  // Inline +/- stepper on each line (clamped at 1 — removing uses the trash).
  function bump(id: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, qty: Math.max(1, l.qty + delta) } : l)),
    )
    setSelectedId(id)
    setEntry(null)
    setSent(false)
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
    setEntry(null)
    setSent(false)
  }

  // Numpad — types the selected line's quantity directly (whole numbers).
  function pressKey(key: string) {
    if (!selectedLine) return notify('Select an item first')
    const current = entry ?? String(selectedLine.qty)
    let next: string
    if (key === 'del') next = current.slice(0, -1)
    else if (key === 'C') next = ''
    else next = (entry === null ? '' : current) + key

    setEntry(next)
    let parsed = Math.floor(Number(next))
    if (!Number.isFinite(parsed) || parsed < 0) parsed = 0
    updateLine(selectedLine.id, { qty: parsed })
    setSent(false)
  }

  // ---- Dialogs --------------------------------------------------------------

  function openDialog(id: Exclude<DialogKind, null>) {
    if (id === 'info' && !selectedLine) return notify('Select an item first')
    if (id === 'note' && !selectedLine) return notify('Select an item first')
    if (id === 'note' && selectedLine) setNoteDraft(selectedLine.note ?? '')
    setDialog(id)
  }

  function closeDialog() {
    setDialog(null)
    setKeyboardFor((k) => (k === 'note' ? null : k))
  }

  function saveNote() {
    if (selectedLine) {
      const text = noteDraft.trim()
      updateLine(selectedLine.id, { note: text || undefined })
    }
    closeDialog()
  }

  function toggleNotePreset(preset: string) {
    setNoteDraft((prev) => {
      const parts = prev
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      const has = parts.some((p) => p.toLowerCase() === preset.toLowerCase())
      const next = has
        ? parts.filter((p) => p.toLowerCase() !== preset.toLowerCase())
        : [...parts, preset]
      return next.join(', ')
    })
  }

  function applyGuests(value: number) {
    setGuestCount(Math.max(1, value))
    closeDialog()
    notify(`Guests set to ${Math.max(1, value)}`)
  }

  function transferTo(t: PosTable) {
    setActiveTable(t)
    closeDialog()
    notify(`Order moved to ${t.label}`)
    // Best effort: if the order already exists on the backend, move it there too.
    if (backendOrderId != null) {
      void updateOrder(backendOrderId, {
        order_type: t.section === 'takeaway' ? 'take_away' : 'dine_in',
        table_id: t.backendId ?? null,
      }).catch(() => notify('Moved locally, but the server was not updated'))
    }
  }

  // Fire the order: save it on the backend (create on the first send, replace
  // items after that), then print the dockets — drinks route to the bar
  // printer, food and desserts to the kitchen printer, each as its own ticket
  // (items + notes, no prices). If the server is unreachable the dockets still
  // print so the kitchen keeps working; the order just isn't recorded yet.
  async function sendToKitchen() {
    if (sending) return
    const cook = lines.filter((l) => l.qty > 0)
    if (cook.length === 0) return notify('The order is empty')

    setSending(true)
    let ticketOrderNo = orderNo
    let synced = true
    try {
      const payload: OrderPayload = {
        order_type: activeTable.section === 'takeaway' ? 'take_away' : 'dine_in',
        table_id: activeTable.backendId ?? null,
        items: cook.map((l) => ({
          menu_item_id: Number(l.id),
          quantity: Math.max(1, Math.round(l.qty)),
          note: l.note,
        })),
      }
      const order =
        backendOrderId == null
          ? await createOrder(payload)
          : await updateOrder(backendOrderId, payload)
      setBackendOrderId(order.id)
      setOrderNo(order.order_number)
      ticketOrderNo = order.order_number
    } catch {
      synced = false
    }

    const orderTypeLabel =
      activeTable.section === 'takeaway'
        ? 'Take Away'
        : activeTable.section === 'vip'
          ? 'Dine In (VIP)'
          : 'Dine In'
    const ticketLines = cook.map((l) => {
      const cat = products?.find((p) => p.id === l.id)?.category ?? 'Food'
      return { name: l.name, qty: l.qty, note: l.note, station: stationForCategory(cat) }
    })
    // The ticket's "server" line carries the waiter who fired the order.
    const printed = printOrderTickets(
      {
        orderNo: ticketOrderNo,
        tableLabel: activeTable.label,
        orderType: orderTypeLabel,
        guests: guestCount,
        cashier: waiter.name,
      },
      ticketLines,
    )
    setSending(false)
    if (printed.length === 0) return notify('The order is empty')
    const names = printed.map(stationLabel).join(' + ')
    setSent(true)
    notify(
      synced
        ? `Order #${ticketOrderNo} sent to ${names}`
        : `Printed to ${names}, but saving to the server failed`,
    )
  }

  const CONTROLS: Control[] = [
    { id: 'info', icon: LuInfo, label: 'Info', needsLine: true },
    { id: 'note', icon: LuNotebookPen, label: 'Note', needsLine: true },
    { id: 'guests', icon: LuUsers, label: 'Guests', badge: guestCount },
    { id: 'transfer', icon: LuArrowRightLeft, label: 'Transfer' },
  ]

  const initials = waiter.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-4">
        <div className="flex flex-1 items-center gap-3">
          <ElevenOneLogo tone="dark" />
          <span className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1 text-sm font-semibold text-neutral-700">
            <LuUtensils className="h-4 w-4 text-neutral-400" />
            {activeTable.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-neutral-700 transition hover:bg-neutral-100"
        >
          <LuChevronLeft className="h-5 w-5" />
          TABLES
        </button>
        <div className="flex flex-1 items-center justify-end gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2b2138] text-xs font-bold text-white">
            {initials}
          </span>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-wide text-neutral-400">Waiter</div>
            <div className="text-sm font-semibold text-neutral-800">{waiter.name}</div>
          </div>
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
                  <div
                    key={line.id}
                    onClick={() => selectLine(line.id)}
                    className={`flex w-full cursor-pointer items-center gap-3 border-b border-neutral-100 px-4 py-3 text-left transition ${
                      selected
                        ? 'border-l-4 border-l-primary bg-primary/[0.06]'
                        : 'border-l-4 border-l-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-neutral-800">{line.name}</p>
                      <p className="mt-0.5 text-sm text-neutral-500">{money(line.price)} / unit</p>
                      {line.note ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          <LuStickyNote className="h-3.5 w-3.5" />
                          {line.note}
                        </span>
                      ) : null}
                    </div>

                    {/* Quantity stepper */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          bump(line.id, -1)
                        }}
                        aria-label="Decrease quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 active:scale-95"
                      >
                        <LuMinus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-base font-bold tabular-nums text-neutral-800">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          bump(line.id, 1)
                        }}
                        aria-label="Increase quantity"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition hover:bg-neutral-100 active:scale-95"
                      >
                        <LuPlus className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="w-16 shrink-0 text-right font-semibold text-neutral-800">
                      {money(lineNet(line))}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLine(line.id)
                      }}
                      aria-label="Remove item"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-300 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <LuTrash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Subtotal (running — not a bill; the cashier settles payment) */}
          <div className="flex items-center justify-between border-t border-neutral-200 px-4 py-3">
            <span className="text-sm text-neutral-500">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
            <span className="text-lg font-bold text-neutral-900">Subtotal: {money(subtotal)}</span>
          </div>

          {/* Control buttons */}
          <div className="grid grid-cols-4 border-t border-l border-neutral-200">
            {CONTROLS.map((c) => {
              const dimmed = c.needsLine && !selectedLine
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openDialog(c.id)}
                  className={`relative flex items-center justify-center gap-1.5 border-b border-r border-neutral-200 px-2 py-3 text-sm font-medium transition ${
                    dimmed ? 'bg-white text-neutral-400' : 'bg-white text-neutral-700 hover:bg-neutral-50'
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
              )
            })}
          </div>

          {/* Send to Kitchen + qty numpad */}
          <div className="flex border-t border-neutral-200">
            <button
              type="button"
              onClick={() => void sendToKitchen()}
              disabled={lines.length === 0 || sending}
              className={`flex w-[38%] min-w-[150px] flex-col items-center justify-center gap-2 border-r border-neutral-200 px-2 py-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 ${
                sent ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-primary/10 hover:bg-primary/15'
              }`}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${
                  sent ? 'bg-emerald-500' : 'bg-primary'
                }`}
              >
                {sending ? (
                  <LuLoaderCircle className="h-7 w-7 animate-spin" />
                ) : sent ? (
                  <LuCheck className="h-7 w-7" />
                ) : (
                  <LuChefHat className="h-7 w-7" />
                )}
              </span>
              <span className={`text-sm font-bold leading-tight ${sent ? 'text-emerald-700' : 'text-primary-dark'}`}>
                {sending ? 'Sending…' : sent ? 'Sent — Send Again' : 'Send to Kitchen'}
              </span>
            </button>

            <div className="grid flex-1 grid-cols-3">
              {NUMPAD.map((key) => (
                <button
                  key={key.k}
                  type="button"
                  onClick={() => pressKey(key.k)}
                  className="flex h-16 items-center justify-center border-b border-r border-neutral-200 bg-white text-lg font-semibold text-neutral-800 transition hover:bg-neutral-50"
                >
                  {key.icon ? <key.icon className="h-5 w-5" /> : key.k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — product catalog */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Categories + search */}
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
                onFocus={() => setKeyboardFor('search')}
                placeholder="Search product"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-3 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Products */}
          <div className="flex-1 overflow-y-auto p-4">
            {menuLoading ? (
              <div className="mt-10 flex items-center justify-center gap-2 text-neutral-400">
                <LuLoaderCircle className="h-5 w-5 animate-spin" />
                Loading menu…
              </div>
            ) : menuError ? (
              <div className="mt-10 flex flex-col items-center gap-3">
                <p className="text-sm text-rose-500">{menuError}</p>
                <button
                  type="button"
                  onClick={() => void reloadMenu()}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  <LuRefreshCw className="h-4 w-4" />
                  Retry
                </button>
              </div>
            ) : visibleProducts.length === 0 ? (
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

      {/* Popups */}
      {dialog === 'info' && selectedLine && (
        <InfoDialog line={selectedLine} products={products ?? []} onClose={closeDialog} />
      )}

      {dialog === 'note' && selectedLine && (
        <Modal
          title="Cooking Note"
          subtitle={selectedLine.name}
          onClose={closeDialog}
          footer={
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveNote}
                className="flex-1 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a]"
              >
                Save Note
              </button>
            </div>
          }
        >
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onFocus={() => setKeyboardFor('note')}
            rows={3}
            placeholder="e.g. No pepper, allergy, cook well done…"
            className="w-full resize-none rounded-xl border border-neutral-200 p-3 text-sm text-neutral-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {NOTE_PRESETS.map((preset) => {
              const active = noteDraft.toLowerCase().includes(preset.toLowerCase())
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => toggleNotePreset(preset)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {preset}
                </button>
              )
            })}
          </div>
        </Modal>
      )}

      {dialog === 'guests' && (
        <NumberPadDialog
          title="Number of Guests"
          subtitle={activeTable.label}
          initialValue={guestCount}
          integer
          min={1}
          suffix="guests"
          confirmLabel="Set Guests"
          onClose={closeDialog}
          onConfirm={applyGuests}
        />
      )}

      {dialog === 'transfer' && (
        <TransferDialog
          current={activeTable}
          tables={tables ?? []}
          onTransfer={transferTo}
          onClose={closeDialog}
        />
      )}

      {/* On-screen keyboards */}
      {keyboardFor === 'search' && (
        <OnScreenKeyboard value={search} onChange={setSearch} onClose={() => setKeyboardFor(null)} />
      )}
      {keyboardFor === 'note' && dialog === 'note' && (
        <OnScreenKeyboard value={noteDraft} onChange={setNoteDraft} onClose={() => setKeyboardFor(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-[#2b2138] px-5 py-3 text-sm font-semibold text-white shadow-lg">
            <LuCheck className="h-4 w-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Popup contents
// ---------------------------------------------------------------------------

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className={strong ? 'text-lg font-bold text-neutral-900' : 'text-sm font-semibold text-neutral-800'}>
        {value}
      </span>
    </div>
  )
}

function InfoDialog({
  line,
  products,
  onClose,
}: {
  line: OrderLine
  products: Product[]
  onClose: () => void
}) {
  const product = products.find((p) => p.id === line.id)
  return (
    <Modal title="Product Information" subtitle={line.name} onClose={onClose}>
      <div className="divide-y divide-neutral-100">
        {product && <InfoRow label="Category" value={product.category} />}
        <InfoRow label="Unit Price" value={money(line.price)} />
        <InfoRow label="Quantity" value={String(line.qty)} />
        {line.note && <InfoRow label="Note" value={line.note} />}
        <InfoRow label="Line Total" value={money(lineNet(line))} strong />
      </div>
    </Modal>
  )
}

function TransferDialog({
  current,
  tables,
  onTransfer,
  onClose,
}: {
  current: PosTable
  tables: PosTable[]
  onTransfer: (t: PosTable) => void
  onClose: () => void
}) {
  const targets = tables.filter((t) => t.id !== current.id)
  return (
    <Modal
      title="Move Order"
      subtitle={`Move the order from ${current.label} to another table`}
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="grid grid-cols-5 gap-2.5">
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTransfer(t)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-neutral-200 py-4 font-semibold text-neutral-700 transition hover:border-primary hover:bg-primary/[0.04]"
          >
            <span className="text-lg">{t.label}</span>
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <LuUsers className="h-3 w-3" />
              {t.seats || '-'}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
