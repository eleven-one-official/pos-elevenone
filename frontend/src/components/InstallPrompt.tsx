import { useEffect, useState } from 'react'
import { LuDownload, LuShare, LuSquarePlus, LuX } from 'react-icons/lu'

/**
 * "Install this app" popup.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` once the PWA criteria are met
 * (manifest + service worker — production builds only, so this never appears
 * in dev). We intercept that event and surface our own card; Install replays
 * it as the native install dialog. iOS has no install event at all, so Safari
 * users get a one-liner pointing at Share → Add to Home Screen instead.
 *
 * Dismissing snoozes the popup for 30 days — staff tablets reload constantly
 * and must not be nagged every shift. Already-installed launches (standalone
 * display mode) never see it.
 */

// Chrome's install event — not yet part of the standard DOM typings.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pos_install_dismissed_at'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag for home-screen launches.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isSnoozed(): boolean {
  const at = Number(localStorage.getItem(DISMISSED_KEY))
  return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ masquerades as a Mac but still has a touch screen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export default function InstallPrompt() {
  // `event` present → Chrome-style card with a working Install button;
  // 'ios' → manual Add-to-Home-Screen instructions.
  const [install, setInstall] = useState<BeforeInstallPromptEvent | 'ios' | null>(null)

  useEffect(() => {
    if (isStandalone() || isSnoozed()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress Chrome's own mini-infobar
      setInstall(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      localStorage.removeItem(DISMISSED_KEY)
      setInstall(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    if (isIos()) setInstall('ios')

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!install) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    setInstall(null)
  }

  const doInstall = async () => {
    if (install === 'ios') return
    const event = install
    setInstall(null)
    await event.prompt()
    const { outcome } = await event.userChoice
    // Declining the native dialog counts as a dismissal — same 30-day snooze.
    if (outcome === 'dismissed') localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <img src="/pwa-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-neutral-800">Install ElevenOne POS</div>
            {install === 'ios' ? (
              <p className="mt-1 text-sm text-neutral-500">
                Open this page in Safari, tap <LuShare className="inline -mt-0.5" aria-label="Share" />{' '}
                then <span className="whitespace-nowrap font-medium text-neutral-700">
                  Add to Home Screen <LuSquarePlus className="inline -mt-0.5" />
                </span>{' '}
                to use it full screen like an app.
              </p>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">
                Add it to this device's home screen — it opens full screen, without the browser bar.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              {install !== 'ios' && (
                <button
                  type="button"
                  onClick={() => void doInstall()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  <LuDownload />
                  Install
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="-m-1 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <LuX className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  )
}
