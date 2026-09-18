import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { travelFixture } from '../../test/transportFixtures'
import type { TravelMapHandle } from './TravelMap'
import { toAmapPoint, fromAmapPoint } from '../../services/maps/amap'
import AmapTravelMap from './AmapTravelMap'

const state = vi.hoisted(() => ({
  load: vi.fn(),
  lines: [] as {
    index: number
    mode: string
    entry: { result: { geometry: { coordinates: [number, number][] } } }
  }[],
}))
vi.mock('../../services/maps/amap', async (original) => ({
  ...(await original<typeof import('../../services/maps/amap')>()),
  loadAmap: (...args: unknown[]) => state.load(...args),
}))
vi.mock('../../services/routes/RoutesContext', () => ({
  useRoutes: () => ({ state: {}, segments: {} }),
}))
vi.mock('../../services/routes/segmentView', () => ({
  transportLines: () => state.lines,
}))
const maps: FakeMap[] = [],
  markers: FakeMarker[] = [],
  polylines: FakeLine[] = []
class FakeMap {
  handlers: Record<string, (event?: unknown) => void> = {}
  setFitView = vi.fn()
  setZoomAndCenter = vi.fn()
  zoomIn = vi.fn()
  zoomOut = vi.fn()
  add = vi.fn()
  destroy = vi.fn(() => this.container.replaceChildren())
  constructor(
    public container: HTMLElement,
    public options: object,
  ) {
    maps.push(this)
  }
  on(event: string, callback: (event?: unknown) => void) {
    this.handlers[event] = callback
  }
}
class FakeMarker {
  setMap = vi.fn((map: FakeMap | null) => {
    if (!map) this.options.content.remove()
  })
  constructor(
    public options: { map: FakeMap; position: number[]; content: HTMLElement },
  ) {
    options.content.classList.add('amap-marker')
    options.map.container.append(options.content)
    markers.push(this)
  }
}
class FakeLine {
  setMap = vi.fn()
  constructor(public options: { path: number[][]; strokeStyle: string }) {
    polylines.push(this)
  }
}
class FakeInfo {
  handler?: () => void
  constructor(public options: { content: HTMLElement }) {}
  close() {
    this.options.content.remove()
    this.handler?.()
  }
  on(_event: string, callback: () => void) {
    this.handler = callback
  }
  open(map: FakeMap) {
    this.options.content.classList.add('amap-info')
    map.container.append(this.options.content)
  }
}
const sdk = {
  Map: FakeMap,
  Marker: FakeMarker,
  Polyline: FakeLine,
  InfoWindow: FakeInfo,
  Pixel: class {},
}
const settings = {
  provider: 'amap' as const,
  amapJsKey: 'a'.repeat(32),
  securityJsCode: 'b'.repeat(32),
}
beforeEach(() => {
  maps.length = 0
  markers.length = 0
  polylines.length = 0
  state.lines = []
  state.load.mockReset().mockResolvedValue(sdk)
})
async function ready() {
  await waitFor(() => expect(maps).toHaveLength(1))
  act(() => maps[0].handlers.complete())
}
describe('计划高德底图适配', () => {
  it('地点和线路使用同一坐标转换，过滤无效几何，切日期不重建底图', async () => {
    const trip = travelFixture().trips[0]
    state.lines = [
      {
        index: 0,
        mode: 'walking',
        entry: {
          result: {
            geometry: {
              coordinates: [
                [116.4, 39.9],
                [116.42, 39.92],
              ],
            },
          },
        },
      },
      {
        index: 0,
        mode: 'train',
        entry: { result: { geometry: { coordinates: [[116.4, 39.9]] } } },
      },
    ]
    const props = { trip, group: 'day', settings, onEdit: vi.fn() }
    const view = render(<AmapTravelMap {...props} />)
    await ready()
    expect(markers[0].options.position).toEqual(
      toAmapPoint(trip.days[0].places[0].coordinates),
    )
    expect(polylines).toHaveLength(1)
    expect(polylines[0].options.path[0]).toEqual(markers[0].options.position)
    expect(polylines[0].options.strokeStyle).toBe('dashed')
    view.rerender(<AmapTravelMap {...props} group="other" />)
    expect(maps).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: '查看起点' }),
    ).not.toBeInTheDocument()
    view.unmount()
    expect(maps[0].destroy).toHaveBeenCalledOnce()
  })
  it('普通点击不新增；选点转换为 WGS84；标记和拖动不误加地点', async () => {
    const trip = travelFixture().trips[0],
      onPick = vi.fn(),
      onSelect = vi.fn()
    const props = { trip, group: 'day', settings, onEdit: vi.fn(), onSelect }
    const view = render(<AmapTravelMap {...props} />)
    await ready()
    const event = { lnglat: { getLng: () => 116.406, getLat: () => 39.901 } }
    act(() => maps[0].handlers.click(event))
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '查看起点' }))
    expect(onSelect).toHaveBeenCalledWith(trip.days[0].places[0])
    view.rerender(<AmapTravelMap {...props} picking onPick={onPick} />)
    act(() => maps[0].handlers.click(event))
    expect(onPick).toHaveBeenLastCalledWith(fromAmapPoint(116.406, 39.901))
    fireEvent.click(screen.getByRole('button', { name: '查看起点' }))
    expect(onPick).toHaveBeenLastCalledWith(trip.days[0].places[0].coordinates)
    onPick.mockClear()
    act(() => {
      maps[0].handlers.dragend()
      maps[0].handlers.click(event)
    })
    expect(onPick).not.toHaveBeenCalled()
  })
  it('地点聚焦和弹窗编辑可用，关闭的弹窗不会因编辑重新出现', async () => {
    const trip = travelFixture().trips[0],
      onEdit = vi.fn(),
      ref = createRef<TravelMapHandle>()
    const view = render(
      <AmapTravelMap
        trip={trip}
        group="day"
        settings={settings}
        onEdit={onEdit}
        ref={ref}
      />,
    )
    await ready()
    act(() => ref.current!.focusPlace(trip.days[0].places[0]))
    expect(maps[0].setZoomAndCenter).toHaveBeenLastCalledWith(
      13,
      toAmapPoint(trip.days[0].places[0].coordinates),
      false,
      350,
    )
    fireEvent.click(screen.getByRole('button', { name: '编辑地点' }))
    expect(onEdit).toHaveBeenCalledWith(trip.days[0].places[0])
    view.rerender(
      <AmapTravelMap
        trip={{ ...trip, name: '已修改' }}
        group="day"
        settings={settings}
        onEdit={onEdit}
        ref={ref}
      />,
    )
    expect(
      screen.queryByRole('button', { name: '编辑地点' }),
    ).not.toBeInTheDocument()
  })
  it('卸载后晚到 SDK 不创建地图，失败后可重试', async () => {
    let resolve!: (value: unknown) => void
    state.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const props = {
      trip: travelFixture().trips[0],
      group: 'day',
      settings,
      onEdit: vi.fn(),
    }
    const view = render(<AmapTravelMap {...props} />)
    view.unmount()
    await act(async () => resolve(sdk))
    expect(maps).toHaveLength(0)
    state.load
      .mockRejectedValueOnce(new Error('高德加载失败'))
      .mockResolvedValueOnce(sdk)
    render(<AmapTravelMap {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('高德加载失败')
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
    await ready()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
