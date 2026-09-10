import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebLocalStore } from '../storage/web'
import { NOTE_KEY, type LocalStore } from '../storage/types'
import { applyTravelAction, emptyWorkspace } from './model'
import {
  parseWorkspace,
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from './repository'
import type { TravelAction, TravelWorkspace } from './types'

function memoryStore() {
  const values = new Map<string, string>()
  const store: LocalStore = {
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  return { store, values }
}
const create: TravelAction = {
  type: 'createTrip',
  name: '河西之旅',
  startDate: null,
  dayCount: 2,
}
const openStores: WebLocalStore[] = []
afterEach(() => {
  openStores.forEach((store) => store.close())
  openStores.length = 0
})

describe('旅行工作区持久化', () => {
  it('读取不自动写入示例，重新打开保存的行程，保留原个人备注和数据库版本', async () => {
    const name = `travel-${crypto.randomUUID()}`
    const firstStore = new WebLocalStore(name)
    openStores.push(firstStore)
    await firstStore.set(NOTE_KEY, '升级前的个人备注')
    const first = new TravelRepository(firstStore)
    expect(await first.load()).toEqual(emptyWorkspace())
    expect(await firstStore.get(TRAVEL_WORKSPACE_KEY)).toBeNull()
    const saved = await first.run(create)
    firstStore.close()
    const nextStore = new WebLocalStore(name)
    openStores.push(nextStore)
    expect(await new TravelRepository(nextStore).load()).toEqual(saved)
    expect(await nextStore.get(NOTE_KEY)).toBe('升级前的个人备注')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    expect(db.version).toBe(10)
    db.close()
  })

  it('串行保存始终基于最新已保存快照，失败不推进快照也不阻断重试', async () => {
    const { store, values } = memoryStore()
    const repository = new TravelRepository(store)
    const initial = await repository.run(create)
    const tripId = initial.activeTripId!
    vi.mocked(store.set).mockRejectedValueOnce(new Error('磁盘写入失败'))
    await expect(
      repository.run({
        type: 'updateTrip',
        tripId,
        name: '未保存的名字',
        startDate: null,
      }),
    ).rejects.toThrow('磁盘写入失败')
    const second = repository.run({ type: 'addDay', tripId })
    const third = repository.run({
      type: 'updateTrip',
      tripId,
      name: '重试后的名字',
      startDate: '2026-09-30',
    })
    expect((await second).trips[0].name).toBe('河西之旅')
    const final = await third
    expect(final.trips[0].days).toHaveLength(3)
    expect(final.trips[0].name).toBe('重试后的名字')
    expect(parseWorkspace(values.get(TRAVEL_WORKSPACE_KEY)!)).toEqual(final)
  })

  it('旧页面不能覆盖其他页面更新，重新加载后可继续修改', async () => {
    const { store } = memoryStore()
    const first = new TravelRepository(store)
    const second = new TravelRepository(store)
    const saved = await first.run(create)
    await second.load()
    await first.run({ type: 'addDay', tripId: saved.activeTripId! })
    await expect(
      second.run({
        type: 'updateTrip',
        tripId: saved.activeTripId!,
        name: '旧页面名称',
        startDate: null,
      }),
    ).rejects.toThrow('其他页面更新')
    expect((await second.load()).trips[0].days).toHaveLength(3)
    expect(
      (
        await second.run({
          type: 'updateTrip',
          tripId: saved.activeTripId!,
          name: '重新加载后的名称',
          startDate: null,
        })
      ).trips[0].days,
    ).toHaveLength(3)
  })

  it.each(['{broken', '{"schemaVersion":99,"trips":[],"activeTripId":null}'])(
    '损坏或未来版本文档不会被初始化或保存覆盖：%s',
    async (raw) => {
      const { store, values } = memoryStore()
      values.set(TRAVEL_WORKSPACE_KEY, raw)
      const repository = new TravelRepository(store)
      await expect(repository.load()).rejects.toThrow('已保留原数据')
      await expect(repository.run(create)).rejects.toThrow('已保留原数据')
      expect(values.get(TRAVEL_WORKSPACE_KEY)).toBe(raw)
      expect(store.set).not.toHaveBeenCalled()
    },
  )

  it('拒绝重复地点 ID、越界坐标、无效日期和悬空的当前行程引用', () => {
    const valid = applyTravelAction(emptyWorkspace(), create)
    const cases: TravelWorkspace[] = []
    const duplicate = structuredClone(valid)
    const place = {
      id: 'same',
      name: '地点',
      note: '',
      coordinates: { longitude: 100, latitude: 35, crs: 'WGS84' as const },
    }
    duplicate.trips[0].days[0].places.push(place)
    duplicate.trips[0].unscheduledPlaces.push(place)
    cases.push(duplicate)
    const coordinate = structuredClone(valid)
    coordinate.trips[0].unscheduledPlaces.push({
      ...place,
      coordinates: { ...place.coordinates, latitude: 100 },
    })
    cases.push(coordinate)
    const date = structuredClone(valid)
    date.trips[0].startDate = '2026-02-30'
    cases.push(date)
    cases.push({ ...valid, activeTripId: 'missing' })
    for (const invalid of cases)
      expect(() => parseWorkspace(JSON.stringify(invalid))).toThrow('格式异常')
  })
})
