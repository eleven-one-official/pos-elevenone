/**
 * elevenone wordmark. `tone="light"` renders white text for dark headers;
 * `tone="dark"` renders dark text for light headers. The orange "one" and the
 * "11" badge stay constant in both.
 */
export default function ElevenOneLogo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <div className="flex select-none items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-black text-white shadow-sm">
        11
      </span>
      <span
        className={`text-2xl font-bold tracking-tight ${tone === 'dark' ? 'text-neutral-800' : 'text-white'}`}
      >
        eleven<span className="text-primary">one</span>
      </span>
    </div>
  )
}
