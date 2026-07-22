// Shared "Export" pipeline for the admin reports — every Export button hands
// its on-screen rows to downloadTablePdf() and gets a real .pdf file back.
// jsPDF is pulled in with a dynamic import so the ~350 kB of PDF machinery
// stays out of the admin bundle until someone actually taps Export.
//
// The page follows the Sales Details report layout: a running header on every
// page (printed-at · company · page n / total), a centred title with the
// period under it, then a left-aligned section heading over a plain ruled
// table — no fills, no zebra, hairline row separators.
//
// Note: the built-in Helvetica font is Latin-only. Product/customer names are
// Latin today; if Khmer names ever land in a report, a shaped Khmer font has
// to be embedded here (jsPDF does no complex-script shaping on its own).

export const PDF_COMPANY = 'ElevenOne TTP'

export type PdfColumn = {
  header: string
  /** Numeric columns read better flushed right. */
  align?: 'left' | 'right'
}

export type PdfTableOptions = {
  /** File name offered to the browser — ".pdf" is appended if missing. */
  fileName: string
  /** Centred report name, e.g. "Sales Details". */
  title: string
  /** Centred line under the title — the period or date range. */
  subtitle?: string
  /** Left-aligned heading over the table, e.g. "Products". */
  sectionTitle?: string
  columns: PdfColumn[]
  rows: (string | number | null | undefined)[][]
  /** Prepend the "No" counter column. Defaults to true. */
  numbered?: boolean
  /** Wide tables (many columns) print far better on their side. */
  landscape?: boolean
}

const INK = 26 // #1a1a1a — body text
const RULE = 221 // #dddddd — hairline row separators
const MUTED = 110 // running-header grey

const cell = (v: string | number | null | undefined) =>
  v === null || v === undefined ? '' : String(v)

/** Render rows as a paginated, titled PDF table and download it. */
export async function downloadTablePdf(opts: PdfTableOptions): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({
    orientation: opts.landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  const pageWidth = doc.internal.pageSize.getWidth()
  const numbered = opts.numbered !== false

  const columns = numbered ? [{ header: 'No', align: 'right' as const }, ...opts.columns] : opts.columns
  const body = opts.rows.map((r, i) => {
    const cells = r.map(cell)
    return numbered ? [String(i + 1), ...cells] : cells
  })

  // --- Title block (first page only) ----------------------------------------
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.text(opts.title, pageWidth / 2, 34, { align: 'center' })

  let y = 42
  if (opts.subtitle) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(opts.subtitle, pageWidth / 2, y, { align: 'center' })
    y += 10
  }
  if (opts.sectionTitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(14)
    doc.text(opts.sectionTitle, 14, y)
    y += 4
  }

  // --- Table ----------------------------------------------------------------
  const columnStyles: Record<number, { halign: 'right'; cellWidth?: number }> = {}
  columns.forEach((c, i) => {
    if (c.align === 'right') columnStyles[i] = { halign: 'right' }
  })
  if (numbered) columnStyles[0] = { halign: 'right', cellWidth: 10 }

  autoTable(doc, {
    head: [columns.map((c) => c.header)],
    body: body.length > 0 ? body : [[{ content: 'No rows.', colSpan: columns.length }]],
    startY: y,
    // Continuation pages clear the running header, not the title block.
    margin: { top: 22, left: 14, right: 14, bottom: 16 },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      textColor: INK,
      lineColor: RULE,
      lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
      overflow: 'linebreak',
    },
    headStyles: {
      fontStyle: 'bold',
      lineColor: RULE,
      lineWidth: { top: 0.2, right: 0, bottom: 0.2, left: 0 },
    },
    columnStyles,
  })

  // --- Running header, once the page total is known -------------------------
  const printedAt = new Date().toLocaleString('sv-SE').slice(0, 16) // 2026-07-21 09:26
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(MUTED)
    doc.text(printedAt, 14, 12)
    doc.text(PDF_COMPANY, pageWidth / 2, 12, { align: 'center' })
    doc.text(`${p} / ${pages}`, pageWidth - 14, 12, { align: 'right' })
  }

  doc.save(opts.fileName.endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`)
}

// --- Multi-section report --------------------------------------------------

export type PdfSection = {
  /** Left-aligned heading over this table, e.g. "Products". */
  sectionTitle?: string
  columns: PdfColumn[]
  rows: (string | number | null | undefined)[][]
  /** Prepend the "No" counter column. Defaults to true. */
  numbered?: boolean
}

export type PdfReportOptions = {
  fileName: string
  title: string
  subtitle?: string
  sections: PdfSection[]
  landscape?: boolean
}

/**
 * Like downloadTablePdf, but stacks several titled tables in one document —
 * e.g. Sales Details' Products + Payments + Summary — sharing the same title
 * block, running header and plain-ruled table style.
 */
export async function downloadReportPdf(opts: PdfReportOptions): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({
    orientation: opts.landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  const pageWidth = doc.internal.pageSize.getWidth()

  // --- Title block ----------------------------------------------------------
  doc.setTextColor(INK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(20)
  doc.text(opts.title, pageWidth / 2, 34, { align: 'center' })

  let y = 42
  if (opts.subtitle) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(opts.subtitle, pageWidth / 2, y, { align: 'center' })
    y += 10
  }

  // --- Sections -------------------------------------------------------------
  for (const section of opts.sections) {
    const numbered = section.numbered !== false
    const columns = numbered
      ? [{ header: 'No', align: 'right' as const }, ...section.columns]
      : section.columns
    const body = section.rows.map((r, i) => {
      const cells = r.map(cell)
      return numbered ? [String(i + 1), ...cells] : cells
    })

    if (section.sectionTitle) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(14)
      doc.setTextColor(INK)
      doc.text(section.sectionTitle, 14, y)
      y += 4
    }

    const columnStyles: Record<number, { halign: 'right'; cellWidth?: number }> = {}
    columns.forEach((c, i) => {
      if (c.align === 'right') columnStyles[i] = { halign: 'right' }
    })
    if (numbered) columnStyles[0] = { halign: 'right', cellWidth: 10 }

    autoTable(doc, {
      head: [columns.map((c) => c.header)],
      body: body.length > 0 ? body : [[{ content: 'No rows.', colSpan: columns.length }]],
      startY: y,
      margin: { top: 22, left: 14, right: 14, bottom: 16 },
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
        textColor: INK,
        lineColor: RULE,
        lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
        overflow: 'linebreak',
      },
      headStyles: {
        fontStyle: 'bold',
        lineColor: RULE,
        lineWidth: { top: 0.2, right: 0, bottom: 0.2, left: 0 },
      },
      columnStyles,
    })

    // Continue below the table just drawn.
    const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
    y = (lastY ?? y) + 10
  }

  // --- Running header, once the page total is known -------------------------
  const printedAt = new Date().toLocaleString('sv-SE').slice(0, 16)
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(MUTED)
    doc.text(printedAt, 14, 12)
    doc.text(PDF_COMPANY, pageWidth / 2, 12, { align: 'center' })
    doc.text(`${p} / ${pages}`, pageWidth - 14, 12, { align: 'right' })
  }

  doc.save(opts.fileName.endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`)
}
