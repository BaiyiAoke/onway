import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TravelProvider, useTravel } from '../../services/travel/TravelContext'
import {
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from '../../services/travel/repository'
import { RouteController } from '../../services/routes/controller'
import { RoutesProvider } from '../../services/routes/RoutesContext'
import {
  RouteCacheRepository,
  ROUTE_CACHE_KEY,
} from '../../services/routes/repository'
import type { LocalStore } from '../../services/storage/types'
import type { TravelWorkspace } from '../../services/travel/types'
import type { RouteResult } from '../../services/routes/types'
import { DayRouteSummary, RouteLeg } from './DayRouteSummary'

function fixture() {
  const workspace: TravelWorkspace = {
    schemaVersion: 1,
    activeTripId: 'trip',
    trips: [
      {
        id: 'trip',
        name: '公开测试行程',
        startDate: null,
        unscheduledPlaces: [],
        days: [
          {
            id: 'day',
            places: [
              {
                id: 'a',
                name: '兰州',
                note: '',
                coordinates: {
                  longitude: 103.8343,
                  latitude: 36.0611,
                  crs: 'WGS84',
                },
              },
              {
                id: 'b',
                name: '武威',
                note: '',
                coordinates: {
                  longitude: 102.638,
                  latitude: 37.929,
                  crs: 'WGS84',
                },
              },
            ],
          },
        ],
      },
    ],
  }
  const values = new Map([[TRAVEL_WORKSPACE_KEY, JSON.stringify(workspace)]])
  const store: LocalStore = {
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  const result: RouteResult = {
    distanceMeters: 270000,
    durationSeconds: 10800,
    geometry: {
      type: 'LineString',
      coordinates: [
        [103.8343, 36.0611],
        [102.638, 37.929],
      ],
    },
    legs: [
      {
        fromIndex: 0,
        toIndex: 1,
        distanceMeters: 270000,
        durationSeconds: 10800,
      },
    ],
    source: 'OSRM · FOSSGIS / OpenStreetMap',
    calculatedAt: '2026-09-16T01:00:00Z',
  }
  const service = { calculateDrivingRoute: vi.fn(async () => result) }
  const controller = new RouteController(
    new RouteCacheRepository(store),
    service,
  )
  return {
    values,
    store,
    controller,
    service,
    repository: new TravelRepository(store),
  }
}
function Content({ editable = true }: { editable?: boolean }) {
  const { activeTrip: trip, run } = useTravel()
  if (!trip) return null
  return (
    <>
      <DayRouteSummary trip={trip} day={trip.days[0]} editable={editable} />
      <RouteLeg tripId={trip.id} day={trip.days[0]} toIndex={1} />
      <button
        onClick={() =>
          void run({
            type: 'reorderPlace',
            tripId: trip.id,
            placeId: 'b',
            direction: -1,
          })
        }
      >
        交换顺序
      </button>
    </>
  )
}
function open(source: ReturnType<typeof fixture>, editable = true) {
  return render(
    <MemoryRouter>
      <TravelProvider repository={source.repository}>
        <RoutesProvider controller={source.controller}>
          <Content editable={editable} />
        </RoutesProvider>
      </TravelProvider>
    </MemoryRouter>,
  )
}

describe('路线摘要与编辑状态联动', () => {
  it('只在点击后计算，展示总计与分段；排序立即隐藏旧结果，不自动联网', async () => {
    const source = fixture()
    open(source)
    const calculate = await screen.findByRole('button', {
      name: '计算自驾路线',
    })
    await waitFor(() => expect(calculate).toBeEnabled())
    expect(source.service.calculateDrivingRoute).not.toHaveBeenCalled()
    fireEvent.click(calculate)
    await screen.findByText('270.0 公里', { selector: 'strong' })
    expect(screen.getByText(/从 兰州/)).toHaveTextContent('约 3 小时')
    expect(screen.getByText(/已保存在本机/)).toBeVisible()
    expect(source.values.has(ROUTE_CACHE_KEY)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '交换顺序' }))
    await screen.findByText(/路线待更新/)
    expect(
      screen.queryByText('270.0 公里', { selector: 'strong' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/从 兰州/)).not.toBeInTheDocument()
    expect(source.service.calculateDrivingRoute).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '重新计算' }))
    await waitFor(() =>
      expect(source.service.calculateDrivingRoute).toHaveBeenCalledTimes(2),
    )
    await screen.findByText(/从 武威/)
  })
  it('保存失败明确标记未保存，重试保存保持结果且不重新请求', async () => {
    const source = fixture()
    open(source)
    const calculate = await screen.findByRole('button', {
      name: '计算自驾路线',
    })
    await waitFor(() => expect(calculate).toBeEnabled())
    vi.mocked(source.store.set).mockRejectedValueOnce(new Error('磁盘已满'))
    fireEvent.click(calculate)
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('本地缓存保存失败')
    expect(screen.getByText(/尚未保存到本机/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重试保存路线' }))
    await screen.findByText(/已保存在本机/)
    expect(source.service.calculateDrivingRoute).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('手动重新计算失败仍标明上次有效估算，保留缓存', async () => {
    const source = fixture()
    open(source)
    const calculate = await screen.findByRole('button', {
      name: '计算自驾路线',
    })
    await waitFor(() => expect(calculate).toBeEnabled())
    fireEvent.click(calculate)
    await screen.findByText(/已保存在本机/)
    const before = source.values.get(ROUTE_CACHE_KEY)
    source.service.calculateDrivingRoute.mockRejectedValueOnce(
      new Error('无法连接路线服务'),
    )
    fireEvent.click(screen.getByRole('button', { name: '重新计算' }))
    await screen.findByRole('alert')
    expect(screen.getByText(/显示上次保存的估算/)).toBeVisible()
    expect(source.values.get(ROUTE_CACHE_KEY)).toBe(before)
  })
  it('今天摘要只展示已存数据，不主动计算；无结果时引导计划页', async () => {
    const source = fixture()
    open(source, false)
    await screen.findByRole('link', { name: '前往计划页计算' })
    expect(
      screen.queryByRole('button', { name: /计算/ }),
    ).not.toBeInTheDocument()
    expect(source.service.calculateDrivingRoute).not.toHaveBeenCalled()
  })
})
