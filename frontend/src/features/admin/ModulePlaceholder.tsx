import type { IconType } from 'react-icons'

/** UI-first stand-in for admin modules/menus that are not designed yet. */
export default function ModulePlaceholder({
  icon: Icon,
  title,
  note,
}: {
  icon: IconType
  title: string
  note?: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-50 shadow-sm ring-1 ring-neutral-200">
        <Icon className="h-8 w-8 text-neutral-400" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-700">{title}</h2>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-700">
          Coming soon
        </span>
        <p className="text-sm text-neutral-500">
          {note ?? "We haven't built this page yet — please check back later."}
        </p>
      </div>
    </div>
  )
}
