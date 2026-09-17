import { describe, expect, it, vi } from 'vitest'
import {
  applyTravelAction as apply,
  categoryName,
  defaultCategories,
  emptyWorkspace,
} from './model'
import {
  parseWorkspace,
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from './repository'
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
  it('v1 只读迁移不写磁盘，失败保留原文，下次成功写入 v4', async () => {
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
    expect(loaded.schemaVersion).toBe(4)
    expect(loaded.libraryPlaces).toEqual([])
    expect(loaded.categories).toHaveLength(7)
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
  it('新工作区直接提供机场和车站，不新增笼统交通分类', () => {
    expect(defaultCategories().map((category) => category.name)).toEqual([
      '景点',
      '餐饮',
      '住宿',
      '停车',
      '机场',
      '车站',
    ])
  })
  it.each([2, 3])(
    'v%s 保留旧交通与同名自定义分类引用，重复读取迁移结果稳定',
    (schemaVersion) => {
      const old = {
        ...emptyWorkspace(),
        schemaVersion,
        categories: [
          ...defaultCategories().filter(
            (category) =>
              !['category-airport', 'category-station'].includes(category.id),
          ),
          { id: 'category-transport', name: '交通', builtin: true },
          { id: 'my-airport', name: '机场', builtin: false },
          { id: 'my-station', name: '车站', builtin: false },
        ],
        libraryPlaces: [
          { ...place, id: 'legacy', categoryId: 'category-transport' },
          { ...place, id: 'airport', categoryId: 'my-airport' },
          { ...place, id: 'station', categoryId: 'my-station' },
        ],
      }
      const raw = JSON.stringify(old)
      const migrated = parseWorkspace(raw)
      expect(migrated.schemaVersion).toBe(4)
      expect(migrated.libraryPlaces).toEqual(old.libraryPlaces)
      expect(migrated.categories).toContainEqual({
        id: 'my-airport',
        name: '机场',
        builtin: true,
      })
      expect(migrated.categories).toContainEqual({
        id: 'my-station',
        name: '车站',
        builtin: true,
      })
      expect(categoryName(migrated, 'category-transport')).toBe(
        '交通（待整理）',
      )
      expect(parseWorkspace(JSON.stringify(migrated))).toEqual(migrated)
      expect(JSON.stringify(old)).toBe(raw)
    },
  )
  it('新增分类 ID 避让旧实体和自定义分类，不更改原引用', () => {
    const old = {
      ...emptyWorkspace(),
      schemaVersion: 3,
      categories: [
        ...defaultCategories().filter(
          (category) =>
            !['category-airport', 'category-station'].includes(category.id),
        ),
        { id: 'category-transport', name: '交通', builtin: true },
        { id: 'category-station', name: '集合地点', builtin: false },
      ],
      libraryPlaces: [
        { ...place, id: 'category-airport', categoryId: 'category-station' },
      ],
    }
    const migrated = parseWorkspace(JSON.stringify(old))
    expect(migrated.libraryPlaces).toEqual(old.libraryPlaces)
    expect(migrated.categories).toContainEqual({
      id: 'category-airport-2',
      name: '机场',
      builtin: true,
    })
    expect(migrated.categories).toContainEqual({
      id: 'category-station-2',
      name: '车站',
      builtin: true,
    })
    expect(parseWorkspace(JSON.stringify(migrated))).toEqual(migrated)
  })
  it('旧分类无效时拒绝迁移，不用补充内置分类掩盖损坏', () => {
    const old = {
      ...emptyWorkspace(),
      schemaVersion: 3,
      categories: [
        ...defaultCategories().filter(
          (category) =>
            !['category-airport', 'category-station'].includes(category.id),
        ),
        { id: 'category-transport', name: '被改名', builtin: true },
      ],
    }
    expect(() => parseWorkspace(JSON.stringify(old))).toThrow('格式异常')
    old.categories.pop()
    expect(() => parseWorkspace(JSON.stringify(old))).toThrow('格式异常')
  })
  it('v4 不允许把兼容交通 ID 冒用为机场分类', () => {
    const invalid = emptyWorkspace()
    invalid.categories.find(
      (category) => category.id === 'category-airport',
    )!.id = 'category-transport'
    expect(() => parseWorkspace(JSON.stringify(invalid))).toThrow('格式异常')
  })
  it('地点库可插入指定地点之后，失效目标不追加也不改原数据', () => {
    let state = apply(emptyWorkspace(), { type: 'saveLibraryPlace', place })
    state = apply(state, {
      type: 'createTrip',
      name: '插入测试',
      startDate: null,
      dayCount: 2,
    })
    const tripId = state.trips[0].id
    const dayId = state.trips[0].days[0].id
    for (const id of ['a', 'b'])
      state = apply(state, {
        type: 'savePlace',
        tripId,
        dayId,
        place: { ...place, id, name: id },
      })
    const next = apply(
      state,
      {
        type: 'copyToTrip',
        tripId,
        dayId,
        placeId: place.id,
        afterPlaceId: 'a',
      },
      () => 'copied',
    )
    expect(next.trips[0].days[0].places.map((item) => item.id)).toEqual([
      'a',
      'copied',
      'b',
    ])
    expect(next.trips[0].days[0].places[1].libraryPlaceId).toBe(place.id)
    expect(() =>
      apply(state, {
        type: 'copyToTrip',
        tripId,
        dayId: state.trips[0].days[1].id,
        placeId: place.id,
        afterPlaceId: 'a',
      }),
    ).toThrow('插入位置已改变')
    expect(state.trips[0].days[0].places.map((item) => item.id)).toEqual([
      'a',
      'b',
    ])
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
