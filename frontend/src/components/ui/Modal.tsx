import { useEffect, type ReactNode } from 'react'
import { LuX } from 'react-icons/lu'

// Odoo-style centered dialog. Click the backdrop or press Escape to dismiss.
// `width` is a Tailwind max-w-* class so each caller can size its popup.
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-md',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    // On paper the dialog is the whole page, so top-align it instead of
    // floating it down the middle of an otherwise blank sheet.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px] print:items-start print:p-0"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:overflow-visible print:shadow-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 print:hidden"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 print:overflow-visible">{children}</div>

        {footer && <div className="border-t border-neutral-200 p-4 print:hidden">{footer}</div>}
      </div>
    </div>
  )
}
