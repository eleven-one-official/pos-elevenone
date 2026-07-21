import StaffLoginDialog from '../auth/StaffLoginDialog'

export type Bar = {
  id: string
  name: string
  role?: string
}

/** Bar tap-in login — one shared PIN-less "Bar" account, like the kitchen
 *  display. Roster + auth live on the backend (role=bar). */
export default function BarLoginDialog({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void
  onLoggedIn?: (bar: Bar) => void
}) {
  return <StaffLoginDialog role="bar" heading="Bar Login" onClose={onClose} onLoggedIn={onLoggedIn} />
}
