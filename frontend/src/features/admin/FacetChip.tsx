import { LuFilter, LuMenu, LuStar, LuX } from 'react-icons/lu'

// ---------------------------------------------------------------------------
// Facet chip — the colored token Odoo shows inside the search box for each
// active filter / group-by / favorite, with its remove cross. Shared by the
// admin screens that wire SearchMenus to real search state.
// ---------------------------------------------------------------------------

export type Facet = {
  key: string
  label: string
  kind: 'filter' | 'group' | 'favorite'
  onRemove: () => void
}

export default function FacetChip({ facet }: { facet: Facet }) {
  const style =
    facet.kind === 'group'
      ? { badge: 'bg-[#00888a]', body: 'bg-[#e0f1f1]', border: 'border-[#8fc7c7]/70' }
      : facet.kind === 'favorite'
        ? { badge: 'bg-[#b88414]', body: 'bg-[#fdf2d9]', border: 'border-[#e2c078]/80' }
        : { badge: 'bg-[#4b6e8c]', body: 'bg-[#eaf1f6]', border: 'border-[#9db4c0]/70' }
  const Icon = facet.kind === 'group' ? LuMenu : facet.kind === 'favorite' ? LuStar : LuFilter
  return (
    <span
      className={`flex shrink-0 items-stretch overflow-hidden rounded-[2px] border text-[12px] ${style.border}`}
    >
      <span className={`flex items-center px-1 ${style.badge}`}>
        <Icon className="h-3 w-3 text-white" />
      </span>
      <span className={`flex items-center gap-1 px-1.5 text-neutral-700 ${style.body}`}>
        {facet.label}
        <button
          type="button"
          aria-label={`Remove ${facet.label}`}
          onClick={facet.onRemove}
          className="text-neutral-500 transition hover:text-neutral-800"
        >
          <LuX className="h-3 w-3" />
        </button>
      </span>
    </span>
  )
}
