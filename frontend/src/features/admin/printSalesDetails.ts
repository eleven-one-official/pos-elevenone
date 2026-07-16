// Sales Details report printing — fired from the Sales Details dialog's Print
// button. Follows the kitchen-ticket pattern: the report is written into a
// hidden <iframe> and printed from there (works with Chrome --kiosk-printing,
// no popup blockers). Data below is placeholder until the backend exposes the
// real session sales summary; the venue charges no tax, so the report shows
// products, payments and totals only.

export type SalesDetailsParams = {
  startDate: string
  endDate: string
  reportType: string
  configs: { pos: string; company: string }[]
}

type ReportLine = { name: string; qty: number; amount: number }

const PLACEHOLDER_LINES: ReportLine[] = [
  { name: 'Brown rice', qty: 12, amount: 12.0 },
  { name: 'Steamed Rice', qty: 20, amount: 10.0 },
  { name: 'Americano hot', qty: 8, amount: 20.0 },
  { name: 'Angkor Beer (bottle)', qty: 15, amount: 26.25 },
  { name: 'Avocado shake', qty: 6, amount: 21.0 },
  { name: 'French fries-b', qty: 7, amount: 21.0 },
  { name: 'Garlic bread', qty: 4, amount: 10.0 },
  { name: 'Bbq chicken panini', qty: 5, amount: 31.25 },
  { name: 'Beef BBQ Rice', qty: 9, amount: 51.75 },
  { name: '4 cheese pizza', qty: 3, amount: 33.0 },
]

const PLACEHOLDER_PAYMENTS: { method: string; amount: number }[] = [
  { method: 'Cash', amount: 120.0 },
  { method: 'ABA KHQR', amount: 116.25 },
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const money = (v: number) => `$ ${v.toFixed(2)}`

export function buildSalesDetailsHtml(params: SalesDetailsParams): string {
  const total = PLACEHOLDER_LINES.reduce((sum, l) => sum + l.amount, 0)
  const paid = PLACEHOLDER_PAYMENTS.reduce((sum, p) => sum + p.amount, 0)
  const company = params.configs[0]?.company ?? ''
  const printedAt = new Date().toLocaleString('en-GB')

  const productRows = PLACEHOLDER_LINES.map(
    (l) => `
      <tr>
        <td>${escapeHtml(l.name)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${money(l.amount)}</td>
      </tr>`,
  ).join('')

  const paymentRows = PLACEHOLDER_PAYMENTS.map(
    (p) => `
      <tr>
        <td>${escapeHtml(p.method)}</td>
        <td class="num">${money(p.amount)}</td>
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
  tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: none; }
  .total-line {
    margin-top: 18px;
    text-align: right;
    font-size: 17px;
    font-weight: 700;
  }
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
  </div>

  <h2>Products</h2>
  <table>
    <thead>
      <tr><th>Product</th><th class="num">Quantity</th><th class="num">Subtotal</th></tr>
    </thead>
    <tbody>${productRows}</tbody>
    <tfoot>
      <tr><td>Total</td><td></td><td class="num">${money(total)}</td></tr>
    </tfoot>
  </table>

  <h2>Payments</h2>
  <table>
    <thead>
      <tr><th>Payment Method</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${paymentRows}</tbody>
    <tfoot>
      <tr><td>Total Paid</td><td class="num">${money(paid)}</td></tr>
    </tfoot>
  </table>

  <div class="total-line">Total: ${money(total)}</div>

  <div class="foot">Printed ${printedAt} &mdash; placeholder data until the report is wired to the backend.</div>
</body>
</html>`
}

/** Render the report into an off-screen iframe and print it silently. */
export function printSalesDetails(params: SalesDetailsParams): void {
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
  doc.write(buildSalesDetailsHtml(params))
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
