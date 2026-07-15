import type { IconType } from 'react-icons'

/** Empty-state panel for admin sections whose backend isn't wired up yet. */
export default function Placeholder({
  icon: Icon,
  title,
  body,
}: {
  icon: IconType
  title: string
  body: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-neutral-300 shadow-sm">
        <Icon className="h-8 w-8" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-neutral-700">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-neutral-500">{body}</p>
    </div>
  )
}
