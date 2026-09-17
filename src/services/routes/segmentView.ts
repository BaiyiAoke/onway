import type { PlaceGroup, Trip, TripDay } from '../travel/types'
import {
  configFingerprint,
  daySegments,
  findRecord,
  matchingCache,
  segmentKey,
} from './transport'
import type { SegmentRequest, TransportOption } from './transportTypes'
import type { SegmentState } from './segmentController'
import type { RoutesState } from './controller'
import { selectDayRoute } from './view'

export function selectSegment(
  state: SegmentState,
  trip: Trip,
  r: SegmentRequest,
) {
  const key = segmentKey(r),
    record = findRecord(trip, r.dayId, r.from.id, r.to.id)
  const raw = state.operations[key]
  const operation = raw?.signature === configFingerprint(r) ? raw : undefined
  const cache =
    matchingCache(operation?.entry, r) ?? matchingCache(state.entries[key], r)
  const staleSelection =
    !!record?.selected &&
    record.selected.fingerprint !== configFingerprint(r) &&
    record.selected.confirmedFingerprint !== configFingerprint(r)
  const needsReview =
    (['train', 'flight'].includes(r.config.mode) && !!record?.needsReview) ||
    (r.config.mode === 'transit' && (!!record?.needsReview || staleSelection))
  let option: TransportOption | undefined
  let durationSeconds: number | undefined,
    distanceMeters: number | undefined,
    label = '尚未查询'
  if (r.config.mode === 'train' || r.config.mode === 'flight') {
    const journey = r.config.mode === 'flight' ? record?.flight : record?.train
    const kind = r.config.mode === 'flight' ? '航班' : '车次'
    if (journey && !needsReview) {
      durationSeconds =
        (Date.parse(journey.arrivalAt) - Date.parse(journey.departureAt)) / 1000
      label = journey.number + ' · 已记录'
    } else label = needsReview ? '待核对' + kind : '待记录' + kind
  } else if (r.config.mode === 'transit' && record?.selected) {
    if (!needsReview) {
      option = record.selected.option
      label = '已选方案'
    } else label = '已选方案待确认'
  } else {
    option = needsReview ? undefined : cache?.result.options[0]
    if (needsReview) label = '待核对交通时间'
    if (option) label = r.config.mode === 'transit' ? '推荐方案' : '路线估算'
  }
  if (option) {
    durationSeconds = option.durationSeconds
    distanceMeters = option.distanceMeters
  }
  const expired = !!cache && cache.expiresAt <= Date.now()
  return {
    record,
    operation,
    cache,
    option,
    durationSeconds,
    distanceMeters,
    label,
    needsReview,
    expired,
    busy: operation?.stage === 'calculating' || operation?.stage === 'saving',
    unsaved: operation?.stage === 'unsaved',
  }
}
export function dayTransport(
  state: SegmentState,
  legacy: RoutesState,
  trip: Trip,
  day: TripDay,
) {
  const requests = daySegments(trip, day)
  const views = requests.map((r) => ({
    request: r,
    ...selectSegment(state, trip, r),
  }))
  const completed = views.filter((v) => v.durationSeconds !== undefined)
  const old = selectDayRoute(legacy, trip.id, day)
  const legacyEntry =
    requests.length > 0 &&
    requests.every(
      (r) =>
        r.config.mode === 'driving' &&
        !state.entries[segmentKey(r)] &&
        !state.operations[segmentKey(r)]?.entry,
    ) &&
    old.entry
      ? old.entry
      : undefined
  return {
    legacyStale: old.stale,
    views,
    total: requests.length,
    completed: completed.length,
    durationSeconds: completed.reduce((n, v) => n + v.durationSeconds!, 0),
    distanceMeters: completed.reduce((n, v) => n + (v.distanceMeters ?? 0), 0),
    unknownDistance: completed.some((v) => v.distanceMeters === undefined),
    legacyEntry,
  }
}
export function transportLines(
  state: SegmentState,
  legacy: RoutesState,
  trip: Trip | null,
  group: PlaceGroup,
) {
  if (!trip || group === 'unscheduled') return []
  return trip.days.flatMap((day, index) => {
    if (group !== 'all' && group !== day.id) return []
    const summary = dayTransport(state, legacy, trip, day)
    if (summary.legacyEntry)
      return [
        { day, index, mode: 'driving' as const, entry: summary.legacyEntry },
      ]
    return summary.views.flatMap((v) =>
      (v.option?.steps ?? []).flatMap((step) =>
        step.lines.map((coordinates) => ({
          day,
          index,
          mode: step.mode,
          entry: {
            result: { geometry: { type: 'LineString' as const, coordinates } },
          },
        })),
      ),
    )
  })
}
