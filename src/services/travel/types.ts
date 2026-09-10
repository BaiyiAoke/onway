import type { Wgs84Point } from '../routes/types'

export interface TripPlace {
  id: string
  name: string
  note: string
  coordinates: Wgs84Point
  sourceUrl?: string
}

export interface TripDay {
  id: string
  places: TripPlace[]
}

export interface Trip {
  id: string
  name: string
  startDate: string | null
  days: TripDay[]
  unscheduledPlaces: TripPlace[]
}

export interface TravelWorkspace {
  schemaVersion: 1
  trips: Trip[]
  activeTripId: string | null
}

export type PlaceGroup = 'all' | 'unscheduled' | string

export type TravelAction =
  | {
      type: 'createTrip'
      name: string
      startDate: string | null
      dayCount: number
      demo?: boolean
    }
  | {
      type: 'updateTrip'
      tripId: string
      name: string
      startDate: string | null
    }
  | { type: 'deleteTrip'; tripId: string }
  | { type: 'selectTrip'; tripId: string }
  | { type: 'addDay'; tripId: string }
  | { type: 'deleteDay'; tripId: string; dayId: string }
  | {
      type: 'savePlace'
      tripId: string
      place: TripPlace
      dayId: string | null
    }
  | { type: 'deletePlace'; tripId: string; placeId: string }
  | { type: 'movePlace'; tripId: string; placeId: string; dayId: string | null }
  | { type: 'reorderPlace'; tripId: string; placeId: string; direction: -1 | 1 }
