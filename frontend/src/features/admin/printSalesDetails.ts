// Sales Details report printing — fired from the Sales Details dialog's Print
// button. Follows the kitchen-ticket pattern: the report is written into a
// hidden <iframe> and printed from there (works with Chrome --kiosk-printing,
// no popup blockers). The dialog fetches the real summary from
// /reports/sales-details and hands it over. Payments are broken out by journal
// (Cash USD, ABA PAY, Grab Merchant, …) so it's clear which tender took the
// money; the venue charges no tax, so the Taxes block is a single "No Taxes"
// line and the footer prints the guest count and tax-excluded total.

import type { SalesDetailsData } from '../../services/api/reports'

export type SalesReportType = 'Product' | 'Category' | 'Both'

export type SalesDetailsParams = {
  /** Display labels for the report header (already formatted). */
  startDate: string
  endDate: string
  reportType: SalesReportType
  configs: { pos: string; company: string }[]
}

// Payment channels print with their journal labels; unknown methods print raw.
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  aba_qr: 'ABA QR',
  khqr: 'KHQR',
  card: 'Card',
}

/** Roll the product lines up into category totals, alphabetical order. */
function categoryTotals(
  products: SalesDetailsData['products'],
): { name: string; qty: number; amount: number }[] {
  const totals = new Map<string, { qty: number; amount: number }>()
  for (const line of products) {
    const t = totals.get(line.category) ?? { qty: 0, amount: 0 }
    t.qty += line.quantity
    t.amount += line.amount
    totals.set(line.category, t)
  }
  return [...totals]
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const money = (v: number) =>
  `$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function buildSalesDetailsHtml(params: SalesDetailsParams, data: SalesDetailsData): string {
  const paid = data.payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const company = params.configs[0]?.company ?? ''
  const printedAt = new Date().toLocaleString('en-GB')

  const productRows = data.products.map(
    (l) => `
      <tr>
        <td>${escapeHtml(l.name)}</td>
        <td class="num">x${l.quantity}</td>
        <td class="num">${money(l.price)}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`,
  ).join('')

  const categoryRows = categoryTotals(data.products)
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td class="num">x${c.qty}</td>
        <td class="num">${money(c.amount)}</td>
      </tr>`,
    )
    .join('')

  const emptyRow = (cols: number) =>
    `<tr><td colspan="${cols}" class="empty">No sales in this period.</td></tr>`

  const productsSection = `
  <h2>Products</h2>
  <table>
    <thead>
      <tr><th>Product</th><th class="num">Quantity</th><th class="num">Price Unit</th><th class="num">Subtotal</th></tr>
    </thead>
    <tbody>${productRows || emptyRow(4)}</tbody>
    <tfoot>
      <tr><td>Total</td><td></td><td></td><td class="num">${money(data.total)}</td></tr>
    </tfoot>
  </table>`

  const categoriesSection = `
  <h2>Categories</h2>
  <table>
    <thead>
      <tr><th>Category</th><th class="num">Quantity</th><th class="num">Subtotal</th></tr>
    </thead>
    <tbody>${categoryRows || emptyRow(3)}</tbody>
    <tfoot>
      <tr><td>Total</td><td></td><td class="num">${money(data.total)}</td></tr>
    </tfoot>
  </table>`

  const paymentRows = data.payments.map(
    (p) => `
      <tr>
        <td>${escapeHtml(METHOD_LABELS[p.label] ?? p.label)}</td>
        <td class="num">${money(Number(p.amount))}</td>
      </tr>`,
  ).join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Sales Details</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, "Noto Sans Khmer", sans-serif;
    color: #1a1a1a;
    font-size: 13px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  h1 { font-size: 24px; font-weight: 700; }
  .company { font-size: 15px; font-weight: 700; text-align: right; }
  .meta { margin-top: 10px; line-height: 1.7; color: #333; }
  .meta b { color: #111; }
  h2 {
    font-size: 15px;
    margin: 22px 0 6px;
    padding-bottom: 4px;
    border-bottom: 2px solid #1a1a1a;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #ddd; text-align: left; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: #555; }
  .num { text-align: right; white-space: nowrap; }
  .empty { color: #888; font-style: italic; }
  tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: none; }
  .summary { margin-top: 22px; line-height: 1.9; font-size: 14px; }
  .summary b { font-weight: 700; color: #111; }
  .foot { margin-top: 26px; font-size: 11px; color: #777; }
</style>
</head>
<body>
  <div class="head">
    <h1>Sales Details</h1>
    <div class="company">${escapeHtml(company)}</div>
  </div>

  <div class="meta">
    <div><b>Period:</b> ${escapeHtml(params.startDate)} &rarr; ${escapeHtml(params.endDate)}</div>
    <div><b>Point of Sale:</b> ${escapeHtml(params.configs.map((c) => c.pos).join(', '))}</div>
    <div><b>Report Type:</b> ${escapeHtml(params.reportType)}</div>
    <div><b>Completed Orders:</b> ${data.orders_count}</div>
  </div>

  ${params.reportType !== 'Category' ? productsSection : ''}
  ${params.reportType !== 'Product' ? categoriesSection : ''}

  <h2>Payments</h2>
  <table>
    <thead>
      <tr><th>Name</th><th class="num">Total</th></tr>
    </thead>
    <tbody>${paymentRows || emptyRow(2)}</tbody>
    <tfoot>
      <tr><td class="num">Total:</td><td class="num">${money(paid)}</td></tr>
    </tfoot>
  </table>

  <h2>Taxes</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Tax Amount</th><th>Base Amount</th><th>Total</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>No Taxes</td>
        <td>${money(0)}</td>
        <td>${money(data.total)}</td>
        <td>${money(0)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    <div><b>Guests:</b> ${data.guests}</div>
    <div><b>(Total Tax excluded: ${money(data.total)})</b></div>
  </div>

  <div class="foot">Printed ${printedAt}</div>
</body>
</html>`
}

/** Render the report into an off-screen iframe and print it silently. */
export function printSalesDetails(params: SalesDetailsParams, data: SalesDetailsData): void {
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
  doc.write(buildSalesDetailsHtml(params, data))
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
