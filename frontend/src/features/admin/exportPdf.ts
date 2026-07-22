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

export const PDF_COMPANY = 'Eleven One Kitchen'

export type PdfColumn = {
  header: string
  /** Numeric columns read better flushed right. */
  align?: 'left' | 'right'
  /** Fixed column width in mm — cells print evenly instead of auto-sizing to
   *  content. On stacked sections, give same-meaning columns the same width so
   *  they line up vertically. Widths + the 10mm "No" column should sum to the
   *  content width: 182mm portrait, 269mm landscape. */
  width?: number
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

/** Render rows as a paginated, titled PDF table and download it. A thin
 *  wrapper over downloadReportPdf so every Export button — single-table or
 *  multi-section — shares the exact same cell format. */
export async function downloadTablePdf(opts: PdfTableOptions): Promise<void> {
  return downloadReportPdf({
    fileName: opts.fileName,
    title: opts.title,
    subtitle: opts.subtitle,
    landscape: opts.landscape,
    sections: [
      {
        sectionTitle: opts.sectionTitle,
        columns: opts.columns,
        rows: opts.rows,
        numbered: opts.numbered,
      },
    ],
  })
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

    const columnStyles: Record<number, { halign?: 'right'; cellWidth?: number }> = {}
    columns.forEach((c, i) => {
      const style: { halign?: 'right'; cellWidth?: number } = {}
      if (c.align === 'right') style.halign = 'right'
      if (c.width != null) style.cellWidth = c.width
      if (style.halign || style.cellWidth != null) columnStyles[i] = style
    })
    if (numbered) columnStyles[0] = { halign: 'right', cellWidth: 10 }

    // A section with no header text (e.g. the Summary key/value list) skips the
    // header row entirely instead of drawing an empty ruled band.
    const showHead = section.columns.some((c) => c.header !== '')

    autoTable(doc, {
      // columnStyles only reach body cells, so each head cell carries the
      // column's alignment itself — numeric headers sit over their numbers.
      head: [columns.map((c) => ({ content: c.header, styles: { halign: c.align ?? ('left' as const) } }))],
      showHead: showHead ? 'everyPage' : 'never',
      body: body.length > 0 ? body : [[{ content: 'No rows.', colSpan: columns.length }]],
      startY: y,
      // Short sections (like the 3-line Summary) move to the next page whole
      // instead of stranding a row or two across the break.
      pageBreak: body.length <= 10 ? 'avoid' : 'auto',
      // Fixed layout so the widths above are honoured and stacked sections align.
      tableWidth: pageWidth - 28,
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
