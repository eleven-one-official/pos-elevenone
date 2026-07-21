import StationDisplayPage from '../station/StationDisplayPage'
import type { Kitchen } from './KitchenLoginDialog'

/**
 * The Kitchen Display Screen — the cooks' half of the shared station board.
 * Only the food half of each send reaches it: drinks fire to the bar instead.
 */
export default function KitchenDisplayPage({
  staff,
  onLogout,
}: {
  staff: Kitchen
  onLogout: () => void
}) {
  return <StationDisplayPage station="kitchen" staff={staff} onLogout={onLogout} />
}
