import { getLocalStore } from '../storage'
import type { LocalStore } from '../storage/types'
import { parseCoordinates } from '../travel/coordinates'
import type { SearchPlace } from './nominatim'
const CACHE_KEY = 'search.amap-cache.v1'
interface Entry {
  query: string
  at: number
  results: SearchPlace[]
}
let queue: Promise<unknown> = Promise.resolve()
export function parseAmapResults(value: unknown): SearchPlace[] {
  if (!value || typeof value !== 'object')
    throw new Error('高德返回了无效结果。')
  const response = value as {
    status?: string
    infocode?: string
    pois?: unknown[]
  }
  if (response.status !== '1') {
    const code = response.infocode ?? ''
    const message = [
      '10003',
      '10004',
      '10010',
      '10019',
      '10020',
      '10021',
      '10044',
    ].includes(code)
      ? '高德配额或调用频率已达限制，请查看控制台后重试。'
      : code === '10009'
        ? 'Key 平台不匹配，请使用 Web 服务类型 Key。'
        : ['10001', '10005', '10007', '10008', '10012', '10013'].includes(code)
          ? '高德 Key 无效、权限不足或安全配置不匹配，请检查搜索设置。'
          : '高德搜索暂时不可用，请手动重试。'
    throw new Error(message + (code ? '（' + code + '）' : ''))
  }
  if (!Array.isArray(response.pois)) throw new Error('高德返回了无效结果。')
  return response.pois.slice(0, 10).flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const poi = value as Record<string, unknown>
    if (
      typeof poi.name !== 'string' ||
      !poi.name.trim() ||
      typeof poi.id !== 'string' ||
      !/^[\w-]+$/.test(poi.id) ||
      typeof poi.location !== 'string'
    )
      return []
    const parts = poi.location.split(',')
    if (parts.length !== 2) return []
    try {
      const coordinates = parseCoordinates(parts[0], parts[1], 'GCJ02')
      const address = [poi.pname, poi.cityname, poi.adname, poi.address]
        .filter(
          (part, index, all) =>
            typeof part === 'string' && part && all.indexOf(part) === index,
        )
        .join('')
      const url = new URL('https://uri.amap.com/marker')
      url.search = new URLSearchParams({
        position: poi.location,
        name: poi.name,
        coordinate: 'gaode',
        callnative: '0',
      }).toString()
      return [
        {
          name: poi.name,
          address,
          note: '',
          coordinates,
          source: { provider: 'amap' as const, id: poi.id },
          sourceUrl: url.href,
        },
      ]
    } catch {
      return []
    }
  })
}
export class AmapSearch {
  constructor(
    private source: LocalStore | (() => Promise<LocalStore>) = getLocalStore,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  search(
    query: string,
    key: string,
    signal: AbortSignal,
  ): Promise<{ results: SearchPlace[]; cached: boolean }> {
    const q = query.trim().replace(/\s+/g, ' ')
    if (!q || q.length > 200)
      return Promise.reject(new Error('请输入 1–200 字的地点或地址。'))
    if (!/^[a-f\d]{32}$/i.test(key))
      return Promise.reject(
        new Error('请先在搜索设置中保存有效的高德 Web 服务 Key。'),
      )
    const operation = async () => {
      const check = () => {
        if (signal.aborted) throw new DOMException('查询已取消', 'AbortError')
      }
      check()
      const store =
        typeof this.source === 'function' ? await this.source() : this.source
      await store.initialize()
      let entries: Entry[] = []
      const raw = await store.get(CACHE_KEY)
      try {
        const parsed = raw ? JSON.parse(raw) : []
        if (Array.isArray(parsed))
          entries = parsed.filter(
            (entry) =>
              typeof entry.query === 'string' &&
              Number.isFinite(entry.at) &&
              entry.at <= Date.now() &&
              Date.now() - entry.at < 86400000 &&
              Array.isArray(entry.results) &&
              entry.results.every(
                (p: SearchPlace) =>
                  typeof p.name === 'string' &&
                  typeof p.note === 'string' &&
                  p.source?.provider === 'amap' &&
                  typeof p.source.id === 'string' &&
                  p.coordinates?.crs === 'WGS84' &&
                  Number.isFinite(p.coordinates.longitude) &&
                  Math.abs(p.coordinates.longitude) <= 180 &&
                  Number.isFinite(p.coordinates.latitude) &&
                  Math.abs(p.coordinates.latitude) <= 90 &&
                  typeof p.sourceUrl === 'string' &&
                  p.sourceUrl.startsWith('https://uri.amap.com/marker?'),
              ),
          )
      } catch {
        /* 搜索缓存损坏可重查，不接触旅行数据。 */
      }
      const hit = entries.find((entry) => entry.query === q)
      if (hit) return { results: structuredClone(hit.results), cached: true }
      check()
      if (typeof navigator !== 'undefined' && !navigator.onLine)
        throw new Error('当前离线，可输入经纬度添加地点。')
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal.addEventListener('abort', abort, { once: true })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, 15000)
      try {
        const url = new URL('https://restapi.amap.com/v3/place/text')
        url.search = new URLSearchParams({
          key,
          keywords: q,
          offset: '10',
          page: '1',
          extensions: 'base',
        }).toString()
        const response = await this.fetcher(url, { signal: controller.signal })
        if (!response.ok) throw new Error('高德搜索连接失败，请手动重试。')
        const results = parseAmapResults(await response.json())
        check()
        entries = [
          { query: q, at: Date.now(), results },
          ...entries.filter((entry) => entry.query !== q),
        ].slice(0, 50)
        await store.set(CACHE_KEY, JSON.stringify(entries))
        return { results, cached: false }
      } catch (reason) {
        check()
        if (timedOut)
          throw new Error('搜索超时，请检查网络后重试。', { cause: reason })
        if (reason instanceof TypeError)
          throw new Error('高德搜索连接失败，请检查网络。', { cause: reason })
        throw reason
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
    }
    const result = queue.then(operation)
    queue = result.catch(() => undefined)
    return result
  }
}
