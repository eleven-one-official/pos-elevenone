import StaffLoginDialog from './StaffLoginDialog'

export type Cashier = {
  id: string
  name: string
  /** Role display name (can be renamed by an admin) — for the UI only. */
  role?: string
  /** Role slug — stable, and what the backend authorizes by. Route on this. */
  slug?: string
}

/** Cashier tap-a-name + PIN login — roster and PIN check live on the backend. */
export default function CashierLoginDialog({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void
  onLoggedIn?: (cashier: Cashier) => void
}) {
  return (
    <StaffLoginDialog role="cashier" heading="Cashier Login" onClose={onClose} onLoggedIn={onLoggedIn} />
  )
}
