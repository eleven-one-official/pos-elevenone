import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LuBell,
  LuBellOff,
  LuCheck,
  LuChefHat,
  LuClock,
  LuLogOut,
  LuPlay,
  LuRefreshCw,
  LuStickyNote,
  LuUsers,
  LuUtensils,
  LuX,
} from 'react-icons/lu'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import { Loader, LoadingState } from '../../components/ui/Loader'
import { fetchActiveChefs, type Chef } from '../../services/api/chefs'
import {
  fetchKitchenTickets,
  markOrderReady,
  startOrder,
  type ApiOrder,
} from '../../services/api/orders'
import type { Kitchen } from './KitchenLoginDialog'

// ---------------------------------------------------------------------------
// Kitchen Display Screen (KDS) — replaces the kitchen/bar printer. Every order
// a waiter or cashier fires lands here as a ticket card, oldest first (a
// first-in-first-out rail). The cook reads what to make, then taps "Ready" to
// bump the ticket off the board. A chime, a spoken Khmer announcement and a
// highlight announce each new ticket; a per-ticket timer turns amber then red
// as an order ages so nothing is forgotten. Read-only otherwise: the kitchen
// never edits items or money.
// ---------------------------------------------------------------------------

/** How often the board re-pulls the queue from the backend. */
const POLL_MS = 5000
/** A freshly arrived ticket keeps its highlight this long. */
const NEW_FLASH_MS = 8000

const ORDER_TYPE_LABEL: Record<ApiOrder['order_type'], string> = {
  dine_in: 'Dine In',
  take_away: 'Take Away',
  delivery: 'Delivery',
}

// Age tiers — the longer a ticket sits, the louder it shouts.
type Tier = { bar: string; chip: string; late: boolean }
const TIER_FRESH: Tier = { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', late: false }
const TIER_WARM: Tier = { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', late: false }
const TIER_LATE: Tier = { bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', late: true }

function tierFor(minutes: number): Tier {
  if (minutes >= 10) return TIER_LATE
  if (minutes >= 5) return TIER_WARM
  return TIER_FRESH
}

function elapsedLabel(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return 'just now'
  if (totalMin < 60) return `${totalMin} min`
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`
}

function clockLabel(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${pad(h)}:${pad(d.getMinutes())} ${ampm}`
}

// Rising three-note chime for a new ticket, played twice so it carries over
// extractor fans and pans. Synthesised on the fly — no audio file to ship.
const CHIME_NOTES = [880, 1320, 1760]
const CHIME_GAP = 0.14
const CHIME_REPEATS = 2

// After the chime, a Khmer voice says it out loud — a cook with both hands in a
// pan hears the words without looking up. It's a recording rather than
// speech synthesis because Windows ships no Khmer voice; replace the file to
// change who speaks. VOICE_TEXT is only used by the synthesis fallback (Android
// kitchen tablets do have a Khmer engine).
const VOICE_SRC = '/sounds/new-order-km.mp3'
const VOICE_TEXT = 'មានការកម្ម៉ងថ្មី សូមរៀបចំ'
/** Hold the voice until the chime has finished ringing. */
const VOICE_DELAY_MS = 1400

function playChime(ctx: AudioContext) {
  const base = ctx.currentTime
  for (let pass = 0; pass < CHIME_REPEATS; pass += 1) {
    CHIME_NOTES.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = base + pass * (CHIME_NOTES.length * CHIME_GAP + 0.25) + i * CHIME_GAP
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
      osc.start(start)
      osc.stop(start + 0.34)
    })
  }
}

// Last-resort voice: the platform's own Khmer engine. Returns false when there
// isn't one — an English engine would only mangle the script, so we stay quiet
// and let the chime carry the alert.
function speakFallback(): boolean {
  const synth = window.speechSynthesis
  if (!synth) return false
  const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('km'))
  if (!voice) return false
  const utterance = new SpeechSynthesisUtterance(VOICE_TEXT)
  utterance.voice = voice
  utterance.lang = voice.lang
  utterance.rate = 0.95
  synth.cancel()
  synth.speak(utterance)
  return true
}

