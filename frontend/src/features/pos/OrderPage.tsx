import { useEffect, useMemo, useState } from 'react'
import {
  LuArrowRightLeft,
  LuCheck,
  LuChefHat,
  LuChevronLeft,
  LuChevronRight,
  LuDelete,
  LuHouse,
  LuInfo,
  LuLoaderCircle,
  LuMenu,
  LuMinus,
  LuNotebookPen,
  LuPercent,
  LuPlus,
  LuPrinter,
  LuReceipt,
  LuRefreshCw,
  LuRotateCcw,
  LuSearch,
  LuSplit,
  LuStickyNote,
  LuUser,
  LuUsers,
  LuUtensils,
  LuWifi,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import Modal from '../../components/ui/Modal'
import NumberPadDialog from '../../components/ui/NumberPadDialog'
import OnScreenKeyboard from '../../components/ui/OnScreenKeyboard'
import PaymentPage, { type PaymentResult } from './PaymentPage'
import ReceiptPage from './ReceiptPage'
import { printOrderTickets, stationForCategory, stationLabel } from '../kitchen/printKitchenTicket'
import { createOrder, updateOrder, type OrderPayload } from '../../services/api/orders'
import { recordPayment } from '../../services/api/payments'
import { fetchCustomers, createCustomer, type Customer } from '../../services/api/customers'
import { ApiError } from '../../services/api/client'
import { useMenu } from '../../hooks/useMenu'
import { useTables } from '../../hooks/useTables'
import { useSettings } from '../../hooks/useSettings'
import type { Cashier } from '../auth/CashierLoginDialog'
import type { PosTable } from './TableFloorPage'
import {
  CATEGORIES,
  NOTE_PRESETS,
  ProductThumb,
  lineNet,
  money,
  type Category,
  type OrderLine,
  type Product,
} from './catalog'

// ---------------------------------------------------------------------------
// Order state
// ---------------------------------------------------------------------------

type NumpadMode = 'qty' | 'disc' | 'price'

// Which popup is currently open (null = none).
type DialogKind =
  | 'info'
  | 'note'
  | 'guests'
  | 'discount'
  | 'customer'
  | 'refund'
  | 'bill'
  | 'transfer'
  | 'split'
  | null

// ---------------------------------------------------------------------------
// Control buttons
// ---------------------------------------------------------------------------

type Control = {
  id: Exclude<DialogKind, null>
  icon: IconType
  label: string
  badge?: number
  span2?: boolean
  /** Requires an order line to be selected first. */
  needsLine?: boolean
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
  const [lines, setLines] = useState<OrderLine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<NumpadMode>('qty')
  const [entry, setEntry] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('Food')
  const [search, setSearch] = useState('')
  const [keyboardFor, setKeyboardFor] = useState<null | 'search' | 'note'>(null)
  const [screen, setScreen] = useState<'order' | 'payment' | 'receipt'>('order')
  const [payment, setPayment] = useState<PaymentResult | null>(null)

  // Order-level state driven by the control buttons.
  const [activeTable, setActiveTable] = useState<PosTable>(table)
  const [guestCount, setGuestCount] = useState(table.guests > 0 ? table.guests : 2)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Internal-note draft lives only while its popup is open.
  const [noteDraft, setNoteDraft] = useState('')

  // Split: how many units of each line are moved to the "pay now" side.
  const [splitQty, setSplitQty] = useState<Record<string, number>>({})
  // When set, the payment/receipt flow settles just this subset (a split).
  const [settling, setSettling] = useState<{ lines: OrderLine[]; total: number } | null>(null)

  // Menu + floor from the backend (floor is only needed for the Transfer popup).
  const { products, loading: menuLoading, error: menuError, reload: reloadMenu } = useMenu()
  const { tables } = useTables()
  const { taxRate } = useSettings()

  // Backend order — created on the first "Send to Kitchen", updated after that.
  const [backendOrderId, setBackendOrderId] = useState<number | null>(null)
  // Local placeholder until the backend issues the real order number.
  const [orderNo, setOrderNo] = useState(() =>
    String(Math.floor(Date.now() / 1000) % 1000000).padStart(6, '0'),
  )

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + lineNet(l), 0), [lines])
  const taxes = subtotal * taxRate
  const total = subtotal + taxes
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
  }

  function selectLine(id: string) {
    setSelectedId(id)
    setEntry(null)
  }

  function updateLine(id: string, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function switchMode(next: NumpadMode) {
    setMode(next)
    setEntry(null)
  }

  // Numpad — edits the selected line's qty, discount, or price depending on mode.
  function pressKey(key: string) {
    if (key === 'Qty') return switchMode('qty')
    if (key === 'Disc') return switchMode('disc')
    if (key === 'Price') return switchMode('price')

    const line = lines.find((l) => l.id === selectedId)
    if (!line) return

    const currentValue = mode === 'qty' ? line.qty : mode === 'disc' ? line.discount ?? 0 : line.price
    const current = entry ?? String(currentValue)
    let next: string
    if (key === 'del') next = current.slice(0, -1)
    else if (key === '+/-') next = current.startsWith('-') ? current.slice(1) : `-${current}`
    else if (key === '.') next = current.includes('.') ? current : `${current}.`
    else next = (entry === null ? '' : current) + key

    setEntry(next)
    let parsed = Number(next)
    if (!Number.isFinite(parsed)) parsed = 0
    if (mode === 'qty') updateLine(line.id, { qty: parsed })
    else if (mode === 'disc') updateLine(line.id, { discount: Math.min(100, Math.max(0, parsed)) })
    else updateLine(line.id, { price: Math.max(0, parsed) })
  }

  // ---- Control dispatch -----------------------------------------------------

  function openDialog(id: Exclude<DialogKind, null>) {
    if ((id === 'info' || id === 'note' || id === 'refund') && !selectedLine) {
      return notify('Select an item first')
    }
    if ((id === 'discount' || id === 'split' || id === 'bill') && lines.length === 0) {
      return notify('The order is empty')
    }
    if (id === 'note' && selectedLine) setNoteDraft(selectedLine.note ?? '')
    if (id === 'split') setSplitQty({})
    setDialog(id)
  }

  function closeDialog() {
    setDialog(null)
  }

  // ---- Individual actions ---------------------------------------------------

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

  function applyDiscountAll(percent: number) {
    setLines((prev) => prev.map((l) => ({ ...l, discount: percent > 0 ? percent : undefined })))
    closeDialog()
    notify(percent > 0 ? `${percent}% discount applied to all` : 'Discount cleared')
  }

  function chooseCustomer(c: Customer | null) {
    setCustomer(c)
    closeDialog()
    notify(c ? `Customer: ${c.name}` : 'Customer removed')
  }

  function confirmRefund() {
    if (selectedLine) {
      const refunding = selectedLine.qty >= 0
      updateLine(selectedLine.id, { qty: -Math.abs(selectedLine.qty) * (refunding ? 1 : -1) })
      notify(refunding ? 'Item marked as refund' : 'Refund reverted')
    }
    closeDialog()
  }

  function transferTo(t: PosTable) {
    setActiveTable(t)
    closeDialog()
    notify(`Order transferred to ${t.label}`)
    // Best effort: if the order already exists on the backend, move it there too.
    if (backendOrderId != null) {
      void updateOrder(backendOrderId, {
        order_type: t.section === 'takeaway' ? 'take_away' : 'dine_in',
        table_id: t.backendId ?? null,
      }).catch(() => notify('Moved locally, but the server was not updated'))
    }
  }

  function printBill() {
    window.print()
  }

  const round2 = (n: number) => Math.round(n * 100) / 100

  // Build the backend order payload from the current lines. The backend stores
  // line totals without per-line discounts, so we fold the whole order's
  // discount into a single `discount` and pass `tax` explicitly — that way the
  // server's total (subtotal − discount + tax) matches the amount we charge.
  function buildOrderPayload(): OrderPayload {
    const cook = lines.filter((l) => l.qty > 0)
    const grossPositive = cook.reduce((sum, l) => sum + l.qty * l.price, 0)
    return {
      order_type: activeTable.section === 'takeaway' ? 'take_away' : 'dine_in',
      table_id: activeTable.backendId ?? null,
      discount: Math.max(0, round2(grossPositive - subtotal)),
      tax: round2(taxes),
      items: cook.map((l) => ({
        // Line ids match backend menu-item ids (stringified).
        menu_item_id: Number(l.id),
        quantity: Math.max(1, Math.round(l.qty)),
        note: l.note,
      })),
    }
  }

  // Fire the order: save it on the backend (create on the first send, replace
  // items after that), then print the dockets — drinks route to the bar
  // printer, food and desserts to the kitchen printer, each as its own docket
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
      const payload = buildOrderPayload()
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
      // The product's category picks the printer; unknown items default to the kitchen.
      const cat = products?.find((p) => p.id === l.id)?.category ?? 'Food'
      return { name: l.name, qty: l.qty, note: l.note, station: stationForCategory(cat) }
    })
    const printed = printOrderTickets(
      {
        orderNo: ticketOrderNo,
        tableLabel: activeTable.label,
        orderType: orderTypeLabel,
        guests: guestCount,
        server: cashier.name,
      },
      ticketLines,
    )
    setSending(false)
    if (printed.length === 0) return notify('The order is empty')
    const names = printed.map(stationLabel).join(' + ')
    notify(
      synced
        ? `Order #${ticketOrderNo} sent to ${names}`
        : `Printed to ${names}, but saving to the server failed`,
    )
  }

  // ---- Split ----------------------------------------------------------------

  const splitLines = useMemo(
    () =>
      lines
        .filter((l) => (splitQty[l.id] ?? 0) > 0)
        .map((l) => ({ ...l, qty: splitQty[l.id] })),
    [lines, splitQty],
  )
  const splitSubtotal = splitLines.reduce((s, l) => s + lineNet(l), 0)
  const splitTotal = splitSubtotal * (1 + taxRate)

  function addToSplit(id: string) {
    setSplitQty((prev) => {
      const cur = prev[id] ?? 0
      const max = lines.find((l) => l.id === id)?.qty ?? 0
      if (cur >= max) return prev
      return { ...prev, [id]: cur + 1 }
    })
  }

  function removeFromSplit(id: string) {
    setSplitQty((prev) => {
      const cur = prev[id] ?? 0
      if (cur <= 0) return prev
      const next = { ...prev }
      if (cur - 1 <= 0) delete next[id]
      else next[id] = cur - 1
      return next
    })
  }

  function paySplit() {
    if (splitTotal <= 0) return
    setSettling({ lines: splitLines, total: splitTotal })
    closeDialog()
    setScreen('payment')
  }

  function payWholeOrder() {
    setSettling(null)
    setScreen('payment')
  }

  // Record the settled bill on the backend, then show the receipt. Ensures the
  // order exists (creating it if the cashier never sent to the kitchen) with
  // totals that match the charge, posts one payment per tender, and lets the
  // server complete the order + free the table once it's fully paid. A split
  // pays a subset, so its order stays open until the final portion is settled.
  // If the server can't be reached the receipt still prints; the sale just
  // isn't recorded.
  async function settlePayment(result: PaymentResult) {
    const split = settling
    const billTotal = split ? split.total : total
    try {
      let orderId = backendOrderId
      if (orderId == null) {
        const created = await createOrder(buildOrderPayload())
        orderId = created.id
        setBackendOrderId(created.id)
        setOrderNo(created.order_number)
      } else if (!split) {
        // Whole-order pay on an existing order: refresh its items + totals first.
        const updated = await updateOrder(orderId, buildOrderPayload())
        setOrderNo(updated.order_number)
      }

      if (orderId != null && billTotal > 0.001) {
        for (const tender of result.tenders) {
          await recordPayment({ order_id: orderId, method: tender.method, amount: tender.amount })
        }
        // A split that clears the last remaining items closes the order even if
        // a rounding cent left cumulative payments a hair under the total.
        if (split) {
          const paid = new Map(split.lines.map((l) => [l.id, l.qty]))
          const remainingQty = lines
            .filter((l) => l.qty > 0)
            .reduce((sum, l) => sum + (l.qty - (paid.get(l.id) ?? 0)), 0)
          if (remainingQty <= 0.0001) await updateOrder(orderId, { status: 'completed' })
        }
      }
    } catch {
      notify('Saved the sale locally, but the server was not updated')
    }
    setPayment(result)
    setScreen('receipt')
  }

  // When a receipt is dismissed, subtract any settled split from the live order.
  function leaveReceipt(next: () => void) {
    if (settling) {
      const paid = settling.lines
      setLines((prev) =>
        prev
          .map((l) => {
            const s = paid.find((p) => p.id === l.id)
            return s ? { ...l, qty: l.qty - s.qty } : l
          })
          .filter((l) => Math.abs(l.qty) > 0.0001),
      )
      setSettling(null)
    }
    setPayment(null)
    next()
  }

  const CONTROLS: Control[] = [
    { id: 'info', icon: LuInfo, label: 'Info', needsLine: true },
    { id: 'refund', icon: LuRotateCcw, label: 'Refund', needsLine: true },
    { id: 'note', icon: LuNotebookPen, label: 'Internal Note', needsLine: true },
    { id: 'guests', icon: LuUsers, label: 'Guests', badge: guestCount },
    { id: 'bill', icon: LuPrinter, label: 'Bill' },
    { id: 'split', icon: LuSplit, label: 'Split' },
    { id: 'transfer', icon: LuArrowRightLeft, label: 'Transfer' },
    { id: 'discount', icon: LuPercent, label: 'Discount All', span2: true },
  ]

  const NUMPAD: { k: string; mode?: NumpadMode; icon?: IconType }[] = [
    { k: '1' }, { k: '2' }, { k: '3' }, { k: 'Qty', mode: 'qty' },
    { k: '4' }, { k: '5' }, { k: '6' }, { k: 'Disc', mode: 'disc' },
    { k: '7' }, { k: '8' }, { k: '9' }, { k: 'Price', mode: 'price' },
    { k: '+/-' }, { k: '0' }, { k: '.' }, { k: 'del', icon: LuDelete },
  ]

  if (screen === 'payment') {
    return (
      <PaymentPage
        cashier={cashier}
        table={activeTable}
        total={settling ? settling.total : total}
        onBack={() => {
          setSettling(null)
          setScreen('order')
        }}
        onValidate={(result) => void settlePayment(result)}
      />
    )
  }

  if (screen === 'receipt' && payment) {
    return (
      <ReceiptPage
        cashier={cashier}
        table={activeTable}
        lines={settling ? settling.lines : lines}
        orderNo={orderNo}
        taxRate={taxRate}
        guests={guestCount}
        customerName={customer?.name}
        payment={payment}
        onBackToTables={() => leaveReceipt(onBack)}
        onSeeOrder={() => leaveReceipt(() => setScreen('order'))}
      />
    )
  }

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
          BACK
        </button>
        <div className="flex flex-1 items-center justify-end gap-4">
          {customer && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700">
              <LuUser className="h-4 w-4 text-neutral-400" />
              {customer.name}
            </span>
          )}
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
                const refund = line.qty < 0
                const net = lineNet(line)
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => selectLine(line.id)}
                    className={`flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3 text-left transition ${
                      selected
                        ? 'border-l-4 border-l-emerald-500 bg-emerald-50'
                        : 'border-l-4 border-l-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${refund ? 'text-rose-700' : 'text-emerald-800'}`}>
                        {refund && <span className="mr-1 text-xs uppercase">Refund</span>}
                        {line.name}
                      </p>
                      <p className={`mt-0.5 text-sm ${refund ? 'text-rose-500' : 'text-emerald-600'}`}>
                        {line.qty.toFixed(2)} Units x {money(line.price)} / Units
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {line.discount ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700">
                            <LuPercent className="h-3 w-3" />
                            {line.discount}% off
                          </span>
                        ) : null}
                        {line.note ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                            <LuStickyNote className="h-3.5 w-3.5" />
                            {line.note}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 text-right">
                      {line.discount ? (
                        <span className="block text-xs text-neutral-400 line-through">
                          {money(line.qty * line.price)}
                        </span>
                      ) : null}
                      <span className={`font-semibold ${refund ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {money(net)}
                      </span>
                    </span>
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
            {CONTROLS.map((c) => {
              const dimmed = c.needsLine && !selectedLine
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openDialog(c.id)}
                  className={`relative flex items-center justify-center gap-2 border-b border-r border-neutral-200 px-2 py-3 text-sm font-medium transition ${
                    c.span2 ? 'col-span-2' : ''
                  } ${dimmed ? 'bg-white text-neutral-400' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}
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

          {/* Payment + numpad */}
          <div className="flex border-t border-neutral-200">
            {/* Customer + send-to-kitchen + payment */}
            <div className="flex w-[26%] min-w-[128px] flex-col border-r border-neutral-200">
              <button
                type="button"
                onClick={() => openDialog('customer')}
                className="flex items-center gap-1.5 border-b border-neutral-200 px-3 py-2.5 text-left text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                <LuUser className="h-4 w-4 shrink-0" />
                <span className="truncate">{customer ? customer.name : 'Customer'}</span>
              </button>
              <button
                type="button"
                onClick={() => void sendToKitchen()}
                disabled={lines.length === 0 || sending}
                className="flex flex-1 flex-col items-center justify-center gap-1.5 border-b border-neutral-200 bg-primary/10 px-2 py-3 text-center transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
                  {sending ? (
                    <LuLoaderCircle className="h-6 w-6 animate-spin" />
                  ) : (
                    <LuChefHat className="h-6 w-6" />
                  )}
                </span>
                <span className="text-[13px] font-bold leading-tight text-primary-dark">
                  {sending ? 'Sending…' : 'Send to Kitchen'}
                </span>
              </button>
              <button
                type="button"
                onClick={payWholeOrder}
                disabled={lines.length === 0}
                className="flex flex-1 flex-col items-center justify-center gap-2 bg-white px-2 py-4 text-center transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2b2138] text-white">
                  <LuChevronRight className="h-6 w-6" />
                </span>
                <span className="text-sm font-bold text-neutral-800">Payment</span>
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

      {/* Popups */}
      {dialog === 'info' && selectedLine && (
        <InfoDialog line={selectedLine} products={products ?? []} onClose={closeDialog} />
      )}

      {dialog === 'note' && selectedLine && (
        <Modal
          title="Internal Note"
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

      {keyboardFor === 'search' && screen === 'order' && (
        <OnScreenKeyboard value={search} onChange={setSearch} onClose={() => setKeyboardFor(null)} />
      )}

      {keyboardFor === 'note' && dialog === 'note' && (
        <OnScreenKeyboard value={noteDraft} onChange={setNoteDraft} onClose={() => setKeyboardFor(null)} />
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

      {dialog === 'discount' && (
        <NumberPadDialog
          title="Discount on All Items"
          subtitle="Applies to every line in the order"
          initialValue={lines[0]?.discount ?? 0}
          min={0}
          max={100}
          suffix="%"
          confirmLabel="Apply Discount"
          onClose={closeDialog}
          onConfirm={applyDiscountAll}
        />
      )}

      {dialog === 'customer' && (
        <CustomerDialog current={customer} onChoose={chooseCustomer} onClose={closeDialog} />
      )}

      {dialog === 'refund' && selectedLine && (
        <Modal
          title={selectedLine.qty >= 0 ? 'Refund Item' : 'Revert Refund'}
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
                onClick={confirmRefund}
                className="flex-1 rounded-xl bg-rose-600 py-3 font-semibold text-white shadow-sm transition hover:bg-rose-700"
              >
                {selectedLine.qty >= 0 ? 'Confirm Refund' : 'Revert'}
              </button>
            </div>
          }
        >
          <p className="text-sm text-neutral-600">
            {selectedLine.qty >= 0 ? (
              <>
                This converts <span className="font-semibold text-neutral-900">{selectedLine.name}</span> into a
                return of {selectedLine.qty} unit(s), subtracting {money(lineNet(selectedLine))} from the order.
              </>
            ) : (
              <>Restore <span className="font-semibold text-neutral-900">{selectedLine.name}</span> back to a normal sale line.</>
            )}
          </p>
        </Modal>
      )}

      {dialog === 'bill' && (
        <BillDialog
          table={activeTable}
          guests={guestCount}
          customerName={customer?.name}
          lines={lines}
          subtotal={subtotal}
          taxRate={taxRate}
          taxes={taxes}
          total={total}
          onPrint={printBill}
          onClose={closeDialog}
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

      {dialog === 'split' && (
        <SplitDialog
          lines={lines}
          splitQty={splitQty}
          onAdd={addToSplit}
          onRemove={removeFromSplit}
          splitLines={splitLines}
          splitSubtotal={splitSubtotal}
          splitTotal={splitTotal}
          taxRate={taxRate}
          onPay={paySplit}
          onClose={closeDialog}
        />
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
        <InfoRow label="Quantity" value={line.qty.toFixed(2)} />
        <InfoRow label="Discount" value={line.discount ? `${line.discount}%` : '—'} />
        {line.note && <InfoRow label="Note" value={line.note} />}
        <InfoRow label="Line Total" value={money(lineNet(line))} strong />
      </div>
    </Modal>
  )
}

function CustomerDialog({
  current,
  onChoose,
  onClose,
}: {
  current: Customer | null
  onChoose: (c: Customer | null) => void
  onClose: () => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetchCustomers()
      .then((cs) => alive && setCustomers(cs))
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const term = search.trim().toLowerCase()
  const results = customers.filter(
    (c) => c.name.toLowerCase().includes(term) || (c.phone ?? '').includes(term),
  )

  async function addNew() {
    if (!newName.trim()) return setError('Enter a name')
    setSaving(true)
    setError('')
    try {
      const created = await createCustomer({ name: newName.trim(), phone: newPhone.trim() || null })
      onChoose(created) // select the freshly added customer and close
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the customer')
      setSaving(false)
    }
  }

  return (
    <Modal title={adding ? 'New Customer' : 'Select Customer'} onClose={onClose} width="max-w-lg">
      {adding ? (
        <div className="space-y-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Customer name"
            className="h-11 w-full rounded-xl border border-neutral-200 px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="h-11 w-full rounded-xl border border-neutral-200 px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setError('')
              }}
              className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addNew()}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a] disabled:opacity-60"
            >
              {saving && <LuLoaderCircle className="h-4 w-4 animate-spin" />}
              Save Customer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone"
                className="h-11 w-full rounded-xl border border-neutral-200 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setNewName(search)
                setNewPhone('')
                setError('')
                setAdding(true)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 font-semibold text-white transition hover:bg-primary-dark"
            >
              <LuPlus className="h-4 w-4" />
              New
            </button>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {current && (
              <button
                type="button"
                onClick={() => onChoose(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                Remove current customer
              </button>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-neutral-400">
                <LuLoaderCircle className="h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                {results.map((c) => {
                  const selected = current?.id === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChoose(c)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        selected ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">
                        {c.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-neutral-800">{c.name}</span>
                        {c.phone && <span className="block text-xs text-neutral-500">{c.phone}</span>}
                      </span>
                      {selected && <LuCheck className="h-5 w-5 text-emerald-600" />}
                    </button>
                  )
                })}
                {results.length === 0 && (
                  <p className="py-6 text-center text-sm text-neutral-400">
                    No customers match “{search}”.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

function BillDialog({
  table,
  guests,
  customerName,
  lines,
  subtotal,
  taxRate,
  taxes,
  total,
  onPrint,
  onClose,
}: {
  table: PosTable
  guests: number
  customerName?: string
  lines: OrderLine[]
  subtotal: number
  taxRate: number
  taxes: number
  total: number
  onPrint: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title="Bill Preview"
      subtitle="Proforma — not a paid receipt"
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a]"
          >
            <LuReceipt className="h-5 w-5" />
            Print Bill
          </button>
        </div>
      }
    >
      <div className="mb-3 flex justify-between text-sm text-neutral-500">
        <span>Table {table.label}</span>
        <span>{guests} guest(s)</span>
      </div>
      {customerName && <div className="mb-3 text-sm text-neutral-500">Customer: {customerName}</div>}
      <div className="divide-y divide-neutral-100">
        {lines.map((l) => (
          <div key={l.id} className="flex items-start justify-between py-2 text-sm">
            <span className="text-neutral-800">
              {l.name}
              <span className="ml-1 text-neutral-400">×{l.qty}</span>
              {l.discount ? <span className="ml-1 text-rose-500">−{l.discount}%</span> : null}
            </span>
            <span className="font-medium text-neutral-800">{money(lineNet(l))}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5 border-t border-neutral-200 pt-3 text-sm tabular-nums">
        <div className="flex justify-between text-neutral-500">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="flex justify-between text-neutral-500">
          <span>Taxes ({Math.round(taxRate * 100)}%)</span>
          <span>{money(taxes)}</span>
        </div>
        <div className="flex justify-between pt-1 text-lg font-bold text-neutral-900">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
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
      title="Transfer Order"
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
            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-neutral-200 py-4 font-semibold text-neutral-700 transition hover:border-emerald-400 hover:bg-emerald-50"
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

function SplitDialog({
  lines,
  splitQty,
  onAdd,
  onRemove,
  splitLines,
  splitSubtotal,
  splitTotal,
  taxRate,
  onPay,
  onClose,
}: {
  lines: OrderLine[]
  splitQty: Record<string, number>
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  splitLines: OrderLine[]
  splitSubtotal: number
  splitTotal: number
  taxRate: number
  onPay: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title="Split the Bill"
      subtitle="Tap items to move them to the portion you want to pay now"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-500">
            Split total <span className="ml-1 text-lg font-bold text-neutral-900">{money(splitTotal)}</span>
          </div>
          <button
            type="button"
            onClick={onPay}
            disabled={splitTotal <= 0}
            className="flex items-center gap-2 rounded-xl bg-[#2b2138] px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LuChevronRight className="h-5 w-5" />
            Pay {money(splitTotal)}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        {/* Remaining order */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Stays on order</h3>
          <div className="space-y-1.5">
            {lines.map((l) => {
              const remaining = l.qty - (splitQty[l.id] ?? 0)
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onAdd(l.id)}
                  disabled={remaining <= 0}
                  className="flex w-full items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:bg-transparent"
                >
                  <span className="text-sm font-medium text-neutral-800">{l.name}</span>
                  <span className="flex items-center gap-2 text-sm text-neutral-500">
                    ×{remaining}
                    <LuPlus className="h-4 w-4 text-emerald-500" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Split portion */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Pay now</h3>
          {splitLines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400">
              No items yet
            </p>
          ) : (
            <div className="space-y-1.5">
              {splitLines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-neutral-800">{l.name}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onRemove(l.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-rose-500 shadow-sm transition hover:bg-rose-50"
                    >
                      <LuMinus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center font-semibold text-neutral-700">×{l.qty}</span>
                    <span className="w-16 text-right font-semibold text-emerald-700">{money(lineNet(l))}</span>
                  </span>
                </div>
              ))}
              <div className="mt-2 space-y-1 border-t border-neutral-200 pt-2 text-sm tabular-nums">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal</span>
                  <span>{money(splitSubtotal)}</span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Taxes ({Math.round(taxRate * 100)}%)</span>
                  <span>{money(splitSubtotal * taxRate)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
