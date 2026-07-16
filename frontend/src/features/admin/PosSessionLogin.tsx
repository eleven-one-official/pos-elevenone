import { LuChevronLeft } from 'react-icons/lu'

// ---------------------------------------------------------------------------
// POS session login — the Odoo-style full-screen gate shown after pressing
// "Continue selling" on a dashboard card: a muted low-poly backdrop with a
// centered card offering badge scan or cashier selection. Pure UI for now;
// "Select Cashier" will later open the cashier roster + PIN dialog.
// ---------------------------------------------------------------------------

// Deterministic EAN-ish barcode artwork: main bars + a dashed fringe below.
const BAR_WIDTHS = [4, 2, 3, 1, 4, 2, 1, 3, 2, 4]
const BARS = (() => {
  let x = 0
  return BAR_WIDTHS.map((w) => {
    const bar = { x, w }
    x += w + 2
    return bar
  })
})()
const BARCODE_WIDTH = BARS[BARS.length - 1].x + BARS[BARS.length - 1].w

export default function PosSessionLogin({
  name,
  onBack,
}: {
  name: string
  onBack: () => void
}) {
  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[#7d6e73]">
      {/* Low-poly facets, Odoo POS backdrop style */}
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1920 960"
        preserveAspectRatio="xMidYMid slice"
      >
        <polygon points="0,0 900,0 300,500" fill="#ffffff" opacity="0.03" />
        <polygon points="1920,0 1920,600 1100,150" fill="#000000" opacity="0.04" />
        <polygon points="0,960 700,960 200,400" fill="#000000" opacity="0.05" />
        <polygon points="1920,960 900,960 1500,420" fill="#ffffff" opacity="0.03" />
        <polygon points="400,0 1200,300 700,700" fill="#ffffff" opacity="0.025" />
        <polygon points="1300,960 1920,700 1500,300" fill="#000000" opacity="0.03" />
        <polygon points="0,300 500,100 300,700" fill="#ffffff" opacity="0.02" />
      </svg>

      {/* Escape hatch back to the dashboard — kept discreet on purpose */}
      <button
        type="button"
        onClick={onBack}
        className="absolute left-3 top-3 flex items-center gap-0.5 rounded px-2 py-1 text-sm text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <LuChevronLeft className="h-4 w-4" />
        Back
      </button>

      <div className="relative w-[550px] max-w-[92vw] rounded-[3px] bg-[#f1f0ef] px-10 pb-16 pt-12 text-center shadow-[0_3px_14px_rgba(0,0,0,0.3)]">
        <h1 className="text-[21px] font-semibold text-[#5f5e5a]">
          Log in to <span className="text-[25px] font-bold text-[#3f3c39]">{name}</span>
        </h1>

        <div className="mt-12 flex items-center justify-center gap-12">
          <div className="flex flex-col items-center">
            <svg
              width="82"
              height="58"
              viewBox={`0 0 ${BARCODE_WIDTH} 52`}
              preserveAspectRatio="none"
              className="text-[#1f1f1f]"
            >
              {BARS.map((b) => (
                <rect key={b.x} x={b.x} y="0" width={b.w} height="42" fill="currentColor" />
              ))}
              {Array.from({ length: Math.floor(BARCODE_WIDTH / 4) + 1 }, (_, i) => (
                <rect key={i} x={i * 4} y="46" width="2" height="6" fill="currentColor" />
              ))}
            </svg>
            <span className="mt-2 text-[13px] text-[#8b8a85]">Scan your badge</span>
          </div>

          <span className="text-[13px] text-[#8b8a85]">or</span>

          <button
            type="button"
            className="rounded-[3px] border border-[#c9c8c5] bg-[#e8e7e5] px-7 py-5 text-[15px] text-[#4c4b47] shadow-sm transition hover:bg-[#dedddb]"
          >
            Select Cashier
          </button>
        </div>
      </div>
    </div>
  )
}
