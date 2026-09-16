import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CachedRoute } from '../../services/routes/model'
import { routeFingerprint, routeKey } from '../../services/routes/model'
import type { Trip } from '../../services/travel/types'
import type { PlaceDraft } from '../travel/PlaceEditor'

const state = vi.hoisted(() => ({
  entries: {} as Record<string, CachedRoute>,
  maps: [] as {
    handlers: Record<string, (event?: unknown) => void>
    sources: Map<string, { data: unknown; setData: ReturnType<typeof vi.fn> }>
    addLayer: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    fitBounds: ReturnType<typeof vi.fn>
    easeTo: ReturnType<typeof vi.fn>
    container: HTMLElement
  }[],
  markers: [] as { element: HTMLElement; remove: ReturnType<typeof vi.fn> }[],
  travel: {
    activeTrip: undefined as Trip | undefined,
    status: 'ready',
    group: 'all',
    setGroup: vi.fn(),
  },
}))

// 只替代 WebGL 和共享编辑器边界，保留 DOM 事件冒泡及地图实例生命周期。
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class {
    handlers: Record<string, (event?: unknown) => void> = {}
    container: HTMLElement
    sources = new Map<
      string,
      { data: unknown; setData: ReturnType<typeof vi.fn> }
    >()
    addSource(id: string, options: { data: unknown }) {
      const source = {
        data: options.data,
        setData: vi.fn(async (data: unknown) => {
          source.data = data
        }),
      }
      this.sources.set(id, source)
    }
    getSource(id: string) {
      return this.sources.get(id)
    }
    addLayer = vi.fn()
    fitBounds = vi.fn()
    easeTo = vi.fn()
    dispatchClick = (event: MouseEvent) => {
      this.handlers.click?.({
        lngLat: { lng: 103, lat: 36 },
        originalEvent: event,
      })
    }
    remove = vi.fn(() =>
      this.container.removeEventListener('click', this.dispatchClick),
    )
    constructor(options: { container: HTMLElement }) {
      this.container = options.container
      this.container.setAttribute('data-testid', 'map-canvas')
      this.container.addEventListener('click', this.dispatchClick)
      state.maps.push(this)
    }
    addControl() {}
    resize() {}
    on(name: string, callback: (event?: unknown) => void) {
      this.handlers[name] = callback
    }
  },
  Marker: class {
    element: HTMLElement
    remove = vi.fn(() => this.element.remove())
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
      this.element.classList.add('maplibregl-marker')
      state.markers.push(this)
    }
    setLngLat() {
      return this
    }
    addTo(map: { container: HTMLElement }) {
      map.container.append(this.element)
      return this
    }
  },
  Popup: class {
    element = document.createElement('div')
    handlers: Record<string, () => void> = {}
    constructor() {
      this.element.className = 'maplibregl-popup'
    }
    setDOMContent(content: HTMLElement) {
      this.element.append(content)
      return this
    }
    setLngLat() {
      return this
    }
    addTo(map: { container: HTMLElement }) {
      map.container.append(this.element)
      return this
    }
    on(name: string, callback: () => void) {
      this.handlers[name] = callback
      return this
    }
    remove() {
      this.element.remove()
      this.handlers.close?.()
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
vi.mock('../../services/travel/TravelContext', () => ({
  useTravel: () => state.travel,
}))
vi.mock('../../components/BackHandler', () => ({ useBackHandler: vi.fn() }))
vi.mock('../travel/TravelToolbar', () => ({
  TravelToolbar: () => <div>行程筛选</div>,
}))
vi.mock('../travel/PlaceEditor', () => ({
  PlaceEditor: ({
    draft,
    onClose,
    onPickLocation,
  }: {
    draft: PlaceDraft
    onClose: () => void
    onPickLocation: (draft: PlaceDraft) => void
  }) => (
    <div role="dialog" aria-label="地点编辑">
      <p>{draft.name || '未命名地点'}</p>
      <p>{draft.note}</p>
      <p>安排：{draft.dayId ?? '未安排'}</p>
      <button onClick={onClose}>取消编辑</button>
      <button
        onClick={() =>
          onPickLocation({
            ...draft,
            name: '未保存的名称',
            note: '未保存的备注',
          })
        }
      >
        重新选点
      </button>
    </div>
  ),
}))

import MapPage from './MapPage'

function exampleTrip(): Trip {
  return {
    id: 'trip-1',
    name: '河西走廊',
    startDate: null,
    days: [
      {
        id: 'day-1',
        places: [
          {
            id: 'place-1',
            name: '武威',
            note: '先看博物馆',
            coordinates: { longitude: 102.638, latitude: 37.929, crs: 'WGS84' },
          },
        ],
      },
    ],
    unscheduledPlaces: [],
  }
}
function page(path = '/map') {
  return (
    <MemoryRouter initialEntries={[path]}>
      <MapPage />
    </MemoryRouter>
  )
}

describe('地图编辑与生命周期', () => {
  beforeEach(() => {
    state.entries = {}
    state.maps = []
    state.markers = []
    state.travel.activeTrip = exampleTrip()
    state.travel.group = 'all'
    state.travel.status = 'ready'
    state.travel.setGroup.mockReset()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  it('地点保存和筛选更新标记，保留同一个地图实例', () => {
    const view = render(page())
    expect(screen.getByRole('button', { name: '查看武威' })).toBeVisible()
    const trip = exampleTrip()
    trip.days[0].places[0].name = '武威文庙'
    state.travel.activeTrip = trip
    view.rerender(page())
    expect(
      screen.queryByRole('button', { name: '查看武威' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看武威文庙' })).toBeVisible()
    state.travel.group = 'unscheduled'
    view.rerender(page())
    expect(
      screen.queryByRole('button', { name: '查看武威文庙' }),
    ).not.toBeInTheDocument()
    expect(state.maps).toHaveLength(1)
    expect(state.maps[0].remove).not.toHaveBeenCalled()
  })

  it('已有标记点击只显示详情，空白点取消后没有残留临时标记', () => {
    render(page())
    act(() => state.maps[0].handlers.load())
    fireEvent.click(screen.getByRole('button', { name: '查看武威' }))
    expect(screen.getByRole('button', { name: '编辑地点' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.getByRole('dialog', { name: '地点编辑' })).toHaveTextContent(
      '未命名地点',
    )
    expect(screen.getByLabelText('尚未保存的地点')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    expect(screen.queryByLabelText('尚未保存的地点')).not.toBeInTheDocument()
    expect(state.travel.activeTrip?.days[0].places).toHaveLength(1)
  })

  it('重新选点以及取消选点均保留未保存的表单内容', () => {
    render(page())
    act(() => state.maps[0].handlers.load())
    fireEvent.click(screen.getByRole('button', { name: '编辑武威' }))
    fireEvent.click(screen.getByRole('button', { name: '重新选点' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消选点' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的名称')
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的备注')
    fireEvent.click(screen.getByRole('button', { name: '重新选点' }))
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的名称')
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的备注')
    expect(
      state.travel.activeTrip?.days[0].places[0].coordinates.longitude,
    ).toBe(102.638)
  })

  it('拖动不误新增，空白点默认使用当前日期筛选', () => {
    state.travel.group = 'day-1'
    render(page())
    act(() => state.maps[0].handlers.load())
    const time = vi.spyOn(performance, 'now').mockReturnValue(1000)
    act(() => state.maps[0].handlers.dragend())
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    time.mockReturnValue(1250)
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.getByRole('dialog')).toHaveTextContent('安排：day-1')
    time.mockRestore()
  })
  it('底图未加载或失败时不接收选点，地点列表仍能编辑', () => {
    render(page())
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => state.maps[0].handlers.load())
    fireEvent(window, new Event('offline'))
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('尚未保存的地点')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑武威' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('武威')
    fireEvent.click(screen.getByRole('button', { name: '重新选点' }))
    fireEvent.click(screen.getByTestId('map-canvas'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消选点' })).toBeVisible()
  })

  it('重新读取同一行程时保留完整选点草稿', () => {
    const view = render(page())
    act(() => state.maps[0].handlers.load())
    fireEvent.click(screen.getByRole('button', { name: '编辑武威' }))
    fireEvent.click(screen.getByRole('button', { name: '重新选点' }))
    state.travel.status = 'loading'
    view.rerender(page())
    state.travel.activeTrip = exampleTrip()
    state.travel.status = 'ready'
    view.rerender(page())
    fireEvent.click(screen.getByRole('button', { name: '取消选点' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的名称')
    expect(screen.getByRole('dialog')).toHaveTextContent('未保存的备注')
    expect(state.maps).toHaveLength(1)
  })
  it('断网后可编辑已有地点，重试和离开页面释放旧地图及标记', () => {
    const view = render(page())
    fireEvent(window, new Event('offline'))
    expect(screen.getByRole('alert')).toHaveTextContent('地图暂时无法加载')
    fireEvent.click(screen.getByRole('button', { name: '编辑武威' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('武威')
    fireEvent.click(screen.getByRole('button', { name: '取消编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(state.maps[0].remove).toHaveBeenCalledOnce()
    expect(state.maps).toHaveLength(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '查看武威' })).toHaveLength(1)
    act(() => state.maps[1].handlers.load())
    view.unmount()
    expect(state.maps[1].remove).toHaveBeenCalledOnce()
    expect(
      state.markers.every((marker) => marker.remove.mock.calls.length === 1),
    ).toBe(true)
  })

  it('带地点参数进入时在加载后定位；无行程不写入示例地点', () => {
    const view = render(page('/map?place=place-1'))
    expect(
      screen.queryByRole('button', { name: '编辑地点' }),
    ).not.toBeInTheDocument()
    act(() => state.maps[0].handlers.load())
    expect(screen.getByRole('button', { name: '编辑地点' })).toBeVisible()
    expect(state.maps[0].easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [102.638, 37.929] }),
    )
    state.travel.activeTrip = undefined
    view.rerender(page('/map?place=place-1'))
    expect(screen.getByRole('link', { name: '去创建行程' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '查看武威' }),
    ).not.toBeInTheDocument()
    expect(state.maps).toHaveLength(1)
  })
})

vi.mock('../../services/routes/RoutesContext', () => ({
  useRoutes: () => ({
    state: {
      status: 'ready',
      entries: state.entries,
      operations: {},
      error: null,
    },
    calculate: vi.fn(),
    retrySave: vi.fn(),
    reload: vi.fn(),
  }),
}))

it('按天独立画线，全部不连接跨天，失效与筛选清空路线但不重建地图', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  state.travel.status = 'ready'
  state.markers = []
  const trip = exampleTrip()
  trip.days[0].places.push({
    ...trip.days[0].places[0],
    id: 'place-2',
    name: '张掖',
    coordinates: { longitude: 100.4498, latitude: 38.9259, crs: 'WGS84' },
  })
  trip.days.push({
    id: 'day-2',
    places: trip.days[0].places.map((p) => ({ ...p, id: p.id + '-other' })),
  })
  state.travel.activeTrip = trip
  state.travel.group = 'all'
  state.maps = []
  state.entries = Object.fromEntries(
    trip.days.map((day) => [
      routeKey(trip.id, day.id),
      {
        tripId: trip.id,
        dayId: day.id,
        fingerprint: routeFingerprint(day),
        result: {
          geometry: {
            type: 'LineString' as const,
            coordinates: day.places.map(
              (p) =>
                [p.coordinates.longitude, p.coordinates.latitude] as [
                  number,
                  number,
                ],
            ),
          },
          distanceMeters: 200000,
          durationSeconds: 7200,
          source: '测试路线',
          calculatedAt: '2026-09-16T01:00:00Z',
          legs: [
            {
              fromIndex: 0,
              toIndex: 1,
              distanceMeters: 200000,
              durationSeconds: 7200,
            },
          ],
        },
      },
    ]),
  )
  const view = render(page())
  act(() => state.maps[0].handlers.load())
  const data = () =>
    state.maps[0].sources.get('onway-driving-routes')?.data as {
      features: unknown[]
    }
  expect(data().features).toHaveLength(2)
  state.travel.group = 'day-1'
  view.rerender(page())
  expect(data().features).toHaveLength(1)
  const changed = structuredClone(trip)
  changed.days[0].places.reverse()
  state.travel.activeTrip = changed
  view.rerender(page())
  expect(data().features).toHaveLength(0)
  expect(screen.getByText(/路线待更新/)).toBeVisible()
  state.travel.group = 'unscheduled'
  view.rerender(page())
  expect(data().features).toHaveLength(0)
  expect(state.maps).toHaveLength(1)
  expect(state.maps[0].addLayer).toHaveBeenCalledTimes(2)
})
