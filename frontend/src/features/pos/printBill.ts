// Bill / invoice printing — the bilingual (Khmer / English) 80mm thermal docket
// the venue uses. It is rendered into a hidden <iframe> and printed from there,
// so only the docket lands on the paper (never the screen behind it) and it
// prints silently under Chrome --kiosk-printing with no popup blocker in the
// way (same pattern as the kitchen ticket / product label).
//
// Two documents share one builder, chosen by `kind`:
//   • 'bill'    — the pre-payment proforma fired from the "Bill" popup on the
//                 order screen: a "BILL" heading, Table No / Date / Ref meta,
//                 no Cash Received section.
//   • 'invoice' — the paid docket fired from the receipt screen: a bilingual
//                 "វិក្កយបត្រ / INVOICE" heading, Table No / Invoice No / Date
//                 meta, and a "ប្រាក់ទទួល / Cash Received" section listing the
//                 real tender(s) and any change.
//
// Both share the five-column line table (Description · Qty · Price · Disc ·
// Total), Subtotal, Discount and the dual-currency Grand Total in dollars and
// riel.

import type { PosTable } from './TableFloorPage'

// Readable section names for the invoice's "Table No" line, e.g. "Eat In/E2".
const SECTION_NAME: Record<PosTable['section'], string> = {
  'dine-in': 'Eat In',
  vip: 'VIP',
  takeaway: 'Take Away',
}

export function billTableLabel(table: PosTable): string {
  return `${SECTION_NAME[table.section]}/${table.label}`
}

export type BillLine = {
  name: string
  price: number
  qty: number
  /** Per-line discount as a percentage (0–100). */
  discount?: number
}

/** One tender shown in the Cash Received section. `amount` is always in USD;
 *  `inKhr` marks riel cash so it prints in the currency the guest handed over. */
export type BillTender = {
  /** Method label, e.g. "ABA", "Cash USD". */
  label: string
  amount: number
  inKhr?: boolean
}

/** Payment detail for the Cash Received section. Omitted on the pre-payment
 *  proforma bill (nothing has been tendered yet). */
export type BillPayment = {
  tenders: BillTender[]
  /** Change returned to the customer, in USD (0 when settled exactly). */
  change?: number
}

export type BillParams = {
  /** Which document to render:
   *  - 'bill'    — pre-payment proforma: "BILL" heading, a "លេខយោង/Ref" row,
   *                no Cash Received section.
   *  - 'invoice' — paid document: "វិក្កយបត្រ/INVOICE" heading, a
   *                "លេខវិក្កយបត្រ/Invoice No" row, and the Cash Received section. */
  kind: 'bill' | 'invoice'
  /** Section + table, e.g. "Eat In/E2". Shown against "Table No". */
  tableLabel: string
  /** Order number — printed as the Ref (bill) or Invoice No (invoice). */
  orderRef: string
  lines: BillLine[]
  /** Riel per US dollar — drives the Grand Total (R) line. */
  khrRate: number
  /** Present once the bill is paid — renders the Cash Received section
   *  (only used when kind is 'invoice'). */
  payment?: BillPayment
}

const money = (n: number) => `$ ${n.toFixed(2)}`

// Whole quantities print bare ("1"); fractional ones keep two decimals.
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

// Riel with thousands separators and two decimals, e.g. "213,200.00 R".
const riel = (dollars: number, rate: number) =>
  `${Math.round(dollars * rate).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} R`

// DD-MM-YYYY hh:mm AM/PM — matches the reference invoice.
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let hours = d.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(hours)}:${pad(
    d.getMinutes(),
  )} ${ampm}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function metaRow(khmer: string, english: string, value: string): string {
  return `<div class="meta">
    <span class="meta-label">${khmer}/${english}:</span>
    <span class="meta-value">${escapeHtml(value)}</span>
  </div>`
}

