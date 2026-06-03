import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fatal-error">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
          <p className="app-fatal-hint">
            Open{' '}
            <a href="https://sining-neo.github.io/air-draw-3d/">
              https://sining-neo.github.io/air-draw-3d/
            </a>{' '}
            (HTTPS, not a local file). Hard-refresh (Ctrl+Shift+R), then click Enable
            camera.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
