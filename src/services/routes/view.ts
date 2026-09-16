import type { PlaceGroup, Trip, TripDay } from '../travel/types'
import type { RoutesState } from './controller'
import { matchesRoute, routeFingerprint, routeKey } from './model'

export function selectDayRoute(
  state: RoutesState,
  tripId: string,
  day: TripDay,
) {
  const key = routeKey(tripId, day.id)
  const cached = state.entries[key]
  const pending = state.operations[key]
  const operation =
    pending?.fingerprint === routeFingerprint(day) ? pending : undefined
  const entry = matchesRoute(operation?.entry, day)
    ? operation?.entry
    : matchesRoute(cached, day)
      ? cached
      : undefined
  return {
    entry,
    operation,
    busy: operation?.stage === 'calculating' || operation?.stage === 'saving',
    unsaved: !!entry && entry === operation?.entry,
    stale: day.places.length >= 2 && !!cached && !matchesRoute(cached, day),
  }
}

export function visibleDayRoutes(
  state: RoutesState,
  trip: Trip | null,
  group: PlaceGroup,
) {
  if (!trip || group === 'unscheduled') return []
  return trip.days.flatMap((day, index) => {
    if (group !== 'all' && group !== day.id) return []
    const view = selectDayRoute(state, trip.id, day)
    return view.entry ? [{ day, index, entry: view.entry }] : []
  })
}