export default function KitchenDisplayPage({
  staff,
  onLogout,
}: {
  staff: Kitchen
  onLogout: () => void
}) {
  const [orders, setOrders] = useState<ApiOrder[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Optimistically bumped tickets — hidden the instant "Ready" is tapped so the
  // board feels snappy, before the server confirms and the next poll drops them.
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [soundOn, setSoundOn] = useState(true)
  // The browser withholds audio until someone touches the screen. Until then we
  // say so in the header rather than letting tickets land in silence.
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // The kitchen station signs in on one shared account, so a cook names
  // themselves when they take a ticket — that attribution feeds the Chef
  // Performance KPI. The roster is managed on the admin side.
  const [chefs, setChefs] = useState<Chef[]>([])
  // The ticket whose chef picker is open (null = closed).
  const [pickingFor, setPickingFor] = useState<ApiOrder | null>(null)

  // Ticket ids already on the board, and when each first appeared — drives the
  // "new" highlight and the chime without re-rendering on every poll.
  const seenRef = useRef<Set<number>>(new Set())
  // Whether a board has come back at least once. A ref, not the `orders` state:
  // the poll interval holds the first `load` closure forever, so reading state
  // there would say "still loading" and mute the first ticket of the service.
  const loadedOnceRef = useRef(false)
  const arrivedRef = useRef<Map<number, number>>(new Map())
  const audioRef = useRef<AudioContext | null>(null)
  const voiceRef = useRef<HTMLAudioElement | null>(null)
  const voiceTimerRef = useRef<number | null>(null)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  // Build the audio context once and nudge it out of the suspended state a
  // browser parks it in until the page has seen a real gesture. Resolves true
  // when the speaker is genuinely live.
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return false
      audioRef.current = new Ctor()
    }
    const ctx = audioRef.current
    if (ctx.state !== 'running') {
      try {
        await ctx.resume()
      } catch {
        /* still blocked — reported below */
      }
    }
    const ready = ctx.state === 'running'
    setAudioBlocked(!ready)
    return ready
  }, [])

  // One <audio> element reused for every announcement, so a burst of tickets
  // restarts the sentence instead of stacking overlapping voices.
  const speak = useCallback(() => {
    if (!voiceRef.current) voiceRef.current = new Audio(VOICE_SRC)
    const el = voiceRef.current
    try {
      el.currentTime = 0
    } catch {
      /* not seekable yet — play() still starts it from the top */
    }
    void el.play().catch(() => {
      // Recording missing or still blocked — try the platform voice.
      speakFallback()
    })
  }, [])

  /** New-order alert: chime, then the spoken reminder. Unlocks audio first. */
  const announce = useCallback(async () => {
    const ready = await unlockAudio()
    if (!ready || !audioRef.current) return
    try {
      playChime(audioRef.current)
    } catch {
      // Never let a dead speaker stop the board from updating.
    }
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
    voiceTimerRef.current = window.setTimeout(speak, VOICE_DELAY_MS)
  }, [unlockAudio, speak])

  // Don't let a queued sentence speak into an empty room after sign-out.
  useEffect(
    () => () => {
      if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
      voiceRef.current?.pause()
      window.speechSynthesis?.cancel()
    },
    [],
  )

  // Any touch of the screen counts as the gesture that unlocks audio. The
  // listeners stay put — a tab left in the background can be suspended again.
  useEffect(() => {
    void unlockAudio()
    const unlock = () => void unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [unlockAudio])

  const load = useCallback(async () => {
    try {
      const list = await fetchKitchenTickets()
      const ids = new Set(list.map((o) => o.id))

      // Announce tickets that weren't on the last board — but never the tickets
      // already waiting when the screen was switched on.
      const firstLoad = !loadedOnceRef.current
      loadedOnceRef.current = true
      const fresh = list.filter((o) => !seenRef.current.has(o.id))
      // If audio is still locked the visual highlight carries the news, and the
      // header asks for the tap that unlocks the chime.
      if (!firstLoad && fresh.length > 0 && soundOnRef.current) void announce()
      const nowMs = Date.now()
      for (const o of fresh) arrivedRef.current.set(o.id, nowMs)
      // Forget tickets that have left the board.
      for (const id of arrivedRef.current.keys()) if (!ids.has(id)) arrivedRef.current.delete(id)
      seenRef.current = ids

      setHiddenIds((prev) => {
        // Keep hiding only tickets still on the board (a confirmed bump drops off).
        const next = new Set<number>()
        for (const id of prev) if (ids.has(id)) next.add(id)
        return next.size === prev.size ? prev : next
      })
      setOrders(list)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not reach the server.')
    }
  }, [announce])

  // Poll the queue on a fixed interval. `load` no longer closes over state, so
  // the interval can depend on it honestly without being torn down each render.
  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  // Load the cook roster once — it changes rarely (managed in admin) and only
  // needs to be fresh enough to fill the "who's cooking?" picker.
  const loadChefs = useCallback(() => {
    fetchActiveChefs()
      .then(setChefs)
      .catch(() => {
        /* keep whatever we have; the picker shows a hint if it's empty */
      })
  }, [])
  useEffect(() => {
    loadChefs()
  }, [loadChefs])

  // Tick the wall clock + ticket timers once a second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2000)
    return () => window.clearTimeout(t)
  }, [toast])

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    // Tapping the bell is itself a gesture, so switching sound on both unlocks
    // audio and previews the alert — the cook hears exactly what a new ticket
    // sounds like. Switching it off silences anything mid-sentence.
    if (next) {
      void announce()
      return
    }
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
    voiceRef.current?.pause()
    window.speechSynthesis?.cancel()
  }

  // A cook took the ticket: attribute it to them and move it to "preparing".
  // The card stays on the board (still cooking) but flips to the Ready control.
  async function startCooking(order: ApiOrder, chef: Chef) {
    setPickingFor(null)
    // Optimistic — show it cooking under this cook's name at once.
    setOrders((prev) =>
      prev?.map((o) =>
        o.id === order.id ? { ...o, status: 'preparing', chef: { id: chef.id, name: chef.name } } : o,
      ) ?? prev,
    )
    try {
      await startOrder(order.id, chef.id)
      setToast(`${chef.name} started #${order.order_number}`)
    } catch {
      // Roll back to server truth so the ticket isn't stuck mislabelled.
      setToast('Could not start it — check the connection')
      void load()
    }
  }

  async function bump(order: ApiOrder) {
    setHiddenIds((prev) => new Set(prev).add(order.id))
    try {
      await markOrderReady(order.id)
      setToast(`Order #${order.order_number} ready`)
    } catch {
      // Put it back so the cook doesn't lose the ticket.
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(order.id)
        return next
      })
      setToast('Could not mark it ready — check the connection')
    }
  }

  const visible = useMemo(
    () => (orders ?? []).filter((o) => !hiddenIds.has(o.id)),
    [orders, hiddenIds],
  )

  const initials = staff.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6] text-neutral-800">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-5">
        <ElevenOneLogo tone="dark" />
        <div className="flex items-center gap-2 border-l border-neutral-200 pl-4">
          <LuUtensils className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-wide text-neutral-800">Kitchen Display</span>
        </div>

        <span className="ml-3 flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          {visible.length} active
        </span>

        {loadError && (
          <span className="hidden items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600 sm:flex">
            <LuRefreshCw className="h-3.5 w-3.5" />
            Reconnecting…
          </span>
        )}

        {soundOn && audioBlocked && (
          <button
            type="button"
            onClick={() => void announce()}
            className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-200 sm:flex"
          >
            <LuBellOff className="h-3.5 w-3.5" />
            Tap to turn the chime on
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold tabular-nums text-neutral-700 md:flex">
            <LuClock className="h-4 w-4 text-neutral-400" />
            {clockLabel(new Date(now))}
          </span>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? 'Mute new-order chime' : 'Unmute new-order chime'}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition ${
              soundOn ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {soundOn ? <LuBell className="h-5 w-5" /> : <LuBellOff className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900"
          >
            <LuRefreshCw className="h-5 w-5" />
          </button>

          <div className="ml-1 flex items-center gap-2.5 border-l border-neutral-200 pl-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {initials}
            </span>
            <div className="hidden leading-tight sm:block">
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">Kitchen</div>
              <div className="text-sm font-semibold text-neutral-800">{staff.name}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              <LuLogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Board */}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {orders === null && !loadError ? (
          <LoadingState label="Loading kitchen tickets…" className="mt-20" />
        ) : loadError && orders === null ? (
          <div className="mt-24 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-rose-600">{loadError}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              <LuRefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-24 flex flex-col items-center gap-3 text-center text-neutral-400">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
              <LuCheck className="h-10 w-10 text-emerald-500" />
            </span>
            <p className="text-xl font-semibold text-neutral-700">All caught up</p>
            <p className="text-sm">New orders appear here the moment they're sent.</p>
          </div>
        ) : (
          <div className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {visible.map((order) => (
              <TicketCard
                key={order.id}
                order={order}
                now={now}
                isNew={(now - (arrivedRef.current.get(order.id) ?? 0)) < NEW_FLASH_MS}
                onStart={() => setPickingFor(order)}
                onReady={() => void bump(order)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chef picker — a cook names themselves when they take a ticket. */}
      {pickingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LuChefHat className="h-5 w-5" />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-neutral-900">Who’s cooking?</div>
                  <div className="text-xs text-neutral-500">
                    {pickingFor.table?.name ? `${pickingFor.table.name} · ` : ''}#
                    {pickingFor.order_number}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setPickingFor(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            {chefs.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-neutral-600">No chefs yet.</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Add cooks in Admin › Point of Sale › Configuration › Chefs, then they’ll show up
                  here.
                </p>
                <button
                  type="button"
                  onClick={loadChefs}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  <LuRefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">
                {chefs.map((chef) => (
                  <button
                    key={chef.id}
                    type="button"
                    onClick={() => void startCooking(pickingFor, chef)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-4 text-center transition hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-base font-bold text-neutral-700">
                      {chef.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold leading-tight text-neutral-800">
                      {chef.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-[#2b2138] px-5 py-3 text-sm font-semibold text-white shadow-lg">
            <LuCheck className="h-4 w-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function TicketCard({
  order,
  now,
  isNew,
  onStart,
  onReady,
}: {
  order: ApiOrder
  now: number
  isNew: boolean
  onStart: () => void
  onReady: () => void
}) {
  const [bumping, setBumping] = useState(false)
  // A cook has taken this ticket — it's being prepared, so show who's on it and
  // the Ready control. A brand-new ticket instead offers Start (pick a cook).
  const cooking = order.status === 'preparing'
  const elapsedMs = Math.max(0, now - new Date(order.created_at).getTime())
  const minutes = Math.floor(elapsedMs / 60000)
  const tier = tierFor(minutes)
  const tableLabel = order.table?.name ?? (order.order_type === 'take_away' ? 'Take Away' : '—')
  const items = order.items.filter((i) => i.quantity > 0)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        isNew ? 'border-sky-400 ring-2 ring-sky-300' : 'border-neutral-200'
      }`}
    >
      <div className={`h-1.5 ${tier.bar} ${tier.late ? 'animate-pulse' : ''}`} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-lg font-extrabold tracking-wide text-neutral-900">
              {tableLabel}
            </span>
            {/* The ticket relabels itself when the bill is transferred, so name
                the table it came from — a cook plating for E1 has to see that
                these guests moved. */}
            {order.transferred_from && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                from {order.transferred_from.name}
              </span>
            )}
            {!cooking && isNew && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                New
              </span>
            )}
            {cooking && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Cooking
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">#{order.order_number}</div>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${tier.chip}`}
        >
          <LuClock className="h-3.5 w-3.5" />
          {elapsedLabel(elapsedMs)}
        </span>
      </div>

      {/* Meta */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">{ORDER_TYPE_LABEL[order.order_type]}</span>
        {order.guest_count > 0 && (
          <span className="flex items-center gap-1">
            <LuUsers className="h-3.5 w-3.5" />
            {order.guest_count}
          </span>
        )}
        {order.user?.name && <span className="truncate">· {order.user.name}</span>}
      </div>

      {/* Items */}
      <ul className="mt-3 flex-1 space-y-2 px-4">
        {items.map((item) => (
          <li key={item.id}>
            <div className="flex items-baseline gap-2.5">
              <span className="min-w-7 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-base font-extrabold tabular-nums text-neutral-900">
                {item.quantity}
              </span>
              <span className="text-base font-semibold leading-tight text-neutral-800">{item.name}</span>
            </div>
            {item.note && (
              <div className="ml-9 mt-1 flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-700">
                <LuStickyNote className="h-3.5 w-3.5 shrink-0" />
                {item.note}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Action — pick a cook to Start, then Ready once it's plated */}
      <div className="mt-3 px-4 pb-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          <span>
            {totalItems} item{totalItems === 1 ? '' : 's'}
          </span>
          {cooking && order.chef?.name && (
            <span className="flex items-center gap-1 font-bold text-emerald-600">
              <LuChefHat className="h-3.5 w-3.5" />
              {order.chef.name}
            </span>
          )}
        </div>
        {cooking ? (
          <button
            type="button"
            disabled={bumping}
            onClick={() => {
              setBumping(true)
              onReady()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-base font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bumping ? <Loader size="sm" /> : <LuCheck className="h-5 w-5" />}
            Ready
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-base font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99]"
          >
            <LuPlay className="h-5 w-5" />
            Start
          </button>
        )}
      </div>
    </article>
  )
}
