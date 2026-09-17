import type { CachedSegment } from './transportTypes'
import { validOption } from './transportValidation'
import { getLocalStore } from '../storage'
import { isAtomicStore, RESTORE_EPOCH_KEY } from '../storage/atomic'
import type { LocalStore } from '../storage/types'
import { isObject, isRouteResult, routeKey, type CachedRoute } from './model'

export const ROUTE_CACHE_KEY = 'routes.cache'
export interface RouteCacheDocument {
  schemaVersion: 2
  entries: CachedRoute[]
  segments: CachedSegment[]
}

export function parseRouteCache(raw: string | null): RouteCacheDocument {
  if (raw === null) return { schemaVersion: 2, entries: [], segments: [] }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('路线缓存无法解析，原数据已保留。')
  }
  if (
    !isObject(value) ||
    ![1, 2].includes(Number(value.schemaVersion)) ||
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
  if (value.schemaVersion === 1)
    return {
      schemaVersion: 2,
      entries: value.entries as CachedRoute[],
      segments: [],
    }
  if (!Array.isArray(value.segments))
    throw new Error('路线缓存格式异常，原数据已保留。')
  const segmentKeys = new Set<string>()
  for (const entry of value.segments) {
    if (
      !isObject(entry) ||
      typeof entry.key !== 'string' ||
      segmentKeys.has(entry.key) ||
      typeof entry.fingerprint !== 'string' ||
      typeof entry.configFingerprint !== 'string' ||
      typeof entry.expiresAt !== 'number' ||
      !Number.isFinite(entry.expiresAt) ||
      !isObject(entry.result) ||
      !Array.isArray(entry.result.options) ||
      !entry.result.options.length ||
      !entry.result.options.every(validOption)
    )
      throw new Error('分段缓存格式异常，原数据已保留。')
    segmentKeys.add(entry.key)
  }
  return value as unknown as RouteCacheDocument
}

export class RouteCacheRepository {
  private queue: Promise<unknown> = Promise.resolve()
  private restoreEpoch: string | null | undefined
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
    return this.enqueue(async () => {
      const store = await this.store()
      const snapshot = isAtomicStore(store)
        ? await store.readBatch([ROUTE_CACHE_KEY, RESTORE_EPOCH_KEY])
        : null
      this.restoreEpoch = snapshot?.[RESTORE_EPOCH_KEY] ?? null
      return parseRouteCache(
        snapshot ? snapshot[ROUTE_CACHE_KEY] : await store.get(ROUTE_CACHE_KEY),
      )
    })
  }

  saveSegment(
    entry: CachedSegment,
    currentKeys: readonly string[],
    stillCurrent: () => boolean,
  ): Promise<boolean> {
    return this.enqueue(async () => {
      const persist = async () => {
        const store = await this.store()
        const snapshot = isAtomicStore(store)
          ? await store.readBatch([ROUTE_CACHE_KEY, RESTORE_EPOCH_KEY])
          : null
        const epoch = snapshot?.[RESTORE_EPOCH_KEY] ?? null
        if (this.restoreEpoch === undefined) this.restoreEpoch = epoch
        if (epoch !== this.restoreEpoch || !stillCurrent()) return false
        const current = parseRouteCache(
          snapshot
            ? snapshot[ROUTE_CACHE_KEY]
            : await store.get(ROUTE_CACHE_KEY),
        )
        const segments = current.segments.filter(
          (s) => s.key !== entry.key && currentKeys.includes(s.key),
        )
        segments.push(entry)
        const raw = JSON.stringify({ ...current, segments })
        parseRouteCache(raw)
        if (!stillCurrent()) return false
        if (isAtomicStore(store) && snapshot)
          await store.writeBatch({ [ROUTE_CACHE_KEY]: raw }, snapshot)
        else await store.set(ROUTE_CACHE_KEY, raw)
        return true
      }
      return typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('onway.routes.cache', persist)
        : persist()
    })
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
        const snapshot = isAtomicStore(store)
          ? await store.readBatch([ROUTE_CACHE_KEY, RESTORE_EPOCH_KEY])
          : null
        const epoch = snapshot?.[RESTORE_EPOCH_KEY] ?? null
        if (this.restoreEpoch === undefined) this.restoreEpoch = epoch
        // 恢复以前发出的请求，即使途经点恰好相同，也不能写回已清空的缓存。
        if (epoch !== this.restoreEpoch) return false
        const current = parseRouteCache(
          snapshot
            ? snapshot[ROUTE_CACHE_KEY]
            : await store.get(ROUTE_CACHE_KEY),
        )
        if (!stillCurrent()) return false
        const key = routeKey(entry.tripId, entry.dayId)
        const entries = current.entries.filter(
          (item) =>
            routeKey(item.tripId, item.dayId) !== key &&
            currentDayKeys.includes(routeKey(item.tripId, item.dayId)),
        )
        entries.push(entry)
        const raw = JSON.stringify({
          schemaVersion: 2,
          entries,
          segments: current.segments,
        })
        parseRouteCache(raw)
        if (isAtomicStore(store) && snapshot)
          await store.writeBatch({ [ROUTE_CACHE_KEY]: raw }, snapshot)
        else await store.set(ROUTE_CACHE_KEY, raw)
        return true
      }
      if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request('onway.routes.cache', persist)
      return persist()
    })
  }
}
