import type { Wgs84Point } from '../routes/types'

export interface TripPlace {
  id: string
  name: string
  note: string
  coordinates: Wgs84Point
  address?: string
  categoryId?: string
  source?: { provider: 'osm' | 'amap'; id: string }
  libraryPlaceId?: string
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

export interface PlaceCategory {
  id: string
  name: string
  builtin: boolean
}

export interface TravelWorkspace {
  schemaVersion: 2
  libraryPlaces: TripPlace[]
  categories: PlaceCategory[]
  trips: Trip[]
  activeTripId: string | null
}

export type PlaceGroup = 'all' | 'unscheduled' | string

export type TravelAction =
  | { type: 'saveLibraryPlace'; place: TripPlace; allowDuplicate?: boolean }
  | { type: 'deleteLibraryPlace'; placeId: string }
  | {
      type: 'copyToTrip'
      placeId: string
      tripId: string
      dayId: string | null
      allowDuplicate?: boolean
    }
  | {
      type: 'collectPlace'
      tripId: string
      placeId: string
      allowDuplicate?: boolean
    }
  | { type: 'saveCategory'; id?: string; name: string }
  | { type: 'deleteCategory'; id: string }
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
