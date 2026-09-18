import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentController } from './segmentController'
import { RouteCacheRepository, ROUTE_CACHE_KEY } from './repository'
import { daySegments, recordForRequest, segmentKey } from './transport'
import { applyTravelAction, placementSnapshot } from '../travel/model'
import {
  travelFixture,
  optionFixture,
  memoryStore,
  deferred,
} from '../../test/transportFixtures'
import type { SegmentResult } from './transportTypes'
import type { TravelAction } from '../travel/types'
import { WebLocalStore } from '../storage/web'
import { BackupRepository } from '../backup/repository'
import { createBackup, serializeBackup } from '../backup/model'
const controllers: SegmentController[] = []
afterEach(() => {
  controllers.forEach((c) => c.dispose())
  controllers.length = 0
  vi.useRealTimers()
  vi.restoreAllMocks()
})
async function fixture(
  service = {
    calculateSegment: vi.fn(async () => ({ options: [optionFixture()] })),
  },
) {
  const { store, values } = memoryStore(),
    controller = new SegmentController(new RouteCacheRepository(store), service)
  controllers.push(controller)
  const w = travelFixture()
  controller.updateWorkspace(w, true, false, async () => true)
  await controller.load()
  return { controller, w, store, values, service }
}
describe('分段任务、自动查询与恢复保护', () => {
  it('移动和恢复关联都不主动算路，保留独立候选缓存', async () => {
    vi.useFakeTimers()
    const f = await fixture(),
      w = structuredClone(f.w),
      trip = w.trips[0]
    const record = recordForRequest(trip, daySegments(trip, trip.days[0])[0])
    record.config.mode = 'walking'
    trip.transport = [record]
    f.controller.updateWorkspace(null, false, false, async () => true)
    f.controller.updateWorkspace(w, true, false, async () => true)
    const moved = applyTravelAction(w, {
      type: 'relocatePlace',
      tripId: trip.id,
      placeId: 'a',
      dayId: 'other',
      beforePlaceId: null,
      expected: JSON.stringify(w),
    })
    f.controller.updateWorkspace(moved, true, false, async () => true)
    const restored = applyTravelAction(moved, {
      type: 'restorePlacement',
      tripId: trip.id,
      placement: placementSnapshot(trip),
      expected: JSON.stringify(moved),
    })
    f.controller.updateWorkspace(restored, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(f.service.calculateSegment).not.toHaveBeenCalled()
  })
  it.each(['train', 'flight'] as const)(
    '手动方式 %s 保存、单段刷新、全天刷新均不算路',
    async (mode) => {
      vi.useFakeTimers()
      const f = await fixture(),
        next = structuredClone(f.w),
        trip = next.trips[0]
      const request = daySegments(trip, trip.days[0])[0],
        record = recordForRequest(trip, request)
      record.config.mode = mode
      trip.transport = [record]
      f.controller.updateWorkspace(next, true, false, async () => true)
      await vi.advanceTimersByTimeAsync(1000)
      await f.controller.calculate(daySegments(trip, trip.days[0])[0])
      await f.controller.calculateDay(trip.id, trip.days[0].id)
      expect(f.service.calculateSegment).not.toHaveBeenCalled()
      expect(f.values.has(ROUTE_CACHE_KEY)).toBe(false)
    },
  )

  it('启动、坐标调整和新路段不自动算路，交通设置变化才自动请求', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.service.calculateSegment).not.toHaveBeenCalled()
    const first = structuredClone(f.w)
    first.trips[0].days[0].places[0].coordinates.longitude = 116.41
    f.controller.updateWorkspace(first, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(400)
    const second = structuredClone(first)
    second.trips[0].days[0].places[0].coordinates.longitude = 116.415
    f.controller.updateWorkspace(second, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(599)
    expect(f.service.calculateSegment).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.service.calculateSegment).not.toHaveBeenCalled()
    const configured = structuredClone(second)
    const r = daySegments(configured.trips[0], configured.trips[0].days[0])[0]
    const record = recordForRequest(configured.trips[0], r)
    record.config.mode = 'walking'
    configured.trips[0].transport = [record]
    f.controller.updateWorkspace(configured, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(600)
    expect(f.service.calculateSegment).toHaveBeenCalledTimes(1)
  })
  it('更新端点立即取消，晚到响应不写入缓存', async () => {
    const pending = deferred<SegmentResult>(),
      service = { calculateSegment: vi.fn(() => pending.promise) },
      f = await fixture(service)
    const r = daySegments(f.w.trips[0], f.w.trips[0].days[0])[0],
      task = f.controller.calculate(r)
    const changed = structuredClone(f.w)
    changed.trips[0].days[0].places.reverse()
    f.controller.updateWorkspace(changed, true, false, async () => true)
    pending.resolve({ options: [optionFixture()] })
    await task
    expect(f.values.has(ROUTE_CACHE_KEY)).toBe(false)
    expect(f.controller.getSnapshot().entries).toEqual({})
  })
  it('有效缓存复用，手动刷新强制请求；保存失败仅重试写盘', async () => {
    const f = await fixture(),
      r = daySegments(f.w.trips[0], f.w.trips[0].days[0])[0]
    await f.controller.calculate(r)
    await f.controller.calculate(r, false)
    expect(f.service.calculateSegment).toHaveBeenCalledTimes(1)
    const save = vi
      .spyOn(f.store, 'set')
      .mockRejectedValueOnce(new Error('磁盘已满'))
    await f.controller.calculate(r)
    expect(f.controller.getSnapshot().operations[segmentKey(r)].stage).toBe(
      'unsaved',
    )
    await f.controller.retrySave(r)
    expect(f.service.calculateSegment).toHaveBeenCalledTimes(2)
    expect(f.controller.getSnapshot().operations).toEqual({})
    expect(save).toHaveBeenCalledTimes(2)
  })
  it('缺城市时先补齐并保存，自己的元数据写入不会取消或重复算路', async () => {
    let w = travelFixture()
    const t = w.trips[0],
      r = daySegments(t, t.days[0])[0],
      record = recordForRequest(t, r)
    record.config = {
      mode: 'transit',
      provider: 'amap',
      strategy: 0,
      departure: { kind: 'scheduled', at: '2026-09-16T09:00:00+08:00' },
      reviewedDate: r.date,
    }
    w = applyTravelAction(w, { type: 'saveTransport', tripId: 'trip', record })
    const { store } = memoryStore(),
      service = {
        calculateSegment: vi.fn(async () => ({ options: [optionFixture()] })),
      },
      cities = {
        resolve: vi.fn(async () => ({ citycode: '010', adcode: '110105' })),
      }
    const controller = new SegmentController(
      new RouteCacheRepository(store),
      service,
      cities,
    )
    controllers.push(controller)
    const writer = async (action: TravelAction) => {
      w = applyTravelAction(w, action)
      controller.updateWorkspace(w, true, false, writer)
      return true
    }
    controller.updateWorkspace(w, true, false, writer)
    await controller.load()
    await controller.calculate(daySegments(w.trips[0], w.trips[0].days[0])[0])
    expect(cities.resolve).toHaveBeenCalledTimes(2)
    expect(service.calculateSegment).toHaveBeenCalledOnce()
    expect(Object.keys(controller.getSnapshot().entries)).toHaveLength(1)
    expect(w.trips[0].days[0].places[0].citycode).toBe('010')
  })
  it('核对新的行程日期后触发查询，不必重复改动时间字段', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const w = structuredClone(f.w),
      t = w.trips[0],
      r = daySegments(t, t.days[0])[0],
      record = recordForRequest(t, r)
    record.config = {
      mode: 'transit',
      provider: 'amap',
      strategy: 0,
      departure: { kind: 'scheduled', at: '2026-09-16T09:00:00+08:00' },
      reviewedDate: '2026-09-15',
    }
    t.transport = [record]
    for (const p of t.days[0].places) p.citycode = '010'
    f.controller.updateWorkspace(w, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(600)
    expect(f.service.calculateSegment).not.toHaveBeenCalled()
    const checked = structuredClone(w)
    checked.trips[0].transport![0].config.reviewedDate = r.date
    f.controller.updateWorkspace(checked, true, false, async () => true)
    await vi.advanceTimersByTimeAsync(600)
    expect(f.service.calculateSegment).toHaveBeenCalledOnce()
  })
  it('取消城市查询后不再提交正式工作区写入', async () => {
    const w = travelFixture(),
      t = w.trips[0],
      r = daySegments(t, t.days[0])[0],
      record = recordForRequest(t, r)
    record.config = {
      mode: 'transit',
      provider: 'amap',
      strategy: 0,
      departure: { kind: 'scheduled', at: '2026-09-16T09:00:00+08:00' },
      reviewedDate: r.date,
    }
    t.transport = [record]
    const pending = deferred<{ citycode: string }>(),
      { store } = memoryStore(),
      writer = vi.fn(async () => true),
      controller = new SegmentController(
        new RouteCacheRepository(store),
        { calculateSegment: vi.fn() },
        { resolve: () => pending.promise },
      )
    controllers.push(controller)
    controller.updateWorkspace(w, true, false, writer)
    await controller.load()
    const task = controller.calculate(daySegments(t, t.days[0])[0])
    await Promise.resolve()
    controller.dispose()
    pending.resolve({ citycode: '010' })
    await task
    expect(writer).not.toHaveBeenCalled()
  })
  it('恢复标识变化后，即使端点相同，原任务也不能把结果写回', async () => {
    const store = new WebLocalStore('segment-restore-' + crypto.randomUUID())
    await store.initialize()
    try {
      const cache = new RouteCacheRepository(store),
        pending = deferred<SegmentResult>(),
        w = travelFixture(),
        controller = new SegmentController(cache, {
          calculateSegment: () => pending.promise,
        })
      controllers.push(controller)
      controller.updateWorkspace(w, true, false, async () => true)
      await controller.load()
      const task = controller.calculate(
        daySegments(w.trips[0], w.trips[0].days[0])[0],
      )
      const backups = new BackupRepository(store),
        preview = await backups.preview(serializeBackup(createBackup(w, '')))
      await backups.restore(preview)
      pending.resolve({ options: [optionFixture()] })
      await task
      expect(JSON.parse((await store.get(ROUTE_CACHE_KEY))!).segments).toEqual(
        [],
      )
    } finally {
      store.close()
    }
  })
})
