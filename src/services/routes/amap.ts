import gcoord from 'gcoord'
import { amapJson } from '../amap/client'
import { getSearchSettings } from '../search/service'
import { getLocalStore } from '../storage'
import type { LocalStore } from '../storage/types'
import { isObject, isPoint } from './model'
import { routeService } from './osrm'
import type {
  CityInfo,
  SegmentRequest,
  SegmentResult,
  SegmentService,
  TransportOption,
  TransportStep,
  TransportPoint,
} from './transportTypes'
import { validCity } from './transportValidation'

function obj(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
function metric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim()))
    return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
function gcj(point: TransportPoint): string {
  if (!isPoint(point.coordinates)) throw new Error('地点坐标无效。')
  return gcoord
    .transform(
      [point.coordinates.longitude, point.coordinates.latitude],
      gcoord.WGS84,
      gcoord.GCJ02,
    )
    .map((n) => n.toFixed(6))
    .join(',')
}
// 只转换接口提供的连续几何；不连接公交、铁路缺失的区间。
function lines(value: unknown): [number, number][][] {
  if (typeof value !== 'string' || !value) return []
  const points = value.split(';').map((part) => part.split(',').map(Number))
  if (
    points.length < 2 ||
    points.some(
      (p) =>
        p.length !== 2 ||
        !isPoint({ longitude: p[0], latitude: p[1], crs: 'WGS84' }),
    )
  )
    return []
  return [
    points.map(
      (p) =>
        gcoord.transform(p as [number, number], gcoord.GCJ02, gcoord.WGS84) as [
          number,
          number,
        ],
    ),
  ]
}
function step(
  value: unknown,
  mode: TransportStep['mode'],
  instruction = '',
): TransportStep {
  const s = obj(value)
  return {
    mode,
    instruction: str(s.instruction) || instruction,
    departureStop: str(obj(s.departure_stop).name) || undefined,
    arrivalStop: str(obj(s.arrival_stop).name) || undefined,
    distanceMeters: metric(s.distance ?? s.step_distance),
    durationSeconds: metric(obj(s.cost).duration ?? s.time ?? s.duration),
    lines: lines(s.polyline),
  }
}
function transitSteps(value: unknown): TransportStep[] {
  return list(value).flatMap((raw) => {
    const s = obj(raw),
      result: TransportStep[] = []
    for (const walk of list(obj(s.walking).steps))
      result.push(step(walk, 'walking', '步行'))
    const buses = list(obj(s.bus).buslines)
    // 同一乘车段的多条 busline 是备选线路，不应当作连续换乘重复累计。
    if (buses.length) {
      const b = obj(buses[0])
      result.push(
        step(
          b,
          str(b.type).includes('地铁') ? 'subway' : 'bus',
          str(b.name) || '公共交通',
        ),
      )
    }
    const rail = obj(s.railway)
    if (Object.keys(rail).length)
      result.push(
        step(
          rail,
          'railway',
          [str(rail.name), str(rail.trip)].filter(Boolean).join(' · ') ||
            '铁路',
        ),
      )
    if (Object.keys(obj(s.taxi)).length)
      result.push(step(s.taxi, 'taxi', '出租车接驳'))
    return result
  })
}
export function parseAmapRoute(
  body: unknown,
  mode: SegmentRequest['config']['mode'],
  at = new Date().toISOString(),
): SegmentResult {
  const route = obj(obj(body).route)
  const candidates = list(mode === 'transit' ? route.transits : route.paths)
  if (!candidates.length)
    throw new Error('未找到可用方案，请调整地点、时间或交通方式。')
  const options: TransportOption[] = candidates
    .slice(0, mode === 'transit' ? 3 : 1)
    .flatMap((raw, index) => {
      const p = obj(raw),
        distanceMeters = metric(p.distance),
        durationSeconds = metric(obj(p.cost).duration ?? p.duration)
      if (distanceMeters === undefined || durationSeconds === undefined)
        return []
      const steps =
        mode === 'transit'
          ? transitSteps(p.segments)
          : list(p.steps).map((s) =>
              step(s, mode === 'walking' ? 'walking' : 'driving'),
            )
      return [
        {
          id: 'amap-' + index,
          distanceMeters,
          durationSeconds,
          source: '高德地图',
          calculatedAt: at,
          steps,
        },
      ]
    })
  if (!options.length) throw new Error('路线缺少有效距离或耗时，请重新查询。')
  return { options }
}
export class AmapSegmentService implements SegmentService {
  constructor(
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private key: () => Promise<string> = async () =>
      (await getSearchSettings()).amapKey,
  ) {}
  async calculateSegment(
    r: SegmentRequest,
    signal: AbortSignal,
  ): Promise<SegmentResult> {
    if (r.config.mode === 'train' || r.config.mode === 'flight')
      throw new Error('手动车次和航班无需在线算路。')
    if (r.config.provider === 'osrm') {
      if (r.config.mode !== 'driving') throw new Error('OSRM 当前仅用于自驾。')
      const result = await routeService.calculateDrivingRoute(
        [r.from.coordinates, r.to.coordinates],
        signal,
      )
      return {
        options: [
          {
            id: 'osrm',
            distanceMeters: result.distanceMeters,
            durationSeconds: result.durationSeconds,
            source: result.source,
            calculatedAt: result.calculatedAt,
            steps: [
              {
                mode: 'driving',
                instruction: '自驾',
                lines: [result.geometry.coordinates],
              },
            ],
          },
        ],
      }
    }
    const key = await this.key()
    if (!/^[a-f\d]{32}$/i.test(key))
      throw new Error('请在地图服务设置中保存高德 Web 服务 Key。')
    const mode = r.config.mode
    const url = new URL(
      'https://restapi.amap.com/v5/direction/' +
        (mode === 'transit' ? 'transit/integrated' : mode),
    )
    url.search = new URLSearchParams({
      key,
      origin: gcj(r.from),
      destination: gcj(r.to),
      show_fields: 'cost,polyline',
    }).toString()
    if (mode === 'transit') {
      if (!r.from.citycode || !r.to.citycode)
        throw new Error('缺少城市编码，请重试识别城市。')
      if (!r.config.departure)
        throw new Error('请先设置公共交通出发日期和时间。')
      const time = new Date(
        r.config.departure.kind === 'now' ? Date.now() : r.config.departure.at,
      )
      const china = new Date(time.getTime() + 8 * 3600000).toISOString()
      url.searchParams.set('date', china.slice(0, 10))
      url.searchParams.set('time', china.slice(11, 16).replace(':', '-'))
      url.searchParams.set('city1', r.from.citycode)
      url.searchParams.set('city2', r.to.citycode)
      if (r.from.adcode) url.searchParams.set('ad1', r.from.adcode)
      if (r.to.adcode) url.searchParams.set('ad2', r.to.adcode)
      url.searchParams.set('strategy', String(r.config.strategy))
      url.searchParams.set('AlternativeRoute', '3')
    }
    return parseAmapRoute(await amapJson(url, signal, this.fetcher), mode)
  }
}
export class CityResolver {
  constructor(
    private source: () => Promise<LocalStore> = getLocalStore,
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private key: () => Promise<string> = async () =>
      (await getSearchSettings()).amapKey,
  ) {}
  async resolve(point: TransportPoint, signal: AbortSignal): Promise<CityInfo> {
    if (point.citycode && validCity(point))
      return {
        citycode: point.citycode,
        adcode: point.adcode,
        cityName: point.cityName,
      }
    const store = await this.source()
    await store.initialize()
    const cacheKey = 'amap.city.' + gcj(point)
    const raw = await store.get(cacheKey)
    if (raw) {
      try {
        const cached = JSON.parse(raw)
        if (
          isObject(cached) &&
          typeof cached.citycode === 'string' &&
          validCity(cached)
        )
          return cached
      } catch {
        /* 可重建的城市缓存损坏时重新识别。 */
      }
    }
    const key = await this.key()
    if (!/^[a-f\d]{32}$/i.test(key))
      throw new Error('请先配置高德 Web 服务 Key。')
    const url = new URL('https://restapi.amap.com/v3/geocode/regeo')
    url.search = new URLSearchParams({
      key,
      location: gcj(point),
      extensions: 'base',
    }).toString()
    const result = obj(
      obj((await amapJson(url, signal, this.fetcher)).regeocode)
        .addressComponent,
    )
    const city: CityInfo = {
      citycode: str(result.citycode) || undefined,
      adcode: str(result.adcode) || undefined,
      cityName: str(result.city) || str(result.province) || undefined,
    }
    if (!city.citycode || !validCity(city))
      throw new Error('此地点未识别到可用城市编码，请检查位置后重试。')
    if (signal.aborted) throw new DOMException('请求已取消', 'AbortError')
    await store.set(cacheKey, JSON.stringify(city))
    return city
  }
}
