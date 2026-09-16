import { getLocalStore } from '../storage'
import type { LocalStore } from '../storage/types'
import type { TripPlace } from '../travel/types'

export const DEFAULT_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org'
const SETTINGS_KEY = 'search.settings.v1'
const CACHE_KEY = 'search.cache.v1'
const DAY = 24 * 60 * 60 * 1000
export type SearchPlace = Omit<TripPlace, 'id'>
interface CacheEntry {
  key: string
  at: number
  results: SearchPlace[]
}
interface CacheDocument {
  entries: CacheEntry[]
  lastStart: number
}
let queue: Promise<unknown> = Promise.resolve()

export function normalizeEndpoint(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('请输入完整的 HTTPS 服务地址。')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('服务地址必须使用 HTTPS，且不能包含账号、参数或锚点。')
  return url.href.replace(/\/+$/, '')
}
function abortError() {
  return new DOMException('查询已取消', 'AbortError')
}
function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError()
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    throwIfAborted(signal)
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    const abort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
export function parseSearchResults(value: unknown): SearchPlace[] {
  if (!Array.isArray(value)) throw new Error('搜索服务返回了无效结果。')
  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const longitude = Number(item.lon),
      latitude = Number(item.lat)
    const kind = item.osm_type
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90 ||
      !['node', 'way', 'relation'].includes(kind) ||
      !/^\d+$/.test(String(item.osm_id)) ||
      typeof item.display_name !== 'string'
    )
      return []
    const name = String(
      item.namedetails?.['name:zh'] ||
        item.name ||
        item.display_name.split(',')[0],
    ).trim()
    if (!name) return []
    return [
      {
        name,
        address: item.display_name,
        note: '',
        coordinates: { longitude, latitude, crs: 'WGS84' as const },
        source: { provider: 'osm' as const, id: kind + ':' + item.osm_id },
        sourceUrl: 'https://www.openstreetmap.org/' + kind + '/' + item.osm_id,
      },
    ]
  })
}
function readCache(raw: string | null): CacheDocument {
  if (!raw) return { entries: [], lastStart: 0 }
  try {
    const value = JSON.parse(raw) as CacheDocument
    if (!Array.isArray(value.entries) || !Number.isFinite(value.lastStart))
      throw Error()
    // 缓存不包含业务数据；损坏的条目可丢弃，绝不修改旅行工作区。
    value.entries = value.entries.filter(
      (entry) =>
        typeof entry.key === 'string' &&
        Number.isFinite(entry.at) &&
        Array.isArray(entry.results) &&
        entry.results.every(
          (place) =>
            typeof place.name === 'string' &&
            typeof place.address === 'string' &&
            place.source?.provider === 'osm' &&
            /^(node|way|relation):\d+$/.test(place.source.id) &&
            /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(
              place.sourceUrl ?? '',
            ) &&
            place.coordinates?.crs === 'WGS84' &&
            Number.isFinite(place.coordinates.longitude) &&
            Math.abs(place.coordinates.longitude) <= 180 &&
            Number.isFinite(place.coordinates.latitude) &&
            Math.abs(place.coordinates.latitude) <= 90,
        ),
    )
    return value
  } catch {
    return { entries: [], lastStart: 0 }
  }
}

export class NominatimSearch {
  constructor(
    private source: LocalStore | (() => Promise<LocalStore>) = getLocalStore,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  private async store() {
    const store =
      typeof this.source === 'function' ? await this.source() : this.source
    await store.initialize()
    return store
  }
  async endpoint(): Promise<string> {
    const raw = await (await this.store()).get(SETTINGS_KEY)
    if (!raw) return DEFAULT_SEARCH_ENDPOINT
    try {
      return normalizeEndpoint(JSON.parse(raw).endpoint)
    } catch {
      throw new Error('搜索服务配置无效，请重新保存服务地址。')
    }
  }
  async setEndpoint(value: string) {
    const endpoint = normalizeEndpoint(value)
    await (await this.store()).set(SETTINGS_KEY, JSON.stringify({ endpoint }))
  }
  search(
    query: string,
    signal: AbortSignal,
  ): Promise<{ results: SearchPlace[]; cached: boolean }> {
    const q = query.trim().replace(/\s+/g, ' ')
    if (!q || q.length > 200)
      return Promise.reject(new Error('请输入 1–200 字的地点或地址。'))
    const operation = async () => {
      const execute = async () => {
        throwIfAborted(signal)
        const store = await this.store()
        const endpoint = await this.endpoint()
        const key = endpoint + '\n' + q.toLocaleLowerCase()
        const cache = readCache(await store.get(CACHE_KEY))
        cache.entries = cache.entries.filter(
          (entry) => Date.now() - entry.at < DAY && entry.at <= Date.now(),
        )
        const hit = cache.entries.find((entry) => entry.key === key)
        if (hit) return { results: structuredClone(hit.results), cached: true }
        if (typeof navigator !== 'undefined' && !navigator.onLine)
          throw new Error('当前离线，可输入经纬度添加地点。')
        // 整个查询串行，跨标签页再用 Web Locks；公共服务请求起点至少间隔 1.1 秒。
        await pause(
          Math.max(0, Math.min(1100, cache.lastStart + 1100 - Date.now())),
          signal,
        )
        throwIfAborted(signal)
        cache.lastStart = Date.now()
        await store.set(CACHE_KEY, JSON.stringify(cache))
        throwIfAborted(signal)
        const controller = new AbortController()
        const abort = () => controller.abort()
        signal.addEventListener('abort', abort, { once: true })
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, 15000)
        try {
          const url = new URL(endpoint + '/search')
          url.search = new URLSearchParams({
            q,
            format: 'jsonv2',
            addressdetails: '1',
            namedetails: '1',
            limit: '10',
            'accept-language': 'zh-CN',
          }).toString()
          const response = await this.fetcher(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          })
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? '查询过于频繁，请稍后手动重试。'
                : '搜索服务暂时不可用，请稍后重试。',
            )
          const results = parseSearchResults(await response.json())
          throwIfAborted(signal)
          cache.entries = [
            { key, at: Date.now(), results },
            ...cache.entries.filter((entry) => entry.key !== key),
          ].slice(0, 50)
          await store.set(CACHE_KEY, JSON.stringify(cache))
          return { results, cached: false }
        } catch (reason) {
          if (signal.aborted) throw abortError()
          if (timedOut)
            throw new Error('搜索超时，请检查网络后重试。', { cause: reason })
          if (reason instanceof TypeError)
            throw new Error('搜索连接失败，请检查网络或服务地址。', {
              cause: reason,
            })
          throw reason
        } finally {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
        }
      }
      if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request(
          'onway.search.request',
          { signal },
          execute,
        )
      return execute()
    }
    const result = queue.then(operation)
    queue = result.catch(() => undefined)
    return result
  }
}
export const placeSearch = new NominatimSearch()
