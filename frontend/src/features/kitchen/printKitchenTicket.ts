// Kitchen Order Ticket (KOT) printing.
//
// The kitchen has no display screen — only a receipt printer. When the cashier
// fires an order, we print a docket the chef cooks from: order number, table,
// time, and the item list with cooking notes. Prices and totals are omitted —
// the chef only needs to know *what* to cook, not the money.
//
// The ticket is written into a hidden <iframe> and printed from there, so only
// the docket reaches the printer — never the POS screen behind it. This avoids
// popup blockers (unlike window.open) and needs no global print CSS.

export type KitchenTicketLine = {
  name: string
  qty: number
  /** Cooking instruction carried from the cart (e.g. "No onion", "Spicy"). */
  note?: string
}

export type KitchenTicketData = {
  orderNo: string
  tableLabel: string
  /** Human label for the order type, e.g. "Dine In" or "Take Away". */
  orderType: string
  guests?: number
  /** Cashier who fired the order. */
  cashier: string
  lines: KitchenTicketLine[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// DD/MM/YYYY hh:mm AM/PM — matches the customer receipt.
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let hours = d.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(hours)}:${pad(
    d.getMinutes(),
  )} ${ampm}`
}

export function buildKitchenTicketHtml(data: KitchenTicketData): string {
  // Only positive-quantity lines are cooked; refunds/voids never fire.
  const cookLines = data.lines.filter((l) => l.qty > 0)
  const totalItems = cookLines.reduce((sum, l) => sum + l.qty, 0)
  const printedAt = formatDateTime(new Date())

  const rows = cookLines
    .map(
      (l) => `
        <div class="item">
          <span class="qty">${l.qty}×</span>
          <span class="name">${escapeHtml(l.name)}</span>
        </div>
        ${l.note ? `<div class="note">** ${escapeHtml(l.note)} **</div>` : ''}`,
    )
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Kitchen Ticket ${escapeHtml(data.orderNo)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    padding: 6mm 4mm;
    font-family: "Courier New", ui-monospace, monospace;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .title { font-size: 22px; font-weight: 800; letter-spacing: 2px; }
  .sub { font-size: 13px; margin-top: 2px; }
  .rule { border-top: 2px dashed #000; margin: 8px 0; }
  .meta { font-size: 14px; line-height: 1.6; }
  .meta .row { display: flex; justify-content: space-between; }
  .meta .label { font-weight: 700; }
  .table-tag {
    display: inline-block;
    border: 2px solid #000;
    border-radius: 4px;
    padding: 2px 10px;
    font-size: 20px;
    font-weight: 800;
    margin-top: 4px;
  }
  .item {
    display: flex;
    gap: 8px;
    font-size: 19px;
    font-weight: 800;
    line-height: 1.35;
    margin-top: 8px;
  }
  .item .qty { min-width: 34px; }
  .note {
    font-size: 15px;
    font-weight: 700;
    margin: 2px 0 0 42px;
    padding: 1px 0;
  }
  .foot { font-size: 13px; margin-top: 6px; }
</style>
</head>
<body>
  <div class="center">
    <div class="title">KITCHEN</div>
    <div class="sub">Order Ticket</div>
    <div class="table-tag">${escapeHtml(data.tableLabel)}</div>
  </div>

  <div class="rule"></div>

  <div class="meta">
    <div class="row"><span class="label">Order</span><span>#${escapeHtml(data.orderNo)}</span></div>
    <div class="row"><span class="label">Type</span><span>${escapeHtml(data.orderType)}</span></div>
    ${
      data.guests
        ? `<div class="row"><span class="label">Guests</span><span>${data.guests}</span></div>`
        : ''
    }
    <div class="row"><span class="label">Cashier</span><span>${escapeHtml(data.cashier)}</span></div>
    <div class="row"><span class="label">Time</span><span>${printedAt}</span></div>
  </div>

  <div class="rule"></div>

  ${rows || '<div class="center">No items to cook</div>'}

  <div class="rule"></div>

  <div class="foot center">Total items: ${totalItems}</div>
</body>
</html>`
}

// Render the ticket into an off-screen iframe and open the print dialog for it.
export function printKitchenTicket(data: KitchenTicketData): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(buildKitchenTicketHtml(data))
  doc.close()

  const win = iframe.contentWindow
  if (!win) {
    document.body.removeChild(iframe)
    return
  }

  // Give the iframe a tick to lay out before printing, then clean up after.
  const run = () => {
    win.focus()
    win.print()
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  if (doc.readyState === 'complete') run()
  else win.addEventListener('load', run, { once: true })
}
