// Shared "Export to Excel" pipeline for the admin reports — the sibling of
// exportPdf.ts. Every Excel button hands its on-screen rows to
// downloadReportExcel() and gets a real .xlsx workbook back, one worksheet per
// section. exceljs is pulled in with a dynamic import so the ~1 MB of workbook
// machinery stays out of the admin bundle until someone actually taps Export.
//
// Unlike the PDF (built-in Helvetica is Latin-only), the workbook is plain
// Unicode — Khmer dish or cook names survive the trip into Excel.

import { PDF_COMPANY } from './exportPdf'

export type ExcelColumn = {
  header: string
  /** Numeric columns read better flushed right. */
  align?: 'left' | 'right'
}

export type ExcelSheet = {
  /** Worksheet tab name — Excel allows 31 chars and no []:*?/\, enforced here. */
  name: string
  columns: ExcelColumn[]
  /** Pass numbers as numbers — they land as real Excel numerics, so the
   *  reader can sum and pivot without retyping the column. */
  rows: (string | number | null | undefined)[][]
}

export type ExcelReportOptions = {
  /** File name offered to the browser — ".xlsx" is appended if missing. */
  fileName: string
  /** Report name, printed above every sheet's table. */
  title: string
  /** Line under the title — the period or date range. */
  subtitle?: string
  sheets: ExcelSheet[]
}

/** Rows 1–3 are the title block, row 4 is blank, row 5 is the table header. */
const HEADER_ROW = 5

const sheetName = (name: string) => name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'

/** Render each section as a titled worksheet and download the workbook. */
export async function downloadReportExcel(opts: ExcelReportOptions): Promise<void> {
  const { Workbook } = await import('exceljs')

  const workbook = new Workbook()
  workbook.creator = PDF_COMPANY
  workbook.created = new Date()

  const printedAt = new Date().toLocaleString('sv-SE').slice(0, 16)

  for (const sheet of opts.sheets) {
    const ws = workbook.addWorksheet(sheetName(sheet.name), {
      views: [{ state: 'frozen', ySplit: HEADER_ROW }],
    })

    // --- Title block — the PDF's running header and title, folded into rows.
    ws.getCell(1, 1).value = opts.title
    ws.getCell(1, 1).font = { bold: true, size: 14 }
    if (opts.subtitle) {
      ws.getCell(2, 1).value = opts.subtitle
      ws.getCell(2, 1).font = { bold: true, size: 10 }
    }
    ws.getCell(3, 1).value = `${PDF_COMPANY} — printed ${printedAt}`
    ws.getCell(3, 1).font = { size: 9, color: { argb: 'FF6E6E6E' } }

    // --- Header row, bold over a hairline rule, like the PDF table head.
    sheet.columns.forEach((col, i) => {
      const cell = ws.getCell(HEADER_ROW, i + 1)
      cell.value = col.header
      cell.font = { bold: true }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } }
      if (col.align === 'right') cell.alignment = { horizontal: 'right' }
    })

    // --- Data rows.
    for (const row of sheet.rows) {
      const cells = sheet.columns.map((_, i) => {
        const v = row[i]
        return v === null || v === undefined ? '' : v
      })
      const added = ws.addRow(cells)
      sheet.columns.forEach((col, i) => {
        if (col.align === 'right') added.getCell(i + 1).alignment = { horizontal: 'right' }
      })
    }

    // --- Column widths from the content itself, clamped to stay readable.
    sheet.columns.forEach((col, i) => {
      const longest = sheet.rows.reduce(
        (max, row) => Math.max(max, String(row[i] ?? '').length),
        col.header.length,
      )
      ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 9), 60)
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = opts.fileName.endsWith('.xlsx') ? opts.fileName : `${opts.fileName}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
