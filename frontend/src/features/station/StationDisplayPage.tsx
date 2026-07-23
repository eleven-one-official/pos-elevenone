import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuBell,
  LuBellOff,
  LuCheck,
  LuChefHat,
  LuClock,
  LuCupSoda,
  LuHistory,
  LuLogOut,
  LuPlay,
  LuRefreshCw,
  LuStickyNote,
  LuTimer,
  LuUsers,
  LuUtensils,
  LuX,
} from 'react-icons/lu'
import ElevenOneLogo from '../../components/ElevenOneLogo'
import Toast from '../../components/ui/Toast'
import ZoomControl from '../../components/ui/ZoomControl'
import { Loader, LoadingState } from '../../components/ui/Loader'
import { fetchActiveChefs, type Chef } from '../../services/api/chefs'
import {
  fetchStationHistory,
  fetchStationTickets,
  markTicketItemReady,
  markTicketReady,
  startTicket,
  startTicketItem,
  type ApiOrderItem,
  type ApiStationTicket,
  type Station,
} from '../../services/api/orders'

// ---------------------------------------------------------------------------
// Station Display Screen — replaces the kitchen/bar printer. Every order a
// waiter or cashier fires lands here as a ticket card, oldest first (a
// first-in-first-out rail). The kitchen works a card *dish by dish*: a cook
// taps a dish, names themselves as its maker (starting that dish's own clock)
// and taps Ready on the dish when it's plated — the card leaves the board on
// its own once the last dish is done. The bar still takes and bumps a whole
// ticket, since a round of drinks is one job. A chime, a spoken Khmer
// announcement and a highlight announce each new ticket; a per-ticket timer
// turns amber then red as an order ages so nothing is forgotten. Read-only
// otherwise: a station never edits items or money.
//
// The board carries outstanding work only, so a bumped card is gone from it for
// good — the history drawer beside the bell keeps today's plated tickets, with
// who made each one and how long it took, for when a waiter asks whether a
// table's food has gone out.
//
// A ticket is a *round*, not a bill. When a table that is already eating orders
// again, the extra items arrive as a second card under the same table number —
// chiming, timing and plating on their own, instead of slipping unnoticed into
// a card already started (or one that left the board hours ago).
//
// The same board serves two stations. A send is split by the backend — food to
// the kitchen, drinks to the bar — into two rounds under one round number, so
// each screen shows only what its own people make. In the kitchen every dish
// names its own maker, so a card split between sections credits each cook with
// exactly the dishes (and the minutes) that were theirs in the Chef
// Performance KPI; the bar just starts pouring.
// ---------------------------------------------------------------------------

/** Who is signed in at a station — one shared, PIN-less account per screen. */
export type StationStaff = {
  id: string
  name: string
  role?: string
}

/** Everything that differs between the two boards. */
type StationLook = {
  /** Header title, e.g. "Kitchen Display". */
  title: string
  /** Role caption beside the signed-in name. */
  badge: string
  icon: IconType
  /**
   * Whether the board works per dish — each line taken by a named cook (the
   * kitchen's roster) with its own clock — rather than per ticket (the bar).
   */
  namesMaker: boolean
  /** Badge on a ticket someone has taken. */
  activeLabel: string
  /** Frame animation for a taken ticket — one colour per station. */
  activeFrame: string
  emptyHint: string
  loadingLabel: string
}

const LOOKS: Record<Station, StationLook> = {
  kitchen: {
    title: 'Kitchen Display',
    badge: 'Kitchen',
    icon: LuUtensils,
    namesMaker: true,
    activeLabel: 'Cooking',
    // The kitchen card itself stays plain — its running colour sits on each
    // dish being cooked instead (.kds-dish-cooking in DishRow), because the
    // kitchen owns dishes, not tickets.
    activeFrame: '',
    emptyHint: "New orders appear here the moment they're sent.",
    loadingLabel: 'Loading kitchen tickets…',
  },
  bar: {
    title: 'Bar Display',
    badge: 'Bar',
    icon: LuCupSoda,
    namesMaker: false,
    activeLabel: 'Pouring',
    activeFrame: 'kds-pouring',
    emptyHint: "New drinks appear here the moment they're sent.",
    loadingLabel: 'Loading bar tickets…',
  },
}

/** How often the board re-pulls the queue from the backend. */
const POLL_MS = 5000
/** A freshly arrived ticket keeps its highlight this long. */
const NEW_FLASH_MS = 8000

