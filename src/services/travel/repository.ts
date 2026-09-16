import { getLocalStore } from '../storage'
import type { LocalStore } from '../storage/types'
import {
  applyTravelAction,
  emptyWorkspace,
  isValidCalendarDate,
  defaultCategories,
} from './model'
import type { TravelAction, TravelWorkspace } from './types'

export const TRAVEL_WORKSPACE_KEY = 'travel.workspace'

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertDocument(condition: unknown): asserts condition {
  if (!condition)
    throw new Error('旅行数据格式异常，已保留原数据，请勿重复覆盖。')
}

// 文档版本与 SQLite / IndexedDB 表版本独立；后续迁移必须在此显式增加分支。
export function migrateWorkspaceDocument(document: unknown): unknown {
  assertDocument(isObject(document))
  if (document.schemaVersion === 1) {
    // 读取时仅内存迁移，下一次成功操作整体写入 v2，失败不改动旧原文。
    return {
      ...structuredClone(document),
      schemaVersion: 2,
      libraryPlaces: [],
      categories: defaultCategories(),
    }
  }
  if (document.schemaVersion !== 2) {
    throw new Error(
      '旅行数据版本暂不受支持，已保留原数据，请使用兼容版本打开。',
    )
  }
  return document
}

export function parseWorkspace(raw: string | null): TravelWorkspace {
  if (raw === null) return emptyWorkspace()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('旅行数据无法解析，已保留原数据，请勿重复覆盖。')
  }
  const document = migrateWorkspaceDocument(parsed)
  assertDocument(
    isObject(document) &&
      document.schemaVersion === 2 &&
      Array.isArray(document.trips),
  )
  const identifiers = new Set<string>()
  const tripIds = new Set<string>()
  const validId = (id: unknown) => {
    assertDocument(
      typeof id === 'string' &&
        id.trim().length > 0 &&
        id !== 'all' &&
        id !== 'unscheduled',
    )
    assertDocument(!identifiers.has(id))
    identifiers.add(id)
  }
  assertDocument(
    Array.isArray(document.categories) && Array.isArray(document.libraryPlaces),
  )
  const categoryIds = new Set<string>()
  const categoryNames = new Set<string>()
  for (const category of document.categories) {
    assertDocument(isObject(category))
    validId(category.id)
    assertDocument(
      typeof category.name === 'string' &&
        category.name.trim().length > 0 &&
        category.name.length <= 30 &&
        category.name !== '未分类' &&
        typeof category.builtin === 'boolean',
    )
    assertDocument(!categoryNames.has(category.name))
    categoryNames.add(category.name)
    categoryIds.add(category.id as string)
  }
  for (const builtin of defaultCategories()) {
    assertDocument(
      document.categories.some(
        (c) =>
          isObject(c) &&
          c.id === builtin.id &&
          c.name === builtin.name &&
          c.builtin === true,
      ),
    )
  }
  assertDocument(
    document.categories.every(
      (c) =>
        isObject(c) &&
        (!c.builtin || defaultCategories().some((b) => b.id === c.id)),
    ),
  )
  const validPlaces = (places: unknown) => {
    assertDocument(Array.isArray(places))
    for (const place of places) {
      assertDocument(isObject(place))
      validId(place.id)
      assertDocument(
        typeof place.name === 'string' &&
          place.name.trim().length > 0 &&
          typeof place.note === 'string',
      )
      const point = place.coordinates
      assertDocument(isObject(point) && point.crs === 'WGS84')
      assertDocument(
        typeof point.longitude === 'number' &&
          Number.isFinite(point.longitude) &&
          point.longitude >= -180 &&
          point.longitude <= 180,
      )
      assertDocument(
        typeof point.latitude === 'number' &&
          Number.isFinite(point.latitude) &&
          point.latitude >= -90 &&
          point.latitude <= 90,
      )
      if (place.address !== undefined)
        assertDocument(typeof place.address === 'string')
      if (place.categoryId !== undefined)
        assertDocument(
          typeof place.categoryId === 'string' &&
            categoryIds.has(place.categoryId),
        )
      if (place.libraryPlaceId !== undefined)
        assertDocument(
          typeof place.libraryPlaceId === 'string' &&
            place.libraryPlaceId.length > 0,
        )
      if (place.source !== undefined)
        assertDocument(
          isObject(place.source) &&
            ['osm', 'amap'].includes(place.source.provider as string) &&
            typeof place.source.id === 'string' &&
            place.source.id.length > 0,
        )
      if (place.sourceUrl !== undefined) {
        assertDocument(typeof place.sourceUrl === 'string')
        try {
          const url = new URL(place.sourceUrl)
          assertDocument(url.protocol === 'https:' || url.protocol === 'http:')
        } catch {
          assertDocument(false)
        }
      }
    }
  }
  validPlaces(document.libraryPlaces)
  for (const trip of document.trips) {
    assertDocument(isObject(trip))
    validId(trip.id)
    tripIds.add(trip.id as string)
    assertDocument(typeof trip.name === 'string' && trip.name.trim().length > 0)
    assertDocument(
      trip.startDate === null ||
        (typeof trip.startDate === 'string' &&
          isValidCalendarDate(trip.startDate)),
    )
    assertDocument(Array.isArray(trip.days) && trip.days.length > 0)
    for (const day of trip.days) {
      assertDocument(isObject(day))
      validId(day.id)
      validPlaces(day.places)
    }
    validPlaces(trip.unscheduledPlaces)
  }
  assertDocument(
    document.activeTripId === null ||
      (typeof document.activeTripId === 'string' &&
        tripIds.has(document.activeTripId)),
  )
  return document as unknown as TravelWorkspace
}

