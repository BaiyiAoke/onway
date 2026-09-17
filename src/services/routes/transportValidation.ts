import { isMetric, isObject, isPoint } from './model'
import type {
  CityInfo,
  TransportOption,
  TransportRecord,
} from './transportTypes'

export function validCity(value: CityInfo): boolean {
  return (
    (value.citycode === undefined ||
      (typeof value.citycode === 'string' &&
        /^\d{3,4}$/.test(value.citycode))) &&
    (value.adcode === undefined ||
      (typeof value.adcode === 'string' && /^\d{6}$/.test(value.adcode))) &&
    (value.cityName === undefined || typeof value.cityName === 'string')
  )
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
export function validInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const day = value.slice(0, 10)
  const parsed = new Date(day + 'T00:00:00Z')
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  )
    return false
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  )
}
export function validOption(value: unknown): value is TransportOption {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !text(value.source) ||
    !validInstant(value.calculatedAt) ||
    !isMetric(value.distanceMeters) ||
    !isMetric(value.durationSeconds) ||
    !Array.isArray(value.steps)
  )
    return false
  return value.steps.every(
    (s) =>
      isObject(s) &&
      ['driving', 'walking', 'bus', 'subway', 'railway', 'taxi'].includes(
        String(s.mode),
      ) &&
      typeof s.instruction === 'string' &&
      (s.departureStop === undefined || typeof s.departureStop === 'string') &&
      (s.arrivalStop === undefined || typeof s.arrivalStop === 'string') &&
      (s.distanceMeters === undefined || isMetric(s.distanceMeters)) &&
      (s.durationSeconds === undefined || isMetric(s.durationSeconds)) &&
      Array.isArray(s.lines) &&
      s.lines.every(
        (line) =>
          Array.isArray(line) &&
          line.length >= 2 &&
          line.every(
            (p) =>
              Array.isArray(p) &&
              p.length === 2 &&
              isPoint({ longitude: p[0], latitude: p[1], crs: 'WGS84' }),
          ),
      ),
  )
}
export function validTransport(value: unknown): value is TransportRecord {
  if (
    !isObject(value) ||
    !text(value.id) ||
    !(value.dayId === null || text(value.dayId)) ||
    !isObject(value.config)
  )
    return false
  for (const p of [value.from, value.to])
    if (
      !isObject(p) ||
      !text(p.id) ||
      !text(p.name) ||
      !isPoint(p.coordinates) ||
      !validCity(p)
    )
      return false
  const c = value.config
  if (
    !['driving', 'walking', 'transit', 'train', 'flight'].includes(
      String(c.mode),
    ) ||
    !['amap', 'osrm'].includes(String(c.provider)) ||
    ![0, 2, 7].includes(Number(c.strategy)) ||
    typeof c.strategy !== 'number' ||
    (c.provider === 'osrm' && c.mode !== 'driving')
  )
    return false
  if (
    c.departure !== undefined &&
    (!isObject(c.departure) ||
      !(
        c.departure.kind === 'now' ||
        (c.departure.kind === 'scheduled' && validInstant(c.departure.at))
      ))
  )
    return false
  if (
    c.reviewedDate !== undefined &&
    c.reviewedDate !== null &&
    (typeof c.reviewedDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(c.reviewedDate))
  )
    return false
  if (value.needsReview !== undefined && typeof value.needsReview !== 'boolean')
    return false
  if (
    value.selected !== undefined &&
    (!isObject(value.selected) ||
      !text(value.selected.fingerprint) ||
      (value.selected.confirmedFingerprint !== undefined &&
        !text(value.selected.confirmedFingerprint)) ||
      !validOption(value.selected.option))
  )
    return false
  // 两种手动记录独立保留；切换方式不能丢失已确定的车次或航班。
  for (const [journey, departure, arrival] of [
    [value.train, 'departureStation', 'arrivalStation'],
    [value.flight, 'departureAirport', 'arrivalAirport'],
  ] as const) {
    if (journey === undefined) continue
    const t = journey
    if (
      !isObject(t) ||
      !text(t.number) ||
      !text(t[departure]) ||
      !text(t[arrival]) ||
      typeof t.note !== 'string' ||
      !validInstant(t.departureAt) ||
      !validInstant(t.arrivalAt) ||
      Date.parse(t.arrivalAt) <= Date.parse(t.departureAt)
    )
      return false
  }
  return true
}
// 手选方案是业务数据，备份仅保留明确允许的字段，不携带供应商原始响应或 Key。
export function cleanOption(o: TransportOption): TransportOption {
  return {
    id: o.id,
    distanceMeters: o.distanceMeters,
    durationSeconds: o.durationSeconds,
    source: o.source,
    calculatedAt: o.calculatedAt,
    steps: o.steps.map((s) => ({
      mode: s.mode,
      instruction: s.instruction,
      departureStop: s.departureStop,
      arrivalStop: s.arrivalStop,
      distanceMeters: s.distanceMeters,
      durationSeconds: s.durationSeconds,
      lines: s.lines.map((l) => l.map((p) => [p[0], p[1]])),
    })),
  }
}
export function cleanTransport(r: TransportRecord): TransportRecord {
  const point = (p: TransportRecord['from']) => ({
    id: p.id,
    name: p.name,
    coordinates: {
      longitude: p.coordinates.longitude,
      latitude: p.coordinates.latitude,
      crs: 'WGS84' as const,
    },
    citycode: p.citycode,
    adcode: p.adcode,
    cityName: p.cityName,
  })
  return {
    id: r.id,
    dayId: r.dayId,
    from: point(r.from),
    to: point(r.to),
    needsReview: r.needsReview,
    config: {
      mode: r.config.mode,
      provider: r.config.provider,
      strategy: r.config.strategy,
      reviewedDate: r.config.reviewedDate,
      departure:
        r.config.departure?.kind === 'now'
          ? { kind: 'now' }
          : r.config.departure && {
              kind: 'scheduled',
              at: r.config.departure.at,
            },
    },
    selected: r.selected && {
      fingerprint: r.selected.fingerprint,
      confirmedFingerprint: r.selected.confirmedFingerprint,
      option: cleanOption(r.selected.option),
    },
    flight: r.flight && {
      number: r.flight.number,
      departureAirport: r.flight.departureAirport,
      arrivalAirport: r.flight.arrivalAirport,
      departureAt: r.flight.departureAt,
      arrivalAt: r.flight.arrivalAt,
      note: r.flight.note,
    },
    train: r.train && {
      number: r.train.number,
      departureStation: r.train.departureStation,
      arrivalStation: r.train.arrivalStation,
      departureAt: r.train.departureAt,
      arrivalAt: r.train.arrivalAt,
      note: r.train.note,
    },
  }
}
