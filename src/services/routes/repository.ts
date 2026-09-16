import { getLocalStore } from '../storage'
import type { LocalStore } from '../storage/types'
import { isObject, isRouteResult, routeKey, type CachedRoute } from './model'

export const ROUTE_CACHE_KEY = 'routes.cache'
export interface RouteCacheDocument {
  schemaVersion: 1
  entries: CachedRoute[]
}

export function parseRouteCache(raw: string | null): RouteCacheDocument {
  if (raw === null) return { schemaVersion: 1, entries: [] }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('路线缓存无法解析，原数据已保留。')
  }
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.entries)
  )
    throw new Error('路线缓存版本或格式不受支持，原数据已保留。')
  const keys = new Set<string>()
  for (const entry of value.entries) {
    if (
      !isObject(entry) ||
      typeof entry.tripId !== 'string' ||
      !entry.tripId ||
      typeof entry.dayId !== 'string' ||
      !entry.dayId ||
      typeof entry.fingerprint !== 'string' ||
      !entry.fingerprint ||
      !isRouteResult(entry.result)
    )
      throw new Error('路线缓存格式异常，原数据已保留。')
    const key = routeKey(entry.tripId, entry.dayId)
    if (keys.has(key)) throw new Error('路线缓存包含重复日期，原数据已保留。')
    keys.add(key)
  }
  return value as unknown as RouteCacheDocument
}

export class RouteCacheRepository {
  private queue: Promise<unknown> = Promise.resolve()
  private storePromise?: Promise<LocalStore>
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
    this.queue = result.catch(() => undefined)
    return result
  }

  load(): Promise<RouteCacheDocument> {
    return this.enqueue(async () =>
      parseRouteCache(await (await this.store()).get(ROUTE_CACHE_KEY)),
    )
  }

  save(
    entry: CachedRoute,
    currentDayKeys: readonly string[],
    stillCurrent: () => boolean,
  ): Promise<boolean> {
    return this.enqueue(async () => {
      const persist = async () => {
        const store = await this.store()
        // 每次读取最新缓存再合并，只保留各天最近一次成功结果；不写旅行工作区。
        const current = parseRouteCache(await store.get(ROUTE_CACHE_KEY))
        if (!stillCurrent()) return false
        const key = routeKey(entry.tripId, entry.dayId)
        const entries = current.entries.filter(
          (item) =>
            routeKey(item.tripId, item.dayId) !== key &&
            currentDayKeys.includes(routeKey(item.tripId, item.dayId)),
        )
        entries.push(entry)
        const raw = JSON.stringify({ schemaVersion: 1, entries })
        parseRouteCache(raw)
        await store.set(ROUTE_CACHE_KEY, raw)
        return true
      }
      if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request('onway.routes.cache', persist)
      return persist()
    })
  }
}
