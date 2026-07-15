// Money formatter for the admin screens — always 2dp with thousands separators
// (e.g. "$1,234.50"). Accepts the string decimals the API returns as well as
// plain numbers, and never throws on a bad value.
export const usd = (value: number | string): string => {
  const n = typeof value === 'string' ? Number(value) : value
  return (
    '$' +
    (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}
