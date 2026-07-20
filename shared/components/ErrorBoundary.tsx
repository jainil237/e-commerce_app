'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * W-09. Next's route-level app/error.tsx only catches errors during
 * server rendering and data fetching for that route — it does not catch
 * errors thrown inside client-side event handlers or effects, which is
 * where most of this codebase's fetch failures land. Neither app had any
 * component-level boundary.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--text-secondary, #52525B)',
            }}
          >
            <p>Something went wrong. Try refreshing the page.</p>
          </div>
        )
      )
    }
    return this.props.children
  }
}
