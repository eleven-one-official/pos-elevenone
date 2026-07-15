import StaffLoginDialog from '../auth/StaffLoginDialog'

export type Waiter = {
  id: string
  name: string
  role?: string
}

/** Waiter tap-a-name + PIN login — roster and PIN check live on the backend. */
export default function WaiterLoginDialog({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void
  onLoggedIn?: (waiter: Waiter) => void
}) {
  return (
    <StaffLoginDialog role="waiter" heading="Waiter Login" onClose={onClose} onLoggedIn={onLoggedIn} />
  )
}
