import { Component, type ErrorInfo, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// App-wide error boundary — a render crash anywhere below shows a recoverable
// screen instead of a white page mid-shift. Reload restores the session from
// the stored token, so the cashier lands back where they can keep working.
// ---------------------------------------------------------------------------

type State = { error: Error | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('POS crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">Something went wrong</h1>
        <p className="max-w-md text-sm text-neutral-600">
          The screen hit an unexpected error. Reload to continue — you stay signed in, and
          orders already sent to the kitchen or paid are safe on the server.
        </p>
        <p className="max-w-md break-all rounded-lg bg-rose-50 px-4 py-2 text-xs text-rose-600">
          {this.state.error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-primary px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-primary-dark"
        >
          Reload
        </button>
      </div>
    )
  }
}
