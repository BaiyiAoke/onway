import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  maps: [] as {
    handlers: Record<string, () => void>
    remove: ReturnType<typeof vi.fn>
  }[],
}))

// 只替代 WebGL 边界，验证离线反馈、重新连接与实例释放的用户行为。
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    handlers: Record<string, () => void> = {}
    remove = vi.fn()
    constructor() {
      state.maps.push(this)
    }
    addControl() {}
    fitBounds() {}
    resize() {}
    on(name: string, callback: () => void) {
      this.handlers[name] = callback
    }
  },
  Marker: class {
    setLngLat() {
      return this
    }
    setPopup() {
      return this
    }
    addTo() {
      return this
    }
    remove() {}
  },
  Popup: class {
    setDOMContent() {
      return this
    }
  },
  LngLatBounds: class {
    extend() {
      return this
    }
  },
  NavigationControl: class {},
  AttributionControl: class {},
}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'worker.js',
}))

import MapPage from './MapPage'

describe('地图降级与生命周期', () => {
  beforeEach(() => {
    state.maps = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  it('断网后仍可查看地点，重试会释放旧地图', () => {
    const view = render(<MapPage />)
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('alert')).toHaveTextContent('地图暂时无法加载')
    expect(screen.getByRole('heading', { name: '武威' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(state.maps[0].remove).toHaveBeenCalledOnce()
    expect(state.maps).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    view.unmount()
    expect(state.maps[1].remove).toHaveBeenCalledOnce()
  })
})
