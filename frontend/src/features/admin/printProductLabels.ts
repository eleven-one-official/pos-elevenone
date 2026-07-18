// Product label printing — fired from the "Choose Labels Layout" wizard.
// Follows the kitchen-ticket pattern: the label sheet is written into a
// hidden <iframe> and printed from there (works with Chrome --kiosk-printing,
// no popup blockers). Sheet formats lay labels out in a grid on A4; Dymo/ZPL
// formats print one label per row for roll printers.

export type LabelProduct = {
  name: string
  /** Display price, e.g. "$ 6.50". */
  price: string
  barcode: string | null
}

export type LabelParams = {
  product: LabelProduct
  quantity: number
  format: string
  /** Extra Content — a free line printed under the name (e.g. a variant). */
  extra: string
}

/** Columns per sheet format; roll formats (Dymo/ZPL) print one per row. */
const FORMAT_COLUMNS: Record<string, number> = {
  'Dymo': 1,
  '2 x 7 with price': 2,
  '4 x 7 with price': 4,
  '4 x 12': 4,
  '4 x 12 with price': 4,
  'ZPL Labels': 1,
  'ZPL Labels with price': 1,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildLabelsHtml(params: LabelParams): string {
  const columns = FORMAT_COLUMNS[params.format] ?? 2
  const withPrice = params.format.includes('price') || params.format === 'Dymo'
  const { product } = params

  const label = `
    <div class="label">
      <div class="name">${escapeHtml(product.name)}</div>
      ${params.extra.trim() ? `<div class="extra">${escapeHtml(params.extra.trim())}</div>` : ''}
      ${product.barcode ? `<div class="barcode">${escapeHtml(product.barcode)}</div>` : ''}
      ${withPrice ? `<div class="price">${escapeHtml(product.price)}</div>` : ''}
    </div>`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Product Labels</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, "Noto Sans Khmer", sans-serif;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    display: grid;
    grid-template-columns: repeat(${columns}, 1fr);
    gap: 4mm;
  }
  .label {
    border: 1px dashed #999;
    border-radius: 2px;
    padding: 4mm;
    text-align: center;
    break-inside: avoid;
  }
  .name { font-size: 13px; font-weight: 700; line-height: 1.3; }
  .extra { margin-top: 1mm; font-size: 11px; color: #444; }
  .barcode {
    margin-top: 1.5mm;
    font-family: "Libre Barcode 39", monospace;
    font-size: 11px;
    letter-spacing: 2px;
    color: #333;
  }
  .price { margin-top: 1.5mm; font-size: 15px; font-weight: 700; }
</style>
</head>
<body>
  <div class="sheet">${label.repeat(Math.max(1, params.quantity))}</div>
</body>
</html>`
}

/** Render the labels into an off-screen iframe and print them silently. */
export function printProductLabels(params: LabelParams): void {
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
  doc.write(buildLabelsHtml(params))
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
