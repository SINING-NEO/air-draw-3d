import { Component, type ErrorInfo, type ReactNode } from 'react'

interface SceneErrorBoundaryProps {
  children: ReactNode
}

interface SceneErrorBoundaryState {
  error: Error | null
}

export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('3D scene error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="scene-error">
          <h2>3D view failed to load</h2>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
