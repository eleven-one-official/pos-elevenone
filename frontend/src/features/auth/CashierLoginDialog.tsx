import StaffLoginDialog from './StaffLoginDialog'

export type Cashier = {
  id: string
  name: string
  role?: string
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
