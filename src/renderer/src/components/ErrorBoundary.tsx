import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-10">
        <div className="max-w-lg rounded-2xl border border-bad/40 bg-panel p-6">
          <h1 className="font-display text-[20px] font-semibold">This screen hit an error</h1>
          <p className="mt-2 select-text break-words font-mono text-[12px] text-muted">{this.state.error.message}</p>
          <button
            onClick={() => location.reload()}
            className="mt-5 h-9 rounded-lg bg-gradient-to-r from-violet to-cyan px-4 text-[13px] font-semibold text-void"
          >
            Reload FConnect
          </button>
        </div>
      </div>
    )
  }
}
