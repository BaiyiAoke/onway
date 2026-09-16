import type { TripDay } from '../travel/types'
import type { RouteResult, Wgs84Point } from './types'

export const ROUTE_PROVIDER = 'fossgis-osrm-driving-v1-radius1000'
export const ROUTE_SOURCE = 'OSRM · FOSSGIS / OpenStreetMap'
// MapLibre paint 不解析 CSS var()，路线配色只能写在这里。
// ROUTE_COLORS 是区分各天的功能色，不跟随品牌配色；
// ROUTE_HALO_COLOR 与 CSS 的 --surface-card 同值，改配色时需同步。
export const ROUTE_COLORS = [
  '#2563eb',
  '#0d8076',
  '#9b4a87',
  '#b16b20',
  '#6659b8',
]
export const ROUTE_HALO_COLOR = '#fffefa'

export interface CachedRoute {
  tripId: string
  dayId: string
  fingerprint: string
  result: RouteResult
}

export function routeKey(tripId: string, dayId: string): string {
  return JSON.stringify([tripId, dayId])
}

// 名称、备注和日历日期不参与匹配；仅道路计算的实际输入变化才失效。
export function routeFingerprint(day: TripDay): string {
  return JSON.stringify([
    ROUTE_PROVIDER,
    day.places.map(({ id, coordinates }) => [
      id,
      coordinates.longitude,
      coordinates.latitude,
      coordinates.crs,
    ]),
  ])
}

export function matchesRoute(
  entry: CachedRoute | undefined,
  day: TripDay,
): boolean {
  return (
    day.places.length >= 2 &&
    entry?.fingerprint === routeFingerprint(day) &&
    entry.result.legs.length === day.places.length - 1
  )
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isPoint(value: unknown): value is Wgs84Point {
  if (!isObject(value)) return false
  return (
    value.crs === 'WGS84' && isCoordinate([value.longitude, value.latitude])
  )
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    Math.abs(value[1]) <= 90
  )
}

export function isMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isRouteResult(value: unknown): value is RouteResult {
  if (!isObject(value) || !isObject(value.geometry)) return false
  return (
    value.geometry.type === 'LineString' &&
    Array.isArray(value.geometry.coordinates) &&
    value.geometry.coordinates.length >= 2 &&
    value.geometry.coordinates.every(isCoordinate) &&
    isMetric(value.distanceMeters) &&
    isMetric(value.durationSeconds) &&
    Array.isArray(value.legs) &&
    value.legs.length >= 1 &&
    value.legs.every(
      (leg, index) =>
        isObject(leg) &&
        leg.fromIndex === index &&
        leg.toIndex === index + 1 &&
        isMetric(leg.distanceMeters) &&
        isMetric(leg.durationSeconds),
    ) &&
    typeof value.source === 'string' &&
    value.source.length > 0 &&
    typeof value.calculatedAt === 'string' &&
    Number.isFinite(Date.parse(value.calculatedAt))
  )
}

export function formatDistance(meters: number): string {
  return meters < 1000
    ? Math.round(meters) + ' 米'
    : (meters / 1000).toFixed(1) + ' 公里'
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return '不足 1 分钟'
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours
    ? hours + ' 小时' + (minutes % 60 ? ' ' + (minutes % 60) + ' 分钟' : '')
    : minutes + ' 分钟'
}
