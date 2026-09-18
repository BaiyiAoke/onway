import { describe, expect, it, vi } from 'vitest'
import { applyTravelAction, placementSnapshot } from './model'
import { TravelRepository, TRAVEL_WORKSPACE_KEY } from './repository'
import type { TravelAction, TravelWorkspace } from './types'
import {
  travelFixture,
  memoryStore,
  optionFixture,
} from '../../test/transportFixtures'
import {
  daySegments,
  recordForRequest,
  requestFingerprint,
} from '../routes/transport'
import { ROUTE_CACHE_KEY } from '../routes/repository'
import { WebLocalStore } from '../storage/web'
import { RESTORE_EPOCH_KEY } from '../storage/atomic'

function move(
  w: TravelWorkspace,
  placeId = 'a',
  dayId: string | null = 'other',
  beforePlaceId: string | null = null,
): TravelAction {
  return {
    type: 'relocatePlace',
    tripId: 'trip',
    placeId,
    dayId,
    beforePlaceId,
    expected: JSON.stringify(w),
  }
}
function undo(before: TravelWorkspace, after: TravelWorkspace): TravelAction {
  return {
    type: 'restorePlacement',
    tripId: 'trip',
    placement: placementSnapshot(before.trips[0]),
    expected: JSON.stringify(after),
  }
}
describe('编排插入、移动与单次撤销', () => {
  it('同一天前插、末尾及跨天移动保留地点 ID；原位置无变化', () => {
    const w = travelFixture()
    expect(applyTravelAction(w, move(w, 'a', 'day', 'b'))).toEqual(w)
    expect(applyTravelAction(w, move(w, 'a', 'day', 'a'))).toEqual(w)
    const reordered = applyTravelAction(w, move(w, 'a', 'day'))
    expect(reordered.trips[0].days[0].places.map((p) => p.id)).toEqual([
      'b',
      'a',
    ])
    const moved = applyTravelAction(reordered, move(reordered, 'a', 'other'))
    expect(moved.trips[0].days[1].places[0]).toEqual(
      w.trips[0].days[0].places[0],
    )
    const unassigned = applyTravelAction(moved, move(moved, 'a', null))
    expect(unassigned.trips[0].unscheduledPlaces.map((p) => p.id)).toEqual([
      'a',
    ])
    expect(applyTravelAction(unassigned, undo(moved, unassigned))).toEqual(
      moved,
    )
  })
  it.each(['train', 'flight', 'transit'] as const)(
    '撤销完整恢复 %s 及先前待关联记录，不只是排序',
    (mode) => {
      const w = travelFixture(),
        trip = w.trips[0],
        r = daySegments(trip, trip.days[0])[0],
        record = recordForRequest(trip, r)
      record.config.mode = mode
      record.train = {
        number: 'G123',
        departureStation: '北京',
        arrivalStation: '天津',
        departureAt: '2026-09-16T23:00:00+08:00',
        arrivalAt: '2026-09-17T01:00:00+08:00',
        note: '已确认',
      }
      record.flight = {
        number: 'MU1234',
        departureAirport: '首都',
        arrivalAirport: '白云',
        departureAt: '2026-09-16T23:00:00+08:00',
        arrivalAt: '2026-09-17T01:00:00+08:00',
        note: '已确认',
      }
      record.selected = {
        fingerprint: requestFingerprint({ ...r, config: record.config }),
        option: optionFixture(),
      }
      trip.transport = [
        record,
        {
          ...structuredClone(record),
          id: 'detached',
          dayId: null,
          needsReview: true,
        },
      ]
      const moved = applyTravelAction(w, move(w))
      expect(moved.trips[0].transport![0]).toMatchObject({
        dayId: null,
        needsReview: true,
      })
      const restored = applyTravelAction(moved, undo(w, moved))
      expect(restored).toEqual(w)
      expect(restored.trips[0].transport![1].dayId).toBeNull()
    },
  )
  it('任何后续文档修改使手势和撤销过期，失效锚点不追加到末尾', () => {
    const w = travelFixture(),
      moved = applyTravelAction(w, move(w))
    const edited = applyTravelAction(moved, {
      type: 'updateTrip',
      tripId: 'trip',
      name: '另一个名称',
      startDate: null,
    })
    expect(() => applyTravelAction(edited, undo(w, moved))).toThrow(
      '旅行数据已改变',
    )
    expect(() => applyTravelAction(edited, move(w))).toThrow('旅行数据已改变')
    expect(() => applyTravelAction(w, move(w, 'a', 'other', 'b'))).toThrow(
      '插入位置已改变',
    )
    expect(() => applyTravelAction(w, move(w, 'a', 'deleted'))).toThrow(
      '这一天已不存在',
    )
    expect(w.trips[0].days[0].places).toHaveLength(2)
  })
  it('搜索与收藏连续插入保持选择顺序，重复保护只对明确开启的新增生效', () => {
    let w = travelFixture()
    w.libraryPlaces = [
      { ...w.trips[0].days[0].places[0], id: 'library', name: '第三站' },
    ]
    w = applyTravelAction(w, {
      type: 'savePlace',
      tripId: 'trip',
      dayId: 'day',
      beforePlaceId: 'b',
      place: { ...w.libraryPlaces[0], id: 'new', name: '中间站' },
      preventDuplicate: true,
    })
    w = applyTravelAction(
      w,
      {
        type: 'copyToTrip',
        tripId: 'trip',
        dayId: 'day',
        placeId: 'library',
        beforePlaceId: 'b',
      },
      () => 'copied',
    )
    expect(w.trips[0].days[0].places.map((p) => p.id)).toEqual([
      'a',
      'new',
      'copied',
      'b',
    ])
    const duplicate = { ...w.trips[0].days[0].places[0], id: 'duplicate' }
    expect(() =>
      applyTravelAction(w, {
        type: 'savePlace',
        tripId: 'trip',
        dayId: 'day',
        place: duplicate,
        preventDuplicate: true,
      }),
    ).toThrow('已有这个地点')
    expect(
      applyTravelAction(w, {
        type: 'savePlace',
        tripId: 'trip',
        dayId: 'day',
        place: duplicate,
      }).trips[0].days[0].places,
    ).toHaveLength(5)
    expect(() =>
      applyTravelAction(w, {
        type: 'savePlace',
        tripId: 'trip',
        dayId: 'day',
        place: duplicate,
        beforePlaceId: 'deleted',
      }),
    ).toThrow('插入位置已改变')
    expect(() =>
      applyTravelAction(w, {
        type: 'savePlace',
        tripId: 'trip',
        dayId: 'day',
        place: duplicate,
        beforePlaceId: null,
        afterPlaceId: 'a',
      }),
    ).toThrow('只能指定')
  })
  it('移动和撤销各只写一次；原位不写入，失败保留原快照且可重试', async () => {
    const { store, values } = memoryStore(),
      w = travelFixture()
    values.set(TRAVEL_WORKSPACE_KEY, JSON.stringify(w))
    const repo = new TravelRepository(store)
    await repo.load()
    const write = vi.spyOn(store, 'set')
    await repo.run(move(w, 'a', 'day', 'b'))
    expect(write).not.toHaveBeenCalled()
    write.mockRejectedValueOnce(new Error('磁盘已满'))
    await expect(repo.run(move(w))).rejects.toThrow('磁盘已满')
    expect(JSON.parse(values.get(TRAVEL_WORKSPACE_KEY)!)).toEqual(w)
    const after = await repo.run(move(w))
    expect(write).toHaveBeenCalledTimes(2)
    await store.set(ROUTE_CACHE_KEY, '保留独立候选缓存')
    expect(await repo.run(undo(w, after))).toEqual(w)
    expect(values.get(ROUTE_CACHE_KEY)).toBe('保留独立候选缓存')
    expect(write).toHaveBeenCalledTimes(4)
  })
  it('同实例排队中的旧手势不能覆盖前一成功保存', async () => {
    const { store, values } = memoryStore(),
      w = travelFixture()
    values.set(TRAVEL_WORKSPACE_KEY, JSON.stringify(w))
    const repo = new TravelRepository(store)
    await repo.load()
    const first = repo.run(move(w))
    const stale = repo.run(move(w, 'b', 'other'))
    await expect(first).resolves.toMatchObject({ activeTripId: 'trip' })
    await expect(stale).rejects.toThrow('旅行数据已改变')
    expect(
      (await repo.load()).trips[0].days[0].places.map((p) => p.id),
    ).toEqual(['b'])
  })
  it('恢复相同旅行内容但恢复标识变化时，也拒绝旧撤销', async () => {
    const store = new WebLocalStore('placement-' + crypto.randomUUID())
    try {
      const w = travelFixture()
      await store.set(TRAVEL_WORKSPACE_KEY, JSON.stringify(w))
      const repo = new TravelRepository(store)
      await repo.load()
      const after = await repo.run(move(w))
      await store.set(RESTORE_EPOCH_KEY, '恢复后的新标识')
      await expect(repo.run(undo(w, after))).rejects.toThrow('本地数据已更新')
      expect(JSON.parse((await store.get(TRAVEL_WORKSPACE_KEY))!)).toEqual(
        after,
      )
    } finally {
      store.close()
    }
  })
})