const ORDER_TYPE_LABEL: Record<ApiStationTicket['order']['order_type'], string> = {
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

/**
 * How long a job took, to the second — "45s", "8m 12s", "1h 04m". Cooking is
 * measured finer than a ticket's age: a plate that took four and a half minutes
 * and one that took six are both "4 min" in round minutes, and the cook whose
 * time this is deserves the real number.
 */
function durationLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/**
 * The maker's own clock: Start → Ready, not the age of the ticket. Null until
 * someone takes it; while it's being made it runs against `now`, and once it's
 * plated it freezes on the server's two stamps — the same pair the Chef
 * Performance KPI reads, so the screen and the report can never disagree.
 */
function makeMs(ticket: ApiStationTicket, now: number): number | null {
  if (!ticket.started_at) return null
  const started = new Date(ticket.started_at).getTime()
  const ended = ticket.ready_at ? new Date(ticket.ready_at).getTime() : now
  return Math.max(0, ended - started)
}

/**
 * One dish's own clock — the same Start → Ready pair, at line level. Null
 * until a cook takes the dish; running while it cooks; frozen once plated.
 */
function dishMs(item: ApiOrderItem, now: number): number | null {
  if (!item.started_at) return null
  const ended = item.ready_at ? new Date(item.ready_at).getTime() : now
  return Math.max(0, ended - new Date(item.started_at).getTime())
}

/**
 * Everyone cooking a ticket, in the order they were ticked (the first leads —
 * that is the one the bill shows). Tickets fired before a card could be shared
 * carry a single cook instead, so fall back to that.
 */
function crewOf(ticket: ApiStationTicket): { id: number; name: string }[] {
  if (ticket.chefs?.length) return ticket.chefs
  return ticket.chef ? [ticket.chef] : []
}

/** The crew on one line — "Bopha + Rithy" — or null when nobody has taken it. */
function crewLabel(ticket: ApiStationTicket): string | null {
  const crew = crewOf(ticket)
  return crew.length > 0 ? crew.map((c) => c.name).join(' + ') : null
}

function initialsOf(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

/**
 * How a ticket names itself in a message: the bill number, plus the round when
 * the table has ordered more than once — "#ORD-20260721-0033 · R2".
 */
function ticketLabel(ticket: ApiStationTicket): string {
  return `#${ticket.order.order_number}${ticket.round_no > 1 ? ` · R${ticket.round_no}` : ''}`
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

// After the chime, a Khmer voice says it out loud — someone with both hands
// busy hears the words without looking up. It's a recording rather than
// speech synthesis because Windows ships no Khmer voice; replace the file to
// change who speaks. VOICE_TEXT is only used by the synthesis fallback (Android
// station tablets do have a Khmer engine).
const VOICE_SRC = '/sounds/new-order-km.mp3'
const VOICE_TEXT = 'មានការកម្ម៉ងថ្មី សូមរៀបចំ'
/** Hold the voice until the chime has finished ringing. */
const VOICE_DELAY_MS = 1400
/**
 * Playback speed of the recording. Safe to turn: the clip plays through a media
 * element with `preservesPitch`, which time-stretches, so a faster announcement
 * still sounds like the same person. Past ~1.5 the words start to slur.
 */
const VOICE_RATE = 1.25
/** Speed of the synthesis fallback. An engine keeps the pitch on its own. */
const SPEECH_RATE = 1.25
/** How long to let a resume() settle before calling the speaker blocked. */
const RESUME_GRACE_MS = 1500

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
  utterance.rate = SPEECH_RATE
  synth.cancel()
  synth.speak(utterance)
  return true
}

export default function StationDisplayPage({
  station,
  staff,
  onLogout,
}: {
  station: Station
  staff: StationStaff
  onLogout: () => void
}) {
  const look = LOOKS[station]
  const [tickets, setTickets] = useState<ApiStationTicket[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Optimistically bumped tickets — hidden the instant "Ready" is tapped so the
  // board feels snappy, before the server confirms and the next poll drops them.
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const [soundOn, setSoundOn] = useState(true)
  // The browser withholds audio until someone touches the screen. Until then we
  // say so in the header rather than letting tickets land in silence.
  const [audioBlocked, setAudioBlocked] = useState(false)
  // A confirmation line, optionally carrying how long the job took — the
  // headline of the bump, so it gets its own pill rather than being buried in
  // the sentence.
  const [toast, setToast] = useState<{
    text: string
    took?: string
    tone?: 'success' | 'error'
  } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // The kitchen signs in on one shared account, so the cooks name themselves
  // when they take a ticket — that attribution feeds the Chef Performance KPI.
  // The roster is managed on the admin side; the bar has none and just starts.
  const [chefs, setChefs] = useState<Chef[]>([])
  // The dish whose chef picker is open (null = closed). A cook takes one dish
  // at a time now — a card shared between sections simply has its dishes taken
  // by different names — so picking is a single tap on a name, no confirm.
  const [pickingFor, setPickingFor] = useState<{
    ticket: ApiStationTicket
    item: ApiOrderItem
  } | null>(null)
  // The history drawer — today's plated tickets. A bumped card leaves the board
  // for good, so this is the only way back to one. Fetched when the drawer is
  // opened rather than polled: it's a look-up, not a live rail.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ApiStationTicket[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // Ticket ids already on the board, and when each first appeared — drives the
  // "new" highlight and the chime without re-rendering on every poll.
  const seenRef = useRef<Set<number>>(new Set())
  // Whether a board has come back at least once. A ref, not the `tickets` state:
  // the poll interval holds the first `load` closure forever, so reading state
  // there would say "still loading" and mute the first ticket of the service.
  const loadedOnceRef = useRef(false)
  const arrivedRef = useRef<Map<number, number>>(new Map())
  const audioRef = useRef<AudioContext | null>(null)
  const voiceElRef = useRef<HTMLAudioElement | null>(null)
  const voiceBufferRef = useRef<AudioBuffer | null>(null)
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const voiceTimerRef = useRef<number | null>(null)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  // Build the audio context once and nudge it out of the suspended state a
  // browser parks it in until the page has seen a real gesture. Hands back the
  // context only when it can genuinely make sound right now.
  const unlockAudio = useCallback(async (): Promise<AudioContext | null> => {
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioRef.current = new Ctor()
    }
    const ctx = audioRef.current
    if (ctx.state !== 'running') {
      // Chrome leaves this promise *pending forever* on a page that has never
      // been touched, so it can't be awaited on its own — that would hang the
      // announcement and leave the "tap to enable" hint unshown. Race it: carry
      // on the moment it settles (~460ms after a real tap), give up after that.
      await Promise.race([
        ctx.resume().catch(() => {}),
        new Promise((resolve) => window.setTimeout(resolve, RESUME_GRACE_MS)),
      ])
    }
    const ready = ctx.state === 'running'
    setAudioBlocked(!ready)
    return ready ? ctx : null
  }, [])

  // Speed and pitch are only separate knobs on a media element: `preservesPitch`
  // time-stretches, where a Web Audio buffer source can nothing but resample —
  // which is what turned a faster announcement squeaky. So the clip plays
  // through an <audio> element, but *routed into the same AudioContext* as the
  // chime: an element is otherwise gated by a second, separate autoplay rule,
  // which is how the chime could ring while the sentence stayed silent.
  const voiceElement = useCallback((ctx: AudioContext): HTMLAudioElement | null => {
    if (voiceElRef.current) return voiceElRef.current
    try {
      const el = new Audio(VOICE_SRC)
      el.preload = 'auto'
      ctx.createMediaElementSource(el).connect(ctx.destination)
      voiceElRef.current = el
      return el
    } catch {
      return null
    }
  }, [])

  // Fallback path for a browser that won't give us a routed element. Plays at
  // the recorded speed — resampling here would bring the squeak back.
  const loadVoice = useCallback(async (ctx: AudioContext): Promise<AudioBuffer> => {
    if (voiceBufferRef.current) return voiceBufferRef.current
    const res = await fetch(VOICE_SRC)
    if (!res.ok) throw new Error(`voice clip ${res.status}`)
    voiceBufferRef.current = await ctx.decodeAudioData(await res.arrayBuffer())
    return voiceBufferRef.current
  }, [])

  const speak = useCallback(
    async (ctx: AudioContext) => {
      const el = voiceElement(ctx)
      if (el) {
        el.playbackRate = VOICE_RATE
        // Chrome and Safari default this on, but say it out loud — it's the
        // whole reason VOICE_RATE is safe to raise.
        el.preservesPitch = true
        // A burst of tickets restarts the sentence instead of stacking voices.
        el.currentTime = 0
        try {
          await el.play()
          return
        } catch {
          // Blocked or the file is missing — drop to the buffer path below.
        }
      }
      try {
        const buffer = await loadVoice(ctx)
        try {
          voiceSourceRef.current?.stop()
        } catch {
          /* already finished */
        }
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.start()
        voiceSourceRef.current = source
      } catch {
        // Recording missing or undecodable — try the platform's Khmer voice.
        speakFallback()
      }
    },
    [voiceElement, loadVoice],
  )

  /** New-order alert: chime, then the spoken reminder. Unlocks audio first. */
  const announce = useCallback(async () => {
    const ctx = await unlockAudio()
    if (!ctx) return
    try {
      playChime(ctx)
    } catch {
      // Never let a dead speaker stop the board from updating.
    }
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
    voiceTimerRef.current = window.setTimeout(() => void speak(ctx), VOICE_DELAY_MS)
  }, [unlockAudio, speak])

  // Don't let a queued sentence speak into an empty room after sign-out.
  useEffect(
    () => () => {
      if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current)
      voiceElRef.current?.pause()
      try {
        voiceSourceRef.current?.stop()
      } catch {
        /* already finished */
      }
      window.speechSynthesis?.cancel()
    },
    [],
  )

  // Any touch of the screen counts as the gesture that unlocks audio. The
  // listeners stay put — a tab left in the background can be suspended again.
  useEffect(() => {
    // Wire up and decode the clip up front (both work on a still-suspended
    // context) so the first announcement isn't waiting on a fetch.
    void unlockAudio().then((ctx) => {
      const c = ctx ?? audioRef.current
      if (!c) return
      voiceElement(c)?.load()
      void loadVoice(c).catch(() => {})
    })
    const unlock = () => void unlockAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [unlockAudio, voiceElement, loadVoice])

  const load = useCallback(async () => {
    try {
      const list = await fetchStationTickets(station)
      const ids = new Set(list.map((t) => t.id))

      // Announce tickets that weren't on the last board — but never the tickets
      // already waiting when the screen was switched on. A table's second round
      // is a ticket of its own, so it chimes like any other new order.
      const firstLoad = !loadedOnceRef.current
      loadedOnceRef.current = true
      const fresh = list.filter((t) => !seenRef.current.has(t.id))
      // If audio is still locked the visual highlight carries the news, and the
      // header asks for the tap that unlocks the chime.
      if (!firstLoad && fresh.length > 0 && soundOnRef.current) void announce()
      const nowMs = Date.now()
      for (const t of fresh) arrivedRef.current.set(t.id, nowMs)
      // Forget tickets that have left the board.
      for (const id of arrivedRef.current.keys()) if (!ids.has(id)) arrivedRef.current.delete(id)
      seenRef.current = ids

      setHiddenIds((prev) => {
        // Keep hiding only tickets still on the board (a confirmed bump drops off).
        const next = new Set<number>()
        for (const id of prev) if (ids.has(id)) next.add(id)
        return next.size === prev.size ? prev : next
      })
      setTickets(list)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not reach the server.')
    }
  }, [announce, station])

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
    if (!look.namesMaker) return
    fetchActiveChefs()
      .then(setChefs)
      .catch(() => {
        /* keep whatever we have; the picker shows a hint if it's empty */
      })
  }, [look.namesMaker])
  useEffect(() => {
    loadChefs()
  }, [loadChefs])

  const loadHistory = useCallback(async () => {
    setHistoryError(null)
    try {
      setHistory(await fetchStationHistory(station))
    } catch (e) {
      setHistory(null)
      setHistoryError(e instanceof Error ? e.message : 'Could not reach the server.')
    }
  }, [station])

  // Re-pull every time the drawer is opened — what went out five minutes ago is
  // exactly what someone opens it to check.
  function openHistory() {
    setHistory(null)
    setHistoryOpen(true)
    void loadHistory()
  }

  // Tick the wall clock + ticket timers once a second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Auto-dismiss the confirmation toast — a bump time stays up longer, since
  // it's a number someone actually reads rather than an acknowledgement.
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), toast.took ? 4500 : 400)
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
    voiceElRef.current?.pause()
    try {
      voiceSourceRef.current?.stop()
    } catch {
      /* already finished */
    }
    window.speechSynthesis?.cancel()
  }

  function openPicker(ticket: ApiStationTicket, item: ApiOrderItem) {
    setPickingFor({ ticket, item })
  }

  function closePicker() {
    setPickingFor(null)
  }

  /** Swap in the server's refreshed round; the rest of the board stays put. */
  function replaceTicket(round: ApiStationTicket) {
    setTickets((prev) => prev?.map((t) => (t.id === round.id ? round : t)) ?? prev)
  }

  /** Optimistically patch one dish (and, optionally, its round) in place. */
  function patchDish(
    ticketId: number,
    itemId: number,
    patch: Partial<ApiOrderItem>,
    roundPatch: Partial<ApiStationTicket> = {},
  ) {
    setTickets((prev) =>
      prev?.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              ...roundPatch,
              items: t.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
            }
          : t,
      ) ?? prev,
    )
  }

  // The bar takes the whole ticket at once — no roster, no per-dish clocks —
  // so the card just flips to the Ready control. Optimistic, like everything
  // on a board: shown under way before the server confirms.
  async function start(ticket: ApiStationTicket) {
    const startedAt = new Date().toISOString()
    setTickets((prev) =>
      prev?.map((t) =>
        t.id === ticket.id ? { ...t, status: 'preparing', started_at: t.started_at ?? startedAt } : t,
      ) ?? prev,
    )
    try {
      await startTicket(ticket.id, station)
      setToast({ text: `Started ${ticketLabel(ticket)}` })
    } catch {
      // Roll back to server truth so the ticket isn't stuck mislabelled.
      setToast({ text: 'Could not start it — check the connection', tone: 'error' })
      void load()
    }
  }

  // A cook takes one dish: name them and start that dish's own clock — the
  // per-dish time the Chef Performance KPI reads. The row flips to "cooking"
  // at once, then the whole card is swapped for the server's truth, which
  // carries the round's rolled-up status and crew back with it.
  async function startDish(ticket: ApiStationTicket, item: ApiOrderItem, chef: Chef) {
    closePicker()
    const startedAt = new Date().toISOString()
    patchDish(
      ticket.id,
      item.id,
      {
        chef_id: chef.id,
        chef: { id: chef.id, name: chef.name },
        started_at: item.started_at ?? startedAt,
      },
      { status: 'preparing', started_at: ticket.started_at ?? startedAt },
    )
    try {
      replaceTicket(await startTicketItem(ticket.id, item.id, station, chef.id))
      setToast({ text: `${chef.name} started ${item.name}` })
    } catch {
      setToast({ text: 'Could not start it — check the connection', tone: 'error' })
      void load()
    }
  }

  // One dish is plated. The backend rolls the ticket up: if this was the last
  // dish the round comes back `ready` and the card leaves the board crediting
  // the whole crew; otherwise the row freezes on the dish's own time.
  async function readyDish(ticket: ApiStationTicket, item: ApiOrderItem) {
    patchDish(ticket.id, item.id, { ready_at: item.ready_at ?? new Date().toISOString() })
    try {
      const round = await markTicketItemReady(ticket.id, item.id, station)
      if (round.status === 'ready') {
        setHiddenIds((prev) => new Set(prev).add(ticket.id))
        const took = makeMs(round, Date.now())
        const who = crewLabel(round)
        setToast({
          text: who ? `${who} finished ${ticketLabel(ticket)}` : `${ticketLabel(ticket)} ready`,
          took: took === null ? undefined : durationLabel(took),
        })
        return
      }
      replaceTicket(round)
      // The dish's time off the server's own stamps, not a screen clock.
      const line = round.items.find((i) => i.id === item.id)
      const took = line ? dishMs(line, Date.now()) : null
      setToast({
        text: line?.chef?.name ? `${line.chef.name} plated ${item.name}` : `${item.name} ready`,
        took: took === null ? undefined : durationLabel(took),
      })
    } catch {
      setToast({ text: 'Could not mark it ready — check the connection', tone: 'error' })
      void load()
    }
  }

  async function bump(ticket: ApiStationTicket) {
    setHiddenIds((prev) => new Set(prev).add(ticket.id))
    try {
      // The card leaves the board here, so the bump is the last chance to say
      // how long it took — read off the server's own stamps, which the response
      // carries back, rather than off a screen clock that may have drifted.
      const done = await markTicketReady(ticket.id, station)
      const took = makeMs(done, Date.now()) ?? makeMs(ticket, Date.now())
      const who = crewLabel(done) ?? crewLabel(ticket)
      setToast({
        text: who ? `${who} finished ${ticketLabel(ticket)}` : `${ticketLabel(ticket)} ready`,
        took: took === null ? undefined : durationLabel(took),
      })
    } catch {
      // Put it back so whoever is making it doesn't lose the ticket.
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(ticket.id)
        return next
      })
      setToast({ text: 'Could not mark it ready — check the connection', tone: 'error' })
    }
  }

  const visible = useMemo(
    () => (tickets ?? []).filter((t) => !hiddenIds.has(t.id)),
    [tickets, hiddenIds],
  )

  const initials = initialsOf(staff.name)
  const StationIcon = look.icon

  return (
    <div className="flex h-screen flex-col bg-[#f3f4f6] text-neutral-800">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-5">
        <ElevenOneLogo tone="dark" />
        <div className="flex items-center gap-2 border-l border-neutral-200 pl-4">
          <StationIcon className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold tracking-wide text-neutral-800">{look.title}</span>
        </div>

        <span className="ml-3 flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-700">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          {visible.length} active
        </span>

        {/* The wall clock sits beside the active count — the two things a
            station glances at together: how much is on, and what time it is. */}
        <span className="hidden items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-semibold tabular-nums text-neutral-700 md:flex">
          <LuClock className="h-4 w-4 text-neutral-400" />
          {clockLabel(new Date(now))}
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

        <div className="ml-auto flex items-center gap-3">
          <ZoomControl />

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
            onClick={openHistory}
            aria-label="Sent out today"
            title="Sent out today"
            className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-3 transition ${
              historyOpen
                ? 'bg-primary/10 text-primary'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
            }`}
          >
            <LuHistory className="h-4 w-4" />
            {/* A caption under the icon so a station knows this is where
                already-sent tickets go, without hovering for the tooltip. */}
            <span className="text-[9px] font-semibold uppercase leading-none tracking-wide">
              History
            </span>
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
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">{look.badge}</div>
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
        {tickets === null && !loadError ? (
          <LoadingState label={look.loadingLabel} className="mt-20" />
        ) : loadError && tickets === null ? (
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
            <p className="text-sm">{look.emptyHint}</p>
          </div>
        ) : (
          <div className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
            {visible.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                look={look}
                now={now}
                isNew={(now - (arrivedRef.current.get(ticket.id) ?? 0)) < NEW_FLASH_MS}
                onStart={() => void start(ticket)}
                onReady={() => void bump(ticket)}
                onStartDish={(item) => openPicker(ticket, item)}
                onReadyDish={(item) => void readyDish(ticket, item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* History — what this station has already sent out today. */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <button
            type="button"
            aria-label="Close history"
            className="flex-1 cursor-default"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LuHistory className="h-5 w-5" />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-neutral-900">Sent out today</div>
                  <div className="text-xs text-neutral-500">
                    {history === null
                      ? 'Loading…'
                      : `${history.length} ticket${history.length === 1 ? '' : 's'} plated`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Refresh history"
                  onClick={() => void loadHistory()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <LuRefreshCw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setHistoryOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <LuX className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f9] p-4">
              {historyError ? (
                <div className="mt-16 flex flex-col items-center gap-4 text-center">
                  <p className="text-sm text-rose-600">{historyError}</p>
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <LuRefreshCw className="h-4 w-4" />
                    Retry
                  </button>
                </div>
              ) : history === null ? (
                <LoadingState label="Loading history…" className="mt-16" />
              ) : history.length === 0 ? (
                <div className="mt-16 flex flex-col items-center gap-3 text-center text-neutral-400">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
                    <LuHistory className="h-8 w-8 text-neutral-300" />
                  </span>
                  <p className="text-base font-semibold text-neutral-600">Nothing sent out yet</p>
                  <p className="text-sm">Tickets appear here once they’re marked ready.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {history.map((ticket) => (
                    <HistoryRow key={ticket.id} ticket={ticket} />
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Chef picker — a cook names themselves when they take a dish. One dish,
          one maker: a single tap on a name starts that dish's clock, so there
          is no multi-select and no confirm step to slow a busy pass down. */}
      {pickingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <LuChefHat className="h-5 w-5" />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-neutral-900">
                    Who’s cooking x{pickingFor.item.quantity} {pickingFor.item.name}?
                  </div>
                  <div className="text-xs text-neutral-500">
                    {pickingFor.ticket.order.table?.name
                      ? `${pickingFor.ticket.order.table.name} · `
                      : ''}
                    {ticketLabel(pickingFor.ticket)} · tap a name to start the dish
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cancel"
                onClick={closePicker}
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
                    onClick={() => void startDish(pickingFor.ticket, pickingFor.item, chef)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-4 text-center transition hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-base font-bold text-neutral-700">
                      {initialsOf(chef.name)}
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

      {/* Confirmation popup — a bump is the last word on a ticket, so it lands
          in the middle of the screen, where a cook standing back from the pass
          is already looking, instead of as a strip along the bottom edge. */}
      {toast && <Toast message={toast.text} took={toast.took} tone={toast.tone} />}
    </div>
  )
}

/**
 * One plated ticket in the history drawer. The card is a record, not a job —
 * no timers running, no buttons: what was made, who made it, when it left and
 * how long it took.
 */
function HistoryRow({ ticket }: { ticket: ApiStationTicket }) {
  const order = ticket.order
  const tableLabel = order.table?.name ?? (order.order_type === 'take_away' ? 'Take Away' : '—')
  const items = ticket.items.filter((i) => i.quantity > 0)
  // Frozen on the server's own stamps — the same pair the Chef Performance KPI
  // reads, so the drawer can never disagree with the report.
  const tookMs = ticket.ready_at ? makeMs(ticket, new Date(ticket.ready_at).getTime()) : null

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-extrabold text-neutral-900">{tableLabel}</span>
            {ticket.round_no > 1 && (
              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                R{ticket.round_no}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">#{order.order_number}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-700">
            <LuCheck className="h-3.5 w-3.5" />
            {ticket.ready_at ? clockLabel(new Date(ticket.ready_at)) : '—'}
          </span>
          {tookMs !== null && (
            <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-neutral-500">
              <LuTimer className="h-3 w-3" />
              {durationLabel(tookMs)}
            </span>
          )}
        </div>
      </div>

      {crewLabel(ticket) && (
        <div className="mt-1.5 flex items-start gap-1 px-4 text-xs font-semibold text-neutral-600">
          <LuChefHat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          {crewLabel(ticket)}
        </div>
      )}

      <ul className="mt-2 space-y-1 px-4 pb-3.5">
        {items.map((item) => {
          // Since per-dish tracking each line carries its own maker and its
          // own frozen clock — the answer to "who made it, and how long?".
          const tookMs = item.ready_at ? dishMs(item, new Date(item.ready_at).getTime()) : null
          return (
            <li key={item.id} className="flex items-baseline gap-2 text-sm text-neutral-700">
              <span className="min-w-6 shrink-0 rounded bg-neutral-100 px-1.5 text-center font-bold tabular-nums text-neutral-800">
                x{item.quantity}
              </span>
              <span className="min-w-0 leading-tight">{item.name}</span>
              {(item.chef?.name || tookMs !== null) && (
                <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
                  {item.chef?.name}
                  {item.chef?.name && tookMs !== null && ' · '}
                  {tookMs !== null && durationLabel(tookMs)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </li>
  )
}

function TicketCard({
  ticket,
  look,
  now,
  isNew,
  onStart,
  onReady,
  onStartDish,
  onReadyDish,
}: {
  ticket: ApiStationTicket
  look: StationLook
  now: number
  isNew: boolean
  onStart: () => void
  onReady: () => void
  onStartDish: (item: ApiOrderItem) => void
  onReadyDish: (item: ApiOrderItem) => void
}) {
  const [bumping, setBumping] = useState(false)
  const order = ticket.order
  // The kitchen works the card dish by dish — every line is its own Start →
  // Ready job with its own cook; the card has no buttons of its own and bumps
  // itself once the last dish is plated. The bar keeps the whole-ticket flow.
  const perDish = look.namesMaker
  // Someone has taken this ticket (or, in the kitchen, any of its dishes) —
  // it's being made, so show who's on it. A brand-new bar ticket offers Start.
  const active = ticket.status === 'preparing'
  // The round's own clock: items added an hour into a meal start at zero, not
  // at the age of the bill they were added to.
  const elapsedMs = Math.max(0, now - new Date(ticket.created_at).getTime())
  const minutes = Math.floor(elapsedMs / 60000)
  // The maker's own clock, running from the moment they took the ticket — what
  // they'll be told they took when they tap Ready, visible while there's still
  // time to do something about it.
  const makingMs = active ? makeMs(ticket, now) : null
  const tier = tierFor(minutes)
  const tableLabel = order.table?.name ?? (order.order_type === 'take_away' ? 'Take Away' : '—')
  // The table has ordered before on this bill — say so, loudly, so this reads
  // as an extra fire for a table already eating.
  const isRepeat = ticket.round_no > 1
  const items = ticket.items.filter((i) => i.quantity > 0)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  // The kitchen's progress line: plated dishes over dishes on the card.
  const readyDishes = items.filter((i) => i.ready_at).length

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
        // The bar makes a ticket as one job, so its colour runs around the
        // whole frame while someone pours. The kitchen's runs around each dish
        // being cooked instead (see DishRow), so its card stays plain.
        active
          ? perDish
            ? 'border-neutral-200'
            : look.activeFrame
          : isNew
            ? 'border-sky-400 ring-2 ring-sky-300'
            : 'border-neutral-200'
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
                the table it came from — someone plating for E1 has to see that
                these guests moved. */}
            {order.transferred_from && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                from {order.transferred_from.name}
              </span>
            )}
            {/* Same table, second fire — the badge is what stops this being
                read as a duplicate of the card next to it. */}
            {isRepeat && (
              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                Added · R{ticket.round_no}
              </span>
            )}
            {!active && isNew && (
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                New
              </span>
            )}
            {active && (
              <span className="flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                {look.activeLabel}
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

      {/* Items — each dish is its own job in the kitchen (tap → name the
          maker → its clock runs → Ready on the dish); a plain list at the bar. */}
      <ul className="mt-3 flex-1 space-y-2 px-4">
        {items.map((item) =>
          perDish ? (
            <DishRow
              key={item.id}
              item={item}
              now={now}
              onStart={() => onStartDish(item)}
              onReady={() => onReadyDish(item)}
            />
          ) : (
            <li key={item.id}>
              <div className="flex items-baseline gap-2.5">
                <span className="min-w-7 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-base font-extrabold tabular-nums text-neutral-900">
                  x{item.quantity}
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
          ),
        )}
      </ul>

      {/* Footer — the kitchen reads progress (the card bumps itself when the
          last dish is plated); the bar keeps Start, then Ready once poured. */}
      <div className="mt-3 px-4 pb-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
          <span>
            {totalItems} item{totalItems === 1 ? '' : 's'}
          </span>
          {/* Everyone on it, not just whoever tapped first — a cook has to be
              able to see from the pass that the card is already shared. */}
          {active && crewLabel(ticket) && (
            <span className="flex min-w-0 items-center gap-1 font-bold text-emerald-600">
              <LuChefHat className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate normal-case">{crewLabel(ticket)}</span>
            </span>
          )}
        </div>
        {perDish ? (
          <div className="flex items-center gap-2.5">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${items.length > 0 ? (readyDishes / items.length) * 100 : 0}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-bold tabular-nums text-neutral-600">
              {readyDishes}/{items.length} dish{items.length === 1 ? '' : 'es'} ready
            </span>
          </div>
        ) : active ? (
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
            {/* The time they're about to be credited with, on the button that
                stops the clock — no surprise once the card is gone. */}
            {makingMs !== null && (
              <span className="tabular-nums font-extrabold text-white/80">
                · {durationLabel(makingMs)}
              </span>
            )}
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

/**
 * One dish on a kitchen card — its own little ticket. Untaken it offers
 * Start; while it cooks it shows its maker and a live clock beside the Ready
 * control; plated it freezes on the time the Chef Performance KPI will read.
 */
function DishRow({
  item,
  now,
  onStart,
  onReady,
}: {
  item: ApiOrderItem
  now: number
  onStart: () => void
  onReady: () => void
}) {
  const ms = dishMs(item, now)
  const done = !!item.ready_at
  const cooking = !done && !!item.started_at

  return (
    <li
      className={`rounded-xl px-3 py-2.5 transition ${
        done
          ? 'border border-emerald-200 bg-emerald-50/70'
          : cooking
            ? // A cook owns this dish — the colour runs around its row until
              // they tap Ready (the class brings its own border and fill).
              'kds-dish-cooking'
            : 'border border-neutral-200 bg-white'
      }`}
    >
      {done ? (
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <LuCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 text-base font-semibold leading-tight text-neutral-500">
            <span className="font-extrabold tabular-nums">x{item.quantity}</span> {item.name}
          </span>
          <span className="flex shrink-0 flex-col items-end leading-tight">
            {ms !== null && (
              <span className="flex items-center gap-1 text-xs font-bold tabular-nums text-emerald-600">
                <LuTimer className="h-3 w-3" />
                {durationLabel(ms)}
              </span>
            )}
            {item.chef?.name && (
              <span className="text-[11px] font-semibold text-neutral-500">{item.chef.name}</span>
            )}
          </span>
        </div>
      ) : cooking ? (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="min-w-7 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-base font-extrabold tabular-nums text-neutral-900">
              x{item.quantity}
            </span>
            <span className="min-w-0 flex-1 text-base font-semibold leading-tight text-neutral-800">
              {item.name}
            </span>
            {/* The dish's own clock, live — what its cook will be credited
                with the moment they tap Ready. */}
            {ms !== null && (
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-emerald-600">
                <LuTimer className="h-3.5 w-3.5" />
                {durationLabel(ms)}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {item.chef?.name ? (
              <span className="flex min-w-0 items-center gap-1 text-xs font-bold text-emerald-700">
                <LuChefHat className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.chef.name}</span>
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onReady}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-[0.98]"
            >
              <LuCheck className="h-4 w-4" />
              Ready
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={onStart} className="flex w-full items-center gap-2.5 text-left">
          <span className="min-w-7 shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-center text-base font-extrabold tabular-nums text-neutral-900">
            x{item.quantity}
          </span>
          <span className="min-w-0 flex-1 text-base font-semibold leading-tight text-neutral-800">
            {item.name}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
            <LuPlay className="h-4 w-4" />
            Start
          </span>
        </button>
      )}
      {item.note && (
        <div className="ml-9 mt-1 flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-700">
          <LuStickyNote className="h-3.5 w-3.5 shrink-0" />
          {item.note}
        </div>
      )}
    </li>
  )
}
