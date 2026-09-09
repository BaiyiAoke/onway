import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <section className="errorPanel" role="alert">
          <h1>页面暂时无法打开</h1>
          <p>本地保存的数据不会因此被清除。</p>
          <button
            className="primaryButton"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </section>
      )
    return this.props.children
  }
}
