import StaffLoginDialog from '../auth/StaffLoginDialog'

export type Kitchen = {
  id: string
  name: string
  role?: string
}

/** Kitchen tap-in login — one shared PIN-less "Kitchen" account, like the
 *  waiter tablet. Roster + auth live on the backend (role=kitchen). */
export default function KitchenLoginDialog({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void
  onLoggedIn?: (kitchen: Kitchen) => void
}) {
  return (
    <StaffLoginDialog role="kitchen" heading="Kitchen Login" onClose={onClose} onLoggedIn={onLoggedIn} />
  )
}
