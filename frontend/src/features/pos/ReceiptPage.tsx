import { useState } from 'react'
import {
  LuCheck,
  LuChevronsLeft,
  LuFileText,
  LuLock,
  LuMail,
  LuPower,
  LuPrinter,
  LuRefreshCw,
  LuStore,
  LuTriangleAlert,
  LuUtensils,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import ZoomControl from '../../components/ui/ZoomControl'
import Modal from '../../components/ui/Modal'
import { Loader } from '../../components/ui/Loader'
import { useSettings } from '../../hooks/useSettings'
import { billTableLabel, printBillDocket } from './printBill'
import { emailReceipt } from '../../services/api/orders'
import { ApiError } from '../../services/api/client'
import type { Cashier } from '../auth/CashierLoginDialog'
import type { OrderLine } from './catalog'
import { type PaymentResult } from './PaymentPage'
import type { PosTable } from './TableFloorPage'

const money = (n: number) => `$${n.toFixed(2)}`

// DD/MM/YYYY hh:mm AM/PM — matches the reference receipt.
function formatDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  let hours = d.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(hours)}:${pad(
    d.getMinutes(),
  )} ${ampm}`
}

// ---------------------------------------------------------------------------
// Receipt building blocks
// ---------------------------------------------------------------------------

const Dashed = () => <div className="my-4 border-t border-dashed border-neutral-300" />

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-sm">
      <span className="w-20 shrink-0 text-neutral-500">{label}</span>
      <span className="text-neutral-400">:</span>
      <span className="ml-3 font-medium text-neutral-800">{value}</span>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-800">{value}</span>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconType
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-neutral-100 py-3.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200 active:scale-[0.99]"
    >
      <Icon className="h-5 w-5 text-neutral-500" />
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReceiptPage({
  cashier,
  table,
  lines,
  orderNo,
  discount = 0,
  guests: guestsProp,
  customerName,
  payment,
  warning,
  orderId,
  onBackToTables,
  onSeeOrder,
}: {
  cashier: Cashier
  table: PosTable
  lines: OrderLine[]
  orderNo: string
  /** Extra flat discount on top of any per-line discounts. */
  discount?: number
  guests?: number
  customerName?: string
  payment: PaymentResult
  /** Persistent banner when the sale failed to record on the backend. */
  warning?: string | null
  /** Backend order id — enables Email Receipt (null = never recorded). */
  orderId?: number | null
  onBackToTables: () => void
  onSeeOrder: () => void
}) {
  // Freeze the printed timestamp at the moment the receipt is shown.
  const [printedAt] = useState(() => new Date())
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null)
  const { storeName, storeAddress, storePhone, khrRate } = useSettings()
  const riel = (value: number) => `៛ ${Math.round(value * khrRate).toLocaleString('en-US')}`

  // Gross line totals ignore discounts; per-line discounts are summed into the
  // Discount row so the printed bill reconciles line-by-line. No tax is charged.
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0)
  const lineDiscount = lines.reduce((sum, l) => sum + l.qty * l.price * ((l.discount ?? 0) / 100), 0)
  const discountTotal = lineDiscount + discount
  const total = subtotal - discountTotal

  const initials = cashier.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  const guests = guestsProp ?? (table.guests > 0 ? table.guests : 2)

  // Print the bilingual 80mm thermal invoice (the reference the venue uses) —
  // same builder as the "Bill" popup, now carrying the settled tender so the
  // "Cash Received" section shows how the guest actually paid. Rendered into its
  // own iframe so only the invoice hits the paper (never this screen behind it).
  const printReceipt = () =>
    printBillDocket({
      kind: 'invoice',
      tableLabel: billTableLabel(table),
      orderRef: orderNo,
      lines,
      khrRate,
      payment: {
        tenders: payment.paid.map((p) => ({ label: p.label, amount: p.amount, inKhr: p.inKhr })),
        change: payment.change,
      },
    })

  async function sendEmail() {
    if (emailBusy || orderId == null) return
    setEmailBusy(true)
    setEmailNote(null)
    try {
      const res = await emailReceipt(orderId, emailTo.trim() || undefined)
      setEmailNote({ ok: true, text: res.message })
    } catch (e: unknown) {
      setEmailNote({
        ok: false,
        text: e instanceof ApiError ? e.message : 'Sending failed. Check the connection.',
      })
    } finally {
      setEmailBusy(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6] print:h-auto print:bg-white">
      {/* Top toolbar — mirrors the Payment screen so the session stays put */}
      <header className="flex h-16 shrink-0 items-center gap-1 bg-[#2b2138] px-4 text-white shadow-md print:hidden">
        <ElevenOneLogo />
        <div className="mx-3 h-8 w-px bg-white/15" />

        <button
          type="button"
          onClick={onBackToTables}
          className="ml-2 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <LuChevronsLeft className="h-5 w-5" />
          {table.label}
        </button>

        <div className="ml-auto flex items-center gap-4">
          <ZoomControl tone="dark" />
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              {initials}
            </span>
            <div className="leading-tight">
              <div className="text-[11px] uppercase tracking-wide text-white/55">Cashier</div>
              <div className="text-sm font-semibold">{cashier.name}</div>
            </div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <LuRefreshCw className="h-5 w-5" />
            <span className="text-[11px] font-medium">Reload</span>
          </button>
          <button
            type="button"
            onClick={onBackToTables}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <LuLock className="h-5 w-5" />
            <span className="text-[11px] font-medium">Lock</span>
          </button>
          <button
            type="button"
            onClick={onBackToTables}
            className="flex w-[68px] flex-col items-center gap-0.5 rounded-lg py-1.5 text-white/85 transition hover:bg-white/10 hover:text-rose-300"
          >
            <LuPower className="h-5 w-5" />
            <span className="text-[11px] font-medium">Close</span>
          </button>
        </div>
      </header>

      {/* Sub-toolbar: Back to Tables / title / Print Receipt */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 print:hidden">
        <button
          type="button"
          onClick={onBackToTables}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2.5 font-semibold text-neutral-700 transition hover:bg-neutral-100"
        >
          <LuChevronsLeft className="h-5 w-5" />
          Back to Tables
        </button>
        <h1 className="text-xl font-bold text-neutral-900">Receipt</h1>
        <button
          type="button"
          onClick={printReceipt}
          className="flex items-center gap-2 rounded-lg bg-[#2b2138] px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#37294a]"
        >
          <LuPrinter className="h-5 w-5" />
          Print Receipt
        </button>
      </div>

      {/* Stays on screen (never printed) until the receipt is dismissed. */}
      {warning && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm font-semibold text-rose-700 print:hidden">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
            !
          </span>
          {warning}
        </div>
      )}

      {/* Body */}
      {/* items-start so each card is only as tall as its own content — stretched
          cards would clip a long receipt against the viewport instead. */}
      <div className="flex flex-1 items-start gap-6 overflow-auto p-6 print:block print:overflow-visible print:p-0">
        {/* Left — printed receipt */}
        <div className="min-w-0 flex-1 rounded-2xl border border-neutral-200 bg-white p-8 text-neutral-800 shadow-sm print:mx-auto print:max-w-md print:rounded-none print:border-0 print:p-6 print:shadow-none">
          {/* Store header */}
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#2b2138] text-white">
              <LuUtensils className="h-7 w-7" />
            </span>
            <div className="leading-snug">
              <h2 className="text-xl font-bold text-neutral-900">{storeName}</h2>
              <p className="text-sm text-neutral-500">{storeAddress}</p>
              <p className="text-sm text-neutral-500">Tel: {storePhone}</p>
            </div>
          </div>

          <Dashed />

          <div className="text-center">
            <h3 className="text-lg font-bold tracking-wide text-neutral-900">RECEIPT</h3>
            <p className="text-sm text-neutral-500">Order # {orderNo}</p>
          </div>

          {/* Order meta */}
          <div className="mt-4 space-y-1.5">
            <MetaRow label="Table" value={table.label} />
            <MetaRow label="Cashier" value={cashier.name} />
            <MetaRow label="Date" value={formatDateTime(printedAt)} />
            <MetaRow label="Guests" value={String(guests)} />
            {customerName && <MetaRow label="Customer" value={customerName} />}
          </div>

          <Dashed />

          {/* Line items */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="pb-2 text-left font-medium">Item</th>
                <th className="pb-2 text-center font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit Price</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-neutral-50">
                  <td className="py-1.5 text-left text-neutral-800">
                    {line.name}
                    {line.discount ? (
                      <span className="ml-1.5 text-xs font-medium text-rose-500">
                        −{line.discount}%
                      </span>
                    ) : null}
                    {line.note ? <div className="text-xs italic text-neutral-400">{line.note}</div> : null}
                  </td>
                  <td className="py-1.5 text-center text-neutral-600">x{line.qty}</td>
                  <td className="py-1.5 text-right text-neutral-600">{money(line.price)}</td>
                  <td className="py-1.5 text-right font-medium text-neutral-800">
                    {money(line.qty * line.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Dashed />

          {/* Summary */}
          <div className="space-y-1.5 text-sm tabular-nums">
            <SummaryRow label="Subtotal" value={money(subtotal)} />
            <SummaryRow label="Discount" value={`− ${money(discountTotal)}`} />
          </div>

          <div className="mt-3 border-t border-neutral-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-neutral-900">Total</span>
              <span className="text-2xl font-bold text-neutral-900 tabular-nums">{money(total)}</span>
            </div>
            <div className="mt-0.5 text-right text-sm font-semibold text-neutral-500 tabular-nums">
              {riel(total)}
            </div>
          </div>

          {/* Tender — each amount prints in the currency the customer handed
              over (riel cash in ៛, everything else in $), so a cash payment
              always states which cash it was. */}
          <div className="mt-4 space-y-1.5 text-sm tabular-nums">
            <SummaryRow label="Paid By" value={payment.methodName} />
            {payment.paid.map((t, i) => (
              <div key={`${t.label}-${i}`} className="flex items-center justify-between">
                <span className="text-neutral-500">
                  {payment.paid.length > 1 ? t.label : t.isCash ? 'Cash Received' : 'Amount Paid'}
                </span>
                <span className="font-medium text-neutral-800">
                  {t.inKhr ? riel(t.amount) : money(t.amount)}
                </span>
              </div>
            ))}
            {payment.change > 0.005 && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Change</span>
                <span className="text-right">
                  <span className="font-semibold text-emerald-600">{money(payment.change)}</span>
                  <span className="ml-2 text-emerald-500/70">{riel(payment.change)}</span>
                </span>
              </div>
            )}
          </div>

          <Dashed />

          <div className="text-center text-sm text-neutral-500">
            <p className="font-medium text-neutral-700">Thank you!</p>
            <p>Please come again.</p>
          </div>
        </div>

        {/* Right — payment confirmation */}
        {/* Sticky + min-h-full: keeps the confirmation card in view and full
            height while a long receipt scrolls beside it. */}
        <div className="sticky top-0 flex max-h-full min-h-full w-[38%] min-w-[360px] max-w-[520px] shrink-0 flex-col items-center justify-center overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm print:hidden">
          {warning ? (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                <LuTriangleAlert className="h-11 w-11" strokeWidth={2.5} />
              </span>
              <h2 className="mt-6 text-2xl font-bold text-neutral-900">Not Recorded on Server</h2>
              <p className="mt-2 text-3xl font-bold text-rose-600 tabular-nums">{money(total)}</p>
              <p className="text-sm font-semibold text-neutral-400 tabular-nums">{riel(total)}</p>
              <p className="mt-2 text-sm text-neutral-500">
                The receipt printed, but this sale did not reach the server — re-settle it once the
                connection is back.
              </p>
            </>
          ) : (
            <>
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                <LuCheck className="h-11 w-11" strokeWidth={3} />
              </span>
              <h2 className="mt-6 text-2xl font-bold text-neutral-900">Payment Successful</h2>
              <p className="mt-2 text-3xl font-bold text-emerald-600 tabular-nums">{money(total)}</p>
              <p className="text-sm font-semibold text-neutral-400 tabular-nums">{riel(total)}</p>
              <p className="mt-2 text-sm text-neutral-500">Receipt has been printed successfully.</p>
            </>
          )}

          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <ActionButton icon={LuPrinter} label="Print Again" onClick={printReceipt} />
            {orderId != null && (
              <ActionButton
                icon={LuMail}
                label="Email Receipt"
                onClick={() => {
                  setEmailNote(null)
                  setEmailOpen(true)
                }}
              />
            )}
            <ActionButton icon={LuFileText} label="See Order" onClick={onSeeOrder} />
            <button
              type="button"
              onClick={onBackToTables}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#2b2138] py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#37294a] active:scale-[0.99]"
            >
              <LuStore className="h-5 w-5" />
              Back to Tables
            </button>
          </div>
        </div>
      </div>

      {emailOpen && (
        <Modal
          title="Email Receipt"
          subtitle="Send the guest their copy of this bill"
          onClose={() => setEmailOpen(false)}
          width="max-w-md"
        >
          <label className="text-xs font-bold uppercase tracking-wide text-neutral-400" htmlFor="receipt-email">
            Email address
          </label>
          <input
            id="receipt-email"
            type="email"
            autoFocus
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder={customerName ? `Leave empty to use ${customerName}'s saved email` : 'guest@example.com'}
            className="mt-2 h-11 w-full rounded-xl border border-neutral-200 px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {emailNote && (
            <p
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                emailNote.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
              }`}
            >
              {emailNote.text}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setEmailOpen(false)}
              className="flex-1 rounded-xl border border-neutral-300 py-3 font-semibold text-neutral-700 transition hover:bg-neutral-100"
            >
              {emailNote?.ok ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void sendEmail()}
              disabled={emailBusy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2b2138] py-3 font-semibold text-white shadow-sm transition hover:bg-[#37294a] disabled:opacity-60"
            >
              {emailBusy && <Loader size="sm" />}
              Send
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
