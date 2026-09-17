import { defaultCategories } from '../travel/model'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalStore } from '../storage/types'
import { NOTE_KEY } from '../storage/types'
import type { TripDay, TravelWorkspace } from '../travel/types'
import {
  ROUTE_SOURCE,
  routeFingerprint,
  routeKey,
  matchesRoute,
  type CachedRoute,
} from './model'
import { RouteCacheRepository, ROUTE_CACHE_KEY } from './repository'
import { OsrmRouteService, parseOsrmResponse } from './osrm'
import { RouteController } from './controller'

const points = [
  { longitude: 103.8343, latitude: 36.0611, crs: 'WGS84' as const },
  { longitude: 102.638, latitude: 37.929, crs: 'WGS84' as const },
]
function response() {
  return {
    code: 'Ok',
    waypoints: points.map(() => ({ distance: 2 })),
    routes: [
      {
        distance: 270000,
        duration: 10800,
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [p.longitude, p.latitude]),
        },
        legs: [{ distance: 270000, duration: 10800 }],
      },
    ],
  }
}
function day(): TripDay {
  return {
    id: 'day',
    places: points.map((coordinates, i) => ({
      id: 'place' + i,
      name: '地点' + i,
      note: '',
      coordinates: { ...coordinates },
    })),
  }
}
function workspace(): TravelWorkspace {
  return {
    schemaVersion: 4,
    libraryPlaces: [],
    categories: defaultCategories(),
    activeTripId: 'trip',
    trips: [
      {
        id: 'trip',
        name: '公开示例',
        startDate: null,
        days: [day(), { id: 'other-day', places: [] }],
        unscheduledPlaces: [],
      },
    ],
  }
}
function entry(): CachedRoute {
  return {
    tripId: 'trip',
    dayId: 'day',
    fingerprint: routeFingerprint(day()),
    result: parseOsrmResponse(response(), 2),
  }
}
function memory() {
  const values = new Map<string, string>()
  const store: LocalStore = {
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  return { values, store }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('OSRM 请求与真实结果边界', () => {
  it('按顺序发送全部途经点、限制吸附距离，正确映射多个分段', async () => {
    const data = response()
    data.waypoints.push({ distance: 5 })
    data.routes[0].legs.push({ distance: 120000, duration: 3600 })
    data.routes[0].distance += 120000
    data.routes[0].duration += 3600
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(data)))
    const result = await new OsrmRouteService(request).calculateDrivingRoute([
      ...points,
      points[0],
    ])
    const url = new URL(String(request.mock.calls[0][0]))
    expect(decodeURIComponent(url.pathname)).toContain(
      '103.8343,36.0611;102.638,37.929;103.8343,36.0611',
    )
    expect(url.searchParams.get('radiuses')).toBe('1000;1000;1000')
    expect(url.searchParams.get('alternatives')).toBe('false')
    expect(result.legs[1]).toEqual({
      fromIndex: 1,
      toIndex: 2,
      distanceMeters: 120000,
      durationSeconds: 3600,
    })
    expect(result.source).toBe(ROUTE_SOURCE)
  })
  it.each([
    [{ code: 'NoSegment' }, '1 公里'],
    [{ code: 'NoRoute' }, '没有连通'],
    [{ code: 'TooBig' }, '数量'],
    [
      { ...response(), waypoints: [{ distance: 1001 }, { distance: 0 }] },
      '相距过远',
    ],
    [
      { ...response(), routes: [{ ...response().routes[0], legs: [] }] },
      '分段不完整',
    ],
    [
      { ...response(), routes: [{ ...response().routes[0], distance: -1 }] },
      '不完整',
    ],
    [
      {
        ...response(),
        routes: [
          {
            ...response().routes[0],
            geometry: {
              type: 'LineString',
              coordinates: [
                [999, 35],
                [104, 36],
              ],
            },
          },
        ],
      },
      '不完整',
    ],
  ])('拒绝不可用或畸形路线，不编造距离：%j', (body, message) => {
    expect(() => parseOsrmResponse(body, 2)).toThrow(message)
  })
  it('串行请求且开始间隔至少 1 秒，取消排队请求不访问服务', async () => {
    vi.useFakeTimers()
    const first = deferred<Response>()
    const request = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async () => new Response(JSON.stringify(response())))
    const service = new OsrmRouteService(request)
    const one = service.calculateDrivingRoute(points)
    const controller = new AbortController()
    const cancelled = service.calculateDrivingRoute(points, controller.signal)
    const rejected = expect(cancelled).rejects.toMatchObject({
      name: 'AbortError',
    })
    const two = service.calculateDrivingRoute(points)
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledTimes(1)
    controller.abort()
    first.resolve(new Response(JSON.stringify(response())))
    await one
    await rejected
    await vi.advanceTimersByTimeAsync(999)
    expect(request).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await two
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('20 秒超时、限流和断网只报错，不自动重试', async () => {
    vi.useFakeTimers()
    const request = vi.fn<typeof fetch>(
      (_, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const promise = new OsrmRouteService(request).calculateDrivingRoute(points)
    const checked = expect(promise).rejects.toThrow('20 秒')
    await vi.advanceTimersByTimeAsync(20_001)
    await checked
    expect(request).toHaveBeenCalledOnce()
    vi.useRealTimers()
    const rateLimited = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 429 }))
    await expect(
      new OsrmRouteService(rateLimited).calculateDrivingRoute(points),
    ).rejects.toThrow('稍后手动重试')
    const offline = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      new OsrmRouteService(offline).calculateDrivingRoute(points),
    ).rejects.toThrow('检查网络')
    expect(offline).toHaveBeenCalledOnce()
  })
})

