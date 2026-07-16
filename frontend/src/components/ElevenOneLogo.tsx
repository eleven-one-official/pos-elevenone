/**
 * elevenone Kitchen brand wordmark (text only, no image).
 *
 * `tone="light"` targets dark headers (white text); `tone="dark"` targets
 * light headers (dark text). The "one" accent always uses the primary color.
 */
export default function ElevenOneLogo({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`select-none text-2xl font-bold tracking-tight ${
        tone === 'dark' ? 'text-neutral-800' : 'text-white'
      }`}
    >
      eleven<span className="text-primary">one</span>
    </span>
  )
}
