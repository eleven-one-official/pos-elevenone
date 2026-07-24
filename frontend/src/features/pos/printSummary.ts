// Daily "Summary Report" printing — the end-of-day docket the cashier fires from
// the floor screen header. Like the bill/receipt it is an 80mm thermal docket
// rendered into a hidden <iframe> and printed from there, so it prints silently
// under Chrome --kiosk-printing with nothing but the docket on the paper.
//
// It reproduces the layout the venue is used to from its old till:
//   • store name + "Summary Report" + the print timestamp;
//   • sales by floor section (Eat In / VIP / Take Away), gross;
//   • Income Channel — payments grouped Bank (card / ABA / KHQR) vs Cash, each
//     journal on its own line with a per-group Total;
//   • a totals footer: Guests, Total Receipt, Grand Total, Discount, Total Paid.
// The numbers come from /reports/summary (completed orders on the day). All
// amounts are in USD, the stored currency.

import type { DailySummary, SummaryChannel } from '../../services/api/reports'

export type SummaryParams = {
  /** Store name printed at the top of the docket. */
  storeName: string
}

const money = (n: number) => `$ ${n.toFixed(2)}`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// M/D/YYYY, h:mm:ss AM/PM — the timestamp the old report printed.
function formatPrintedAt(d: Date): string {
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/** A left-label / right-amount line. */
function line(label: string, value: string, cls = ''): string {
  return `<div class="row ${cls}"><span class="lbl">${label}</span><span class="val">${value}</span></div>`
}

/** One Bank/Cash block: a bold group heading, its journals, then a Total. */
function channelBlock(group: 'Bank' | 'Cash', channels: SummaryChannel[]): string {
  const rows = channels.filter((c) => c.group === group)
  if (rows.length === 0) return ''
  const total = rows.reduce((sum, c) => sum + c.amount, 0)
  return `
  <div class="group">${escapeHtml(group)}</div>
  ${rows.map((c) => line(escapeHtml(c.label), money(c.amount))).join('')}
  <div class="rule"></div>
  ${line('Total ($):', money(total), 'strong')}`
}

export function buildSummaryHtml(params: SummaryParams, data: DailySummary): string {
  const sectionRows = data.sections.length
    ? data.sections.map((s) => line(escapeHtml(s.label), money(s.total))).join('')
    : line('No sales today', money(0), 'muted')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Summary Report</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    padding: 4mm 4mm 7mm;
    font-family: Arial, "Leelawadee UI", "Khmer OS System", "Noto Sans Khmer", sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .head { text-align: center; margin-bottom: 12px; }
  .store { font-size: 18px; font-weight: 800; }
  .report { font-size: 15px; font-weight: 700; margin-top: 6px; }
  .when { font-size: 12px; margin-top: 6px; }

  .rule { border-top: 1px solid #000; margin: 8px 0; }

  .row { display: flex; justify-content: space-between; gap: 12px; }
  .row + .row { margin-top: 3px; }
  .row .lbl { word-break: break-word; }
  .row .val { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .row.strong { font-weight: 800; }
  .row.muted { color: #555; }

  .group { font-weight: 800; margin-top: 10px; margin-bottom: 3px; }
  .channels-head { font-weight: 800; font-size: 15px; margin-top: 4px; }

  .dashed { border-top: 1px dashed #000; margin: 12px 0; }

  .totals .row { font-weight: 700; }
</style>
</head>
<body>
  <div class="head">
    <div class="store">${escapeHtml(params.storeName)}</div>
    <div class="report">Summary Report</div>
    <div class="when">${escapeHtml(formatPrintedAt(new Date()))}</div>
  </div>

  <div class="rule"></div>

  ${sectionRows}

  <div class="rule"></div>

  <div class="channels-head">Income Channel</div>
  ${channelBlock('Bank', data.channels)}
  ${channelBlock('Cash', data.channels)}

  <div class="dashed"></div>

  <div class="totals">
    ${line('Guests:', String(data.guests))}
    ${line('Total Receipt:', String(data.orders_count))}
    ${line('Grand Total:', money(data.grand_total))}
    ${line('Discount:', money(data.discount))}
    ${line('Total Paid:', money(data.total_paid))}
  </div>
</body>
</html>`
}

/** Render the summary into an off-screen iframe and print it silently. */
export function printSummary(params: SummaryParams, data: DailySummary): void {
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
  doc.write(buildSummaryHtml(params, data))
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
