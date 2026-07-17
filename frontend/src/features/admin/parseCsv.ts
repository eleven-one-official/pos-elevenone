// Minimal CSV parser — handles quoted fields with commas/escaped quotes.
// Shared by the admin screens' Favorites > Import records flows.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else inQuotes = false
        } else cur += ch
      } else if (ch === '"') inQuotes = true
      else if (ch === ',') {
        fields.push(cur)
        cur = ''
      } else cur += ch
    }
    fields.push(cur)
    rows.push(fields.map((f) => f.trim()))
  }
  return rows
}