describe('缓存、失效及晚到响应', () => {
  it('改名、备注、出发日期不失效；顺序、坐标、增删及跨天移动均失效', () => {
    const original = entry()
    const renamed = day()
    renamed.places[0].name = '新名称'
    renamed.places[0].note = '新备注'
    expect(matchesRoute(original, renamed)).toBe(true)
    const reverse = day()
    reverse.places.reverse()
    const coordinate = day()
    coordinate.places[0].coordinates.longitude += 0.01
    const removed = day()
    removed.places.pop()
    const added = day()
    added.places.push({ ...added.places[0], id: 'new' })
    for (const changed of [reverse, coordinate, removed, added])
      expect(matchesRoute(original, changed)).toBe(false)
    expect(routeKey('trip2', 'day')).not.toBe(routeKey('trip', 'day'))
  })
  it('重启读取每一天最近一次成功结果，保留个人备注和旅行原文，缓存独立版本', async () => {
    const { store, values } = memory()
    values.set(NOTE_KEY, '旧个人备注')
    values.set('travel.workspace', JSON.stringify(workspace()))
    const originalTravel = values.get('travel.workspace')
    const repo = new RouteCacheRepository(store)
    expect((await repo.load()).entries).toEqual([])
    expect(store.set).not.toHaveBeenCalled()
    const saved = entry()
    await repo.save(saved, [routeKey('trip', 'day')], () => true)
    const newer = {
      ...saved,
      result: { ...saved.result, distanceMeters: 275000 },
    }
    await repo.save(newer, [routeKey('trip', 'day')], () => true)
    expect((await new RouteCacheRepository(store).load()).entries).toEqual([
      newer,
    ])
    expect(values.get(NOTE_KEY)).toBe('旧个人备注')
    expect(values.get('travel.workspace')).toBe(originalTravel)
  })
  it.each(['broken', '{"schemaVersion":99,"entries":[]}'])(
    '损坏缓存不自动覆盖，也不影响旅行数据：%s',
    async (raw) => {
      const { store, values } = memory()
      values.set(ROUTE_CACHE_KEY, raw)
      const repo = new RouteCacheRepository(store)
      await expect(repo.load()).rejects.toThrow('原数据已保留')
      await expect(repo.save(entry(), [], () => true)).rejects.toThrow(
        '原数据已保留',
      )
      expect(values.get(ROUTE_CACHE_KEY)).toBe(raw)
    },
  )
  it('输入改变、删除天或切换行程时丢弃晚到结果', async () => {
    for (const mode of ['reorder', 'delete', 'switch']) {
      const { store } = memory()
      const pending = deferred<ReturnType<typeof parseOsrmResponse>>()
      const service = { calculateDrivingRoute: vi.fn(() => pending.promise) }
      const controller = new RouteController(
        new RouteCacheRepository(store),
        service,
      )
      const travel = workspace()
      controller.updateWorkspace(travel, true)
      await controller.load()
      const calculating = controller.calculate('trip', 'day')
      const changed = structuredClone(travel)
      if (mode === 'reorder') changed.trips[0].days[0].places.reverse()
      if (mode === 'delete') changed.trips[0].days.shift()
      if (mode === 'switch') changed.activeTripId = null
      controller.updateWorkspace(changed, true)
      pending.resolve(entry().result)
      await calculating
      expect(store.set).not.toHaveBeenCalled()
      expect(controller.getSnapshot().entries).toEqual({})
      expect(controller.getSnapshot().operations).toEqual({})
    }
  })
  it('缓存保存失败保留计算结果，重试保存不重复联网', async () => {
    const { store } = memory()
    const service = { calculateDrivingRoute: vi.fn(async () => entry().result) }
    const controller = new RouteController(
      new RouteCacheRepository(store),
      service,
    )
    controller.updateWorkspace(workspace(), true)
    await controller.load()
    expect(service.calculateDrivingRoute).not.toHaveBeenCalled()
    vi.mocked(store.set).mockRejectedValueOnce(new Error('磁盘写入失败'))
    await controller.calculate('trip', 'day')
    const key = routeKey('trip', 'day')
    expect(controller.getSnapshot().operations[key].stage).toBe('unsaved')
    expect(controller.getSnapshot().entries[key]).toBeUndefined()
    await controller.retrySave('trip', 'day')
    expect(controller.getSnapshot().entries[key].result.distanceMeters).toBe(
      270000,
    )
    expect(controller.getSnapshot().operations[key]).toBeUndefined()
    expect(service.calculateDrivingRoute).toHaveBeenCalledOnce()
    const renamed = workspace()
    renamed.trips[0].days[0].places[0].name = '更新名称'
    renamed.trips[0].startDate = '2026-09-30'
    controller.updateWorkspace(renamed, true)
    expect(
      matchesRoute(
        controller.getSnapshot().entries[key],
        renamed.trips[0].days[0],
      ),
    ).toBe(true)
  })
  it('读取失败可重试，未安排和少于两个地点不会请求', async () => {
    const { store } = memory()
    const service = { calculateDrivingRoute: vi.fn(async () => entry().result) }
    const controller = new RouteController(
      new RouteCacheRepository(store),
      service,
    )
    controller.updateWorkspace(workspace(), true)
    vi.mocked(store.get).mockRejectedValueOnce(new Error('读取失败'))
    await controller.load()
    expect(controller.getSnapshot().status).toBe('error')
    await controller.calculate('trip', 'day')
    expect(service.calculateDrivingRoute).not.toHaveBeenCalled()
    await controller.load()
    await controller.calculate('trip', 'other-day')
    await controller.calculate('trip', 'unscheduled')
    expect(service.calculateDrivingRoute).not.toHaveBeenCalled()
    await controller.calculate('trip', 'day')
    expect(service.calculateDrivingRoute).toHaveBeenCalledOnce()
  })
})
