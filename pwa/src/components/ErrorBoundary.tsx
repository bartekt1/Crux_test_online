import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-svh gap-4 p-6 text-center">
          <p className="text-5xl">⚠️</p>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Coś poszło nie tak</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-2xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors"
          >
            Odśwież aplikację
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
