import { Component, type ErrorInfo, type ReactNode } from 'react'

// Top-level render-error containment (v0.2.0). Any uncaught error in the tree
// previously blanked the entire window with no way back short of restarting
// the app; now it lands here, gets forwarded to the (opt-in) crash reporter,
// and offers a reload. Deliberately a class component — error boundaries have
// no hook equivalent.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    window.kaseki.crash
      .report({
        name: error.name,
        message: error.message,
        stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`
      })
      .catch(() => {})
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-pane" role="alert">
        <h1 className="crash-title">Something broke.</h1>
        <p className="crash-body">
          Kaseki hit an error it couldn’t recover from. Your data is safe on disk — the interface
          just needs a restart.
        </p>
        <p className="crash-detail">{this.state.error.message}</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>
          Reload Kaseki
        </button>
      </div>
    )
  }
}
