import StationDisplayPage from '../station/StationDisplayPage'
import type { Bar } from './BarLoginDialog'

/**
 * The Bar Display Screen — the drinks half of the shared station board. Every
 * product in the "Drink" category fires here instead of to the kitchen, as its
 * own ticket under the same round number, so the bar starts pouring the moment
 * the waiter sends the order rather than when someone shouts it across the room.
 *
 * Unlike the kitchen it names nobody: Start is one tap, then Ready.
 */
export default function BarDisplayPage({
  staff,
  onLogout,
}: {
  staff: Bar
  onLogout: () => void
}) {
  return <StationDisplayPage station="bar" staff={staff} onLogout={onLogout} />
}