export function buildBillHtml(params: BillParams): string {
  const lines = params.lines.filter((l) => l.qty > 0)

  // Line "Total" is the gross (qty × price); the per-line discount is shown in
  // its own column and folded into the Discount row below, so the invoice
  // reconciles: Subtotal − Discount = Grand Total.
  const grossSubtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0)
  const netTotal = lines.reduce(
    (sum, l) => sum + l.qty * l.price * (1 - (l.discount ?? 0) / 100),
    0,
  )
  const discountTotal = grossSubtotal - netTotal

  const rows = lines
    .map(
      (l) => `<tr>
        <td class="c-desc">${escapeHtml(l.name)}</td>
        <td class="c-qty">${qtyText(l.qty)}</td>
        <td class="c-price">${money(l.price)}</td>
        <td class="c-disc">${l.discount ?? 0}%</td>
        <td class="c-total">${money(l.qty * l.price)}</td>
      </tr>`,
    )
    .join('')

  const isInvoice = params.kind === 'invoice'
  const now = formatDateTime(new Date())

  // The heading and the ID row differ by document: a proforma "BILL" carries a
  // "Ref" (Table No · Date · Ref); a paid "INVOICE" carries an "Invoice No"
  // (Table No · Invoice No · Date) and gets the bilingual heading.
  const titleHtml = isInvoice
    ? `<div class="title"><div class="title-km">វិក្កយបត្រ</div><div class="title-en">INVOICE</div></div>`
    : `<div class="title"><div class="title-en">BILL</div></div>`
  const metaHtml = isInvoice
    ? metaRow('លេខតុ', 'Table No', params.tableLabel) +
      metaRow('លេខវិក្កយបត្រ', 'Invoice No', params.orderRef) +
      metaRow('កាលបរិច្ឆេទ', 'Date', now)
    : metaRow('លេខតុ', 'Table No', params.tableLabel) +
      metaRow('កាលបរិច្ឆេទ', 'Date', now) +
      metaRow('លេខយោង', 'Ref', params.orderRef)

  // Cash Received — one row per tender (riel cash in ៛, everything else in $),
  // then any change. Only on the paid invoice (the proforma bill has no tender).
  const pay = isInvoice ? params.payment : undefined
  const tenderBlock =
    pay && pay.tenders.length
      ? `<div class="tender">
    <div class="tender-head">ប្រាក់ទទួល/Cash Received:</div>
    ${pay.tenders
      .map(
        (t) =>
          `<div class="row"><span>${escapeHtml(t.label)}</span><span>${
            t.inKhr ? riel(t.amount, params.khrRate) : money(t.amount)
          }</span></div>`,
      )
      .join('')}
    ${
      pay.change && pay.change > 0.005
        ? `<div class="row"><span>Change</span><span>${money(pay.change)}</span></div>`
        : ''
    }
  </div>`
      : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    padding: 4mm 4mm 7mm;
    font-family: Arial, "Leelawadee UI", "Khmer OS System", "Noto Sans Khmer", sans-serif;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .title { text-align: center; margin-bottom: 10px; }
  .title-km { font-size: 18px; font-weight: 700; line-height: 1.25; }
  .title-en { font-size: 22px; font-weight: 800; letter-spacing: 3px; }

  .meta { display: flex; gap: 6px; margin-bottom: 2px; }
  .meta-label { white-space: nowrap; }
  .meta-value { font-weight: 700; word-break: break-word; }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: fixed; }
  th, td { vertical-align: top; padding: 4px 2px; word-break: break-word; }
  thead th {
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    font-weight: 700;
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
  }
  thead .en { font-weight: 700; }
  tbody td { border-bottom: 1px solid #000; }

  .c-desc  { width: 31%; text-align: left; }
  .c-qty   { width: 13%; text-align: center; }
  .c-price { width: 19%; text-align: right; }
  .c-disc  { width: 13%; text-align: center; }
  .c-total { width: 24%; text-align: right; }
  th.c-desc { text-align: left; }
  th.c-qty { text-align: center; }
  th.c-price { text-align: right; }
  th.c-disc { text-align: center; }
  th.c-total { text-align: right; }

  .totals { margin-top: 8px; }
  .totals .row { display: flex; justify-content: flex-end; gap: 12px; }
  .totals .row .lbl { text-align: right; }
  .totals .row .val { min-width: 22mm; text-align: right; }

  .grand { margin-top: 8px; }
  .grand .row {
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 800;
  }
  .grand .row + .row { margin-top: 2px; }

  .tender { margin-top: 8px; }
  .tender-head { margin-bottom: 2px; }
  .tender .row { display: flex; justify-content: space-between; }
  .tender .row + .row { margin-top: 2px; }

  .divider { border-top: 1px dashed #000; margin: 10px 0 8px; }
  .thanks { text-align: center; line-height: 1.4; }
</style>
</head>
<body>
  ${titleHtml}

  ${metaHtml}

  <table>
    <colgroup>
      <col class="c-desc" /><col class="c-qty" /><col class="c-price" />
      <col class="c-disc" /><col class="c-total" />
    </colgroup>
    <thead>
      <tr>
        <th class="c-desc">បរិយាយ<br /><span class="en">Description</span></th>
        <th class="c-qty">ចំនួន<br /><span class="en">Qty</span></th>
        <th class="c-price">តម្លៃ<br /><span class="en">Price</span></th>
        <th class="c-disc">បញ្ចុះ<br /><span class="en">Disc</span></th>
        <th class="c-total">សរុប<br /><span class="en">Total</span></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span class="lbl">សរុប/Subtotal:</span><span class="val">${money(
      grossSubtotal,
    )}</span></div>
    <div class="row"><span class="lbl">បញ្ចុះតម្លៃ/Discount:</span><span class="val">${money(
      discountTotal,
    )}</span></div>
  </div>

  <div class="grand">
    <div class="row"><span>Grand Total ($):</span><span>${money(netTotal)}</span></div>
    <div class="row"><span>Grand Total (R):</span><span>${riel(netTotal, params.khrRate)}</span></div>
  </div>

  ${tenderBlock}

  <div class="divider"></div>

  <div class="thanks">
    <div>សូមអរគុណ! សូមមកម្ដងទៀត!</div>
    <div>Thank You! Please Come Again.</div>
  </div>
</body>
</html>`
}

/** Render the invoice into an off-screen iframe and print it silently. */
export function printBillDocket(params: BillParams): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(buildBillHtml(params))
  doc.close()

  const run = () => {
    win.focus()
    win.print()
    // Keep the iframe alive briefly so the spooler captures the job.
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  if (doc.readyState === 'complete') run()
  else win.addEventListener('load', run, { once: true })
}
