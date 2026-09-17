import { getLocalStore } from '../storage'
import { validCity, validTransport } from '../routes/transportValidation'
import { isAtomicStore, RESTORE_EPOCH_KEY } from '../storage/atomic'
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

// 固定历史分类清单，不能随着新版本默认分类变化而放宽旧文档校验。
function legacyCategories() {
  return [
    ['sight', '景点'],
    ['food', '餐饮'],
    ['stay', '住宿'],
    ['parking', '停车'],
    ['transport', '交通'],
  ].map(([id, name]) => ({ id: 'category-' + id, name, builtin: true }))
}

// 文档版本与 SQLite / IndexedDB 表版本独立；读取仅内存迁移，成功保存才落盘。
export function migrateWorkspaceDocument(document: unknown): unknown {
  assertDocument(isObject(document))
  if (document.schemaVersion === 4) return document
  if (![1, 2, 3].includes(document.schemaVersion as number)) {
    throw new Error(
      '旅行数据版本暂不受支持，已保留原数据，请使用兼容版本打开。',
    )
  }
  const old = structuredClone(document)
  if (old.schemaVersion === 1) {
    old.libraryPlaces = []
    old.categories = legacyCategories()
  }
  old.schemaVersion = 3
  // 先按旧契约校验，缺失或篡改旧内置分类不能借升级修复而掩盖数据损坏。
  const previous = validateWorkspaceDocument(old, true)
  const next = { ...previous, schemaVersion: 4 as const }
  const identifiers = new Set([
    ...next.categories.map((category) => category.id),
    ...next.libraryPlaces.map((place) => place.id),
    ...next.trips.flatMap((trip) => [
      trip.id,
      ...trip.unscheduledPlaces.map((place) => place.id),
      ...trip.days.flatMap((day) => [
        day.id,
        ...day.places.map((place) => place.id),
      ]),
      ...(trip.transport?.map((record) => record.id) ?? []),
    ]),
  ])
  for (const category of defaultCategories().filter((item) =>
    ['category-airport', 'category-station'].includes(item.id),
  )) {
    const named = next.categories.find((item) => item.name === category.name)
    if (named) {
      // 同名自定义分类升级为内置分类，保留 ID，所有库与行程引用原样保留。
      named.builtin = true
      continue
    }
    let id = category.id
    let suffix = 2
    while (identifiers.has(id)) id = category.id + '-' + suffix++
    next.categories.push({ ...category, id })
    identifiers.add(id)
  }
  return next
}

export function parseWorkspace(raw: string | null): TravelWorkspace {
  if (raw === null) return emptyWorkspace()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('旅行数据无法解析，已保留原数据，请勿重复覆盖。')
  }
  return validateWorkspaceDocument(migrateWorkspaceDocument(parsed))
}

function validateWorkspaceDocument(
  document: unknown,
  legacy = false,
): TravelWorkspace {
  assertDocument(
    isObject(document) &&
      document.schemaVersion === (legacy ? 3 : 4) &&
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
  const historicalBuiltins = legacyCategories()
  const builtins = legacy ? historicalBuiltins : defaultCategories()
  const matchesBuiltin = (
    category: Record<string, unknown>,
    builtin: { id: string; name: string },
  ) =>
    category.builtin === true &&
    category.name === builtin.name &&
    // 新增分类可沿用历史同名分类的 ID；已有四类和兼容交通仍严格校验。
    ((!legacy &&
      ['category-airport', 'category-station'].includes(builtin.id) &&
      !historicalBuiltins.some((item) => item.id === category.id)) ||
      category.id === builtin.id)
  for (const builtin of builtins) {
    assertDocument(
      document.categories.some(
        (category) => isObject(category) && matchesBuiltin(category, builtin),
      ),
    )
  }
  const allowedBuiltins = legacy
    ? builtins
    : [...builtins, { id: 'category-transport', name: '交通' }]
  assertDocument(
    document.categories.every(
      (category) =>
        isObject(category) &&
        (!category.builtin ||
          allowedBuiltins.some((builtin) => matchesBuiltin(category, builtin))),
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
      assertDocument(validCity(place))
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
    if (trip.transport !== undefined) {
      assertDocument(Array.isArray(trip.transport))
      const bindings = new Set<string>()
      for (const record of trip.transport) {
        assertDocument(validTransport(record))
        validId(record.id)
        if (record.dayId !== null) {
          const day = (
            trip.days as { id: string; places: { id: string }[] }[]
          ).find((d) => d.id === record.dayId)
          const i = day?.places.findIndex((p) => p.id === record.from.id) ?? -1
          assertDocument(
            day && i >= 0 && day.places[i + 1]?.id === record.to.id,
          )
          const key = JSON.stringify([
            record.dayId,
            record.from.id,
            record.to.id,
          ])
          assertDocument(!bindings.has(key))
          bindings.add(key)
        }
      }
    }
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
  private restoreEpoch: string | null = null

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
    const snapshot = isAtomicStore(store)
      ? await store.readBatch([TRAVEL_WORKSPACE_KEY, RESTORE_EPOCH_KEY])
      : null
    const raw = snapshot
      ? snapshot[TRAVEL_WORKSPACE_KEY]
      : await store.get(TRAVEL_WORKSPACE_KEY)
    this.restoreEpoch = snapshot?.[RESTORE_EPOCH_KEY] ?? null
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
        if (isAtomicStore(store)) {
          await store.writeBatch(
            { [TRAVEL_WORKSPACE_KEY]: raw },
            {
              [TRAVEL_WORKSPACE_KEY]: this.rawSnapshot,
              [RESTORE_EPOCH_KEY]: this.restoreEpoch,
            },
          )
        } else await store.set(TRAVEL_WORKSPACE_KEY, raw)
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
