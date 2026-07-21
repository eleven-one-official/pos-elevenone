// Shared "Export" pipeline for the admin reports — every Export button hands
// its on-screen rows to downloadTablePdf() and gets a real .pdf file back.
// jsPDF is pulled in with a dynamic import so the ~350 kB of PDF machinery
// stays out of the admin bundle until someone actually taps Export.
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
  title: string
  /** Second header line: row count, filters, date range… */
  subtitle?: string
  columns: PdfColumn[]
  rows: (string | number | null | undefined)[][]
  /** Wide tables (many columns) print far better on their side. */
  landscape?: boolean
}

const cell = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v))

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
  const pageHeight = doc.internal.pageSize.getHeight()
  const printedAt = new Date().toLocaleString('en-GB')

  // --- Header ---------------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(opts.title, 14, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  if (opts.subtitle) doc.text(opts.subtitle, 14, 21.5)
  doc.text(PDF_COMPANY, pageWidth - 14, 16, { align: 'right' })
  doc.text(`Printed ${printedAt}`, pageWidth - 14, 21.5, { align: 'right' })
  doc.setTextColor(0)

  // --- Table ----------------------------------------------------------------
  const columnStyles: Record<number, { halign: 'left' | 'right' }> = {}
  opts.columns.forEach((c, i) => {
    if (c.align === 'right') columnStyles[i] = { halign: 'right' }
  })

  autoTable(doc, {
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.length > 0 ? opts.rows.map((r) => r.map(cell)) : [[' — no rows — ']],
    startY: 26,
    margin: { top: 26, left: 14, right: 14, bottom: 16 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [87, 119, 154], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 247, 249] },
    columnStyles,
    // Page x of y, drawn on every page once the total is known.
    didDrawPage: () => {
      const page = doc.getCurrentPageInfo().pageNumber
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(130)
      doc.text(`Page ${page}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
      doc.setTextColor(0)
    },
  })

  doc.save(opts.fileName.endsWith('.pdf') ? opts.fileName : `${opts.fileName}.pdf`)
}
