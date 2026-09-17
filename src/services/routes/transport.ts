import type { Trip, TripDay, TripPlace } from '../travel/types'
import type {
  CachedSegment,
  SegmentRequest,
  TransportConfig,
  TransportPoint,
  TransportRecord,
} from './transportTypes'

export const MODE_LABELS = {
  driving: '自驾',
  walking: '步行',
  transit: '公共交通',
  train: '火车',
  flight: '飞机',
}
export const DEFAULT_CONFIG: TransportConfig = {
  mode: 'driving',
  provider: 'amap',
  strategy: 0,
}
export function dayDate(trip: Trip, dayId: string): string | null {
  if (!trip.startDate) return null
  const date = new Date(trip.startDate + 'T00:00:00Z')
  date.setUTCDate(
    date.getUTCDate() + trip.days.findIndex((d) => d.id === dayId),
  )
  return date.toISOString().slice(0, 10)
}
export function pointSnapshot(place: TripPlace): TransportPoint {
  return {
    id: place.id,
    name: place.name,
    coordinates: { ...place.coordinates },
    citycode: place.citycode,
    adcode: place.adcode,
    cityName: place.cityName,
  }
}
export function segmentKey(
  r: Pick<SegmentRequest, 'tripId' | 'dayId' | 'from' | 'to'>,
): string {
  return JSON.stringify([r.tripId, r.dayId, r.from.id, r.to.id])
}
export function pointSignature(p: TransportPoint): string {
  return JSON.stringify([p.id, p.coordinates.longitude, p.coordinates.latitude])
}
export function findRecord(
  trip: Trip,
  dayId: string,
  fromId: string,
  toId: string,
) {
  return trip.transport?.find(
    (r) => r.dayId === dayId && r.from.id === fromId && r.to.id === toId,
  )
}
export function daySegments(trip: Trip, day: TripDay): SegmentRequest[] {
  return day.places.slice(1).map((to, i) => {
    const from = day.places[i]
    const record = findRecord(trip, day.id, from.id, to.id)
    return {
      tripId: trip.id,
      dayId: day.id,
      from: pointSnapshot(from),
      to: pointSnapshot(to),
      config: record?.config ?? { ...DEFAULT_CONFIG },
      date: dayDate(trip, day.id),
    }
  })
}
// 名称、备注不参与算路签名；公交日期与城市信息参与匹配。
export function configFingerprint(r: SegmentRequest): string {
  return JSON.stringify([
    'segment-v1',
    r.config.mode,
    r.config.provider,
    pointSignature(r.from),
    pointSignature(r.to),
    ...(r.config.mode === 'transit'
      ? [
          r.from.citycode,
          r.from.adcode,
          r.to.citycode,
          r.to.adcode,
          r.config.strategy,
          r.config.departure,
          r.date,
        ]
      : []),
  ])
}
export function requestFingerprint(
  r: SegmentRequest,
  now = Date.now(),
): string {
  return JSON.stringify([
    configFingerprint(r),
    r.config.mode === 'transit' && r.config.departure?.kind === 'now'
      ? Math.floor(now / 300000)
      : null,
  ])
}
export function segmentTtl(r: SegmentRequest): number {
  return r.config.mode === 'walking' || r.config.provider === 'osrm'
    ? 86400000
    : 300000
}
export function matchingCache(
  entry: CachedSegment | undefined,
  r: SegmentRequest,
) {
  return entry?.configFingerprint === configFingerprint(r) ? entry : undefined
}
// 交通记录属于端点关系。关系消失后脱离当天，但保留快照和用户已确定的信息。
export function reconcileTransport(trip: Trip, previous?: Trip): void {
  for (const record of trip.transport ?? []) {
    if (record.dayId === null) continue
    const day = trip.days.find((d) => d.id === record.dayId)
    const index = day?.places.findIndex((p) => p.id === record.from.id) ?? -1
    if (!day || index < 0 || day.places[index + 1]?.id !== record.to.id) {
      record.dayId = null
      record.needsReview = true
      continue
    }
    const changed =
      pointSignature(record.from) !== pointSignature(day.places[index]) ||
      pointSignature(record.to) !== pointSignature(day.places[index + 1])
    const dateChanged =
      previous &&
      dayDate(previous, record.dayId) !== dayDate(trip, record.dayId)
    if (
      changed ||
      (dateChanged &&
        (record.train || record.flight || record.config.mode === 'transit'))
    )
      record.needsReview = true
  }
}
export function recordForRequest(
  trip: Trip,
  r: SegmentRequest,
): TransportRecord {
  return structuredClone(
    findRecord(trip, r.dayId, r.from.id, r.to.id) ?? {
      id: crypto.randomUUID(),
      dayId: r.dayId,
      from: r.from,
      to: r.to,
      config: r.config,
    },
  )
}
