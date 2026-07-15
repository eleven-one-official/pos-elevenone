// Kitchen / bar ticket printing.
//
// Stations print on separate printers: drinks go to the bar printer, food and
// desserts go to the kitchen printer. When an order mixes both, we fire one
// docket per station — each is its own print job so it can target a different
// physical printer. A docket lists items + cooking notes only; prices and
// totals are omitted (the cook only needs to know *what* to make).
//
// Each docket is written into a hidden <iframe> and printed from there, so only
// the ticket reaches the printer — never the POS screen behind it. This avoids
// popup blockers (unlike window.open) and needs no global print CSS.

export type PrinterStation = 'kitchen' | 'drink'

const STATION_META: Record<PrinterStation, { title: string; subtitle: string; label: string }> = {
  kitchen: { title: 'KITCHEN', subtitle: 'Food Order', label: 'Kitchen' },
  drink: { title: 'DRINKS', subtitle: 'Bar Order', label: 'Drinks' },
}

// Order stations are printed in this order when an order spans both.
const STATION_ORDER: PrinterStation[] = ['kitchen', 'drink']

/**
 * Which printer a menu category routes to. Drinks print at the bar; everything
 * else (food, desserts) prints in the kitchen. Adjust here if a venue adds a
 * dedicated dessert/pastry printer.
 */
export function stationForCategory(category: string): PrinterStation {
  return category === 'Drinks' ? 'drink' : 'kitchen'
}

export function stationLabel(station: PrinterStation): string {
  return STATION_META[station].label
}

export type StationTicketLine = {
  name: string
  qty: number
  /** Cooking instruction carried from the cart (e.g. "No onion", "Spicy"). */
  note?: string
  station: PrinterStation
}

export type OrderTicketMeta = {
  orderNo: string
  tableLabel: string
  /** Human label for the order type, e.g. "Dine In" or "Take Away". */
  orderType: string
  guests?: number
  /** Staff member who fired the order (cashier or waiter). Printed as "Server". */
  server: string
}

type SingleTicket = OrderTicketMeta & {
  station: PrinterStation
  lines: Array<Omit<StationTicketLine, 'station'>>
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

export function buildTicketHtml(ticket: SingleTicket): string {
  const meta = STATION_META[ticket.station]
  const totalItems = ticket.lines.reduce((sum, l) => sum + l.qty, 0)
  const printedAt = formatDateTime(new Date())

  const rows = ticket.lines
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
<title>${meta.title} Ticket ${escapeHtml(ticket.orderNo)}</title>
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
    <div class="title">${meta.title}</div>
    <div class="sub">${meta.subtitle}</div>
    <div class="table-tag">${escapeHtml(ticket.tableLabel)}</div>
  </div>

  <div class="rule"></div>

  <div class="meta">
    <div class="row"><span class="label">Order</span><span>#${escapeHtml(ticket.orderNo)}</span></div>
    <div class="row"><span class="label">Type</span><span>${escapeHtml(ticket.orderType)}</span></div>
    ${
      ticket.guests
        ? `<div class="row"><span class="label">Guests</span><span>${ticket.guests}</span></div>`
        : ''
    }
    <div class="row"><span class="label">Server</span><span>${escapeHtml(ticket.server)}</span></div>
    <div class="row"><span class="label">Time</span><span>${printedAt}</span></div>
  </div>

  <div class="rule"></div>

  ${rows || '<div class="center">No items</div>'}

  <div class="rule"></div>

  <div class="foot center">Total items: ${totalItems}</div>
</body>
</html>`
}

// Render one docket into an off-screen iframe and print it. Resolves once the
// job has been dispatched and the iframe cleaned up.
//
// With a print *dialog*, window.print() is modal and blocks until dismissed.
// But under Chrome's --kiosk-printing (silent auto-print) it returns
// immediately, so two dockets fired back-to-back would race onto the printer.
// printOrderTickets therefore awaits each docket before starting the next.
function printTicket(ticket: SingleTicket): Promise<void> {
  return new Promise((resolve) => {
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
      return resolve()
    }

    doc.open()
    doc.write(buildTicketHtml(ticket))
    doc.close()

    const run = () => {
      win.focus()
      win.print()
      // Keep the iframe alive briefly so the spooler captures the job, then
      // clean up and let the next station's docket print.
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
        resolve()
      }, 1000)
    }

    if (doc.readyState === 'complete') run()
    else win.addEventListener('load', run, { once: true })
  })
}

/**
 * Split an order by printer station and fire one docket per station that has
 * items. Refunds/voids (qty ≤ 0) never print. Returns the stations that will be
 * printed so the caller can confirm to the cashier immediately; the dockets
 * themselves print sequentially in the background (see printTicket).
 *
 * Wire to POST /orders + the backend printer service once it exists; each
 * station's job will then route to its configured physical printer silently.
 */
export function printOrderTickets(meta: OrderTicketMeta, lines: StationTicketLine[]): PrinterStation[] {
  const cook = lines.filter((l) => l.qty > 0)
  const jobs: SingleTicket[] = []

  for (const station of STATION_ORDER) {
    const stationLines = cook.filter((l) => l.station === station).map(({ station: _s, ...rest }) => rest)
    if (stationLines.length === 0) continue
    jobs.push({ ...meta, station, lines: stationLines })
  }

  // Print one docket at a time so kiosk-printing doesn't race two jobs together.
  void jobs.reduce((chain, job) => chain.then(() => printTicket(job)), Promise.resolve())

  return jobs.map((job) => job.station)
}