export class TravelRepository {
  private queue: Promise<unknown> = Promise.resolve()
  private storePromise?: Promise<LocalStore>
  private snapshot: TravelWorkspace | null = null
  private rawSnapshot: string | null = null

  constructor(
    private readonly source:
      LocalStore | (() => Promise<LocalStore>) = getLocalStore,
  ) {}

  private store(): Promise<LocalStore> {
    this.storePromise ??= Promise.resolve(
      typeof this.source === 'function' ? this.source() : this.source,
    )
      .then(async (store) => {
        await store.initialize()
        return store
      })
      .catch((error: unknown) => {
        this.storePromise = undefined
        throw error
      })
    return this.storePromise
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    // 单次失败不能打断后续队列；成功后才替换快照，重试仍从已保存数据开始。
    this.queue = result.catch(() => undefined)
    return result
  }

  private async read(): Promise<TravelWorkspace> {
    const store = await this.store()
    const raw = await store.get(TRAVEL_WORKSPACE_KEY)
    const workspace = parseWorkspace(raw)
    this.rawSnapshot = raw
    this.snapshot = workspace
    return structuredClone(workspace)
  }

  load(): Promise<TravelWorkspace> {
    return this.enqueue(() => this.read())
  }

  run(action: TravelAction): Promise<TravelWorkspace> {
    return this.enqueue(async () => {
      const persist = async () => {
        if (this.snapshot === null) await this.read()
        const store = await this.store()
        const current = await store.get(TRAVEL_WORKSPACE_KEY)
        if (current !== this.rawSnapshot) {
          throw new Error(
            '旅行数据已在其他页面更新，请重新加载后再修改。当前操作尚未保存。',
          )
        }
        const next = applyTravelAction(this.snapshot!, action)
        const raw = JSON.stringify(next)
        parseWorkspace(raw)
        await store.set(TRAVEL_WORKSPACE_KEY, raw)
        this.rawSnapshot = raw
        this.snapshot = next
        return structuredClone(next)
      }
      // Web Locks 包住读取、比较、写入，防止两个标签同时通过快照检查。
      // 不支持此 API 的环境仍保留单实例串行和过期快照保护。
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request('onway.travel.workspace', persist)
      }
      return persist()
    })
  }
}
