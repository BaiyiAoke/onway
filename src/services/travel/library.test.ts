import { describe, expect, it, vi } from 'vitest'
import { applyTravelAction as apply, emptyWorkspace } from './model'
import { TravelRepository, TRAVEL_WORKSPACE_KEY } from './repository'
import type { LocalStore } from '../storage/types'
import type { TripPlace } from './types'
import { parseCoordinates, splitCoordinates } from './coordinates'
const place: TripPlace = {
  id: 'library-a',
  name: '测试地点',
  note: '',
  categoryId: 'category-sight',
  coordinates: { longitude: 103.8343, latitude: 36.0611, crs: 'WGS84' },
}
describe('地点库与升级', () => {
  it('v1 只读迁移不写磁盘，失败保留原文，下次成功写入 v2', async () => {
    const initial = apply(emptyWorkspace(), {
      type: 'createTrip',
      name: '旧行程',
      dayCount: 1,
      startDate: null,
    })
    const raw = JSON.stringify({
      schemaVersion: 1,
      trips: initial.trips,
      activeTripId: initial.activeTripId,
    })
    let persisted = raw
    const store: LocalStore = {
      initialize: async () => {},
      get: async (key) => (key === TRAVEL_WORKSPACE_KEY ? persisted : null),
      set: vi.fn(async (_key, value) => {
        persisted = value
      }),
    }
    const repository = new TravelRepository(store)
    const loaded = await repository.load()
    expect(loaded.schemaVersion).toBe(2)
    expect(loaded.libraryPlaces).toEqual([])
    expect(loaded.categories).toHaveLength(5)
    expect(loaded.trips).toEqual(initial.trips)
    expect(store.set).not.toHaveBeenCalled()
    vi.mocked(store.set).mockRejectedValueOnce(new Error('磁盘已满'))
    await expect(
      repository.run({ type: 'saveLibraryPlace', place }),
    ).rejects.toThrow('磁盘已满')
    expect(persisted).toBe(raw)
    const saved = await repository.run({ type: 'saveLibraryPlace', place })
    expect(JSON.parse(persisted)).toEqual(saved)
    expect(saved.trips).toEqual(initial.trips)
  })
  it('复制使用独立 ID，编辑与删除地点库不影响任何行程副本', () => {
    let state = apply(emptyWorkspace(), { type: 'saveLibraryPlace', place })
    state = apply(state, {
      type: 'createTrip',
      name: '行程一',
      dayCount: 1,
      startDate: null,
    })
    const first = state.activeTripId!
    state = apply(state, {
      type: 'copyToTrip',
      tripId: first,
      placeId: place.id,
      dayId: null,
    })
    state = apply(state, {
      type: 'createTrip',
      name: '行程二',
      dayCount: 1,
      startDate: null,
    })
    state = apply(state, {
      type: 'copyToTrip',
      tripId: state.activeTripId!,
      placeId: place.id,
      dayId: state.trips[1].days[0].id,
    })
    const before = structuredClone(state.trips)
    expect(before[0].unscheduledPlaces[0].id).not.toBe(place.id)
    expect(before[1].days[0].places[0].id).not.toBe(
      before[0].unscheduledPlaces[0].id,
    )
    expect(() =>
      apply(state, {
        type: 'copyToTrip',
        tripId: first,
        placeId: place.id,
        dayId: null,
      }),
    ).toThrow('已有')
    state = apply(state, {
      type: 'saveLibraryPlace',
      place: { ...place, name: '只改地点库' },
    })
    state = apply(state, { type: 'deleteLibraryPlace', placeId: place.id })
    expect(state.trips).toEqual(before)
  })
  it('删除自定义分类原子清除库与行程引用，预置分类不能改删', () => {
    let state = apply(emptyWorkspace(), { type: 'saveCategory', name: '露营' })
    const categoryId = state.categories.at(-1)!.id
    state = apply(state, {
      type: 'saveLibraryPlace',
      place: { ...place, categoryId },
    })
    state = apply(state, {
      type: 'createTrip',
      name: '露营之旅',
      dayCount: 1,
      startDate: null,
    })
    state = apply(state, {
      type: 'copyToTrip',
      tripId: state.activeTripId!,
      placeId: place.id,
      dayId: null,
    })
    state = apply(state, { type: 'deleteCategory', id: categoryId })
    expect(state.libraryPlaces).toHaveLength(1)
    expect(state.libraryPlaces[0].categoryId).toBeUndefined()
    expect(state.trips[0].unscheduledPlaces[0].categoryId).toBeUndefined()
    expect(() =>
      apply(state, { type: 'deleteCategory', id: 'category-sight' }),
    ).toThrow()
    expect(() =>
      apply(state, {
        type: 'saveCategory',
        id: 'category-sight',
        name: '改名',
      }),
    ).toThrow()
    expect(() => apply(state, { type: 'saveCategory', name: '餐饮' })).toThrow()
  })
})
describe('坐标来源与校验', () => {
  it('WGS84 原样保存，GCJ-02 转换为 WGS84', () => {
    expect(parseCoordinates('103.8343', '36.0611', 'WGS84')).toEqual(
      place.coordinates,
    )
    const converted = parseCoordinates('116.404', '39.915', 'GCJ02')
    expect(converted.longitude).toBeCloseTo(116.397755, 4)
    expect(converted.latitude).toBeCloseTo(39.913596, 4)
  })
  it.each([
    ['', '30'],
    ['NaN', '30'],
    ['0x20', '30'],
    ['181', '30'],
    ['100', '91'],
    ['1e2', '30'],
  ])('拒绝无效输入 %s,%s', (lng, lat) => {
    expect(() => parseCoordinates(lng, lat, 'WGS84')).toThrow()
  })
  it('支持中英文分隔粘贴，不猜测经纬度顺序', () => {
    expect(splitCoordinates('103.8343， 36.0611')).toEqual([
      '103.8343',
      '36.0611',
    ])
    expect(splitCoordinates('103.8343 36.0611')).toEqual([
      '103.8343',
      '36.0611',
    ])
    expect(splitCoordinates('纬度36，经度103')).toBeNull()
    expect(splitCoordinates('1,2,3')).toBeNull()
  })
})
