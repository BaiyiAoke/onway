import type { Wgs84Point } from '../routes/types'
import type { CityInfo, TransportRecord } from '../routes/transportTypes'

export interface TripPlace extends CityInfo {
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
  transport?: TransportRecord[]
}

export interface PlaceCategory {
  id: string
  name: string
  builtin: boolean
}

export interface TravelWorkspace {
  schemaVersion: 4
  libraryPlaces: TripPlace[]
  categories: PlaceCategory[]
  trips: Trip[]
  activeTripId: string | null
}

export type PlaceGroup = 'all' | 'unscheduled' | string

/** 仅用于当前编辑会话的移动撤销，不写入旅行文档。 */
export interface PlacementSnapshot {
  days: { id: string; placeIds: string[] }[]
  unscheduledIds: string[]
  transport?: TransportRecord[]
}

export type TravelAction =
  | {
      type: 'relocatePlace'
      tripId: string
      placeId: string
      dayId: string | null
      beforePlaceId: string | null
      expected: string
    }
  | {
      type: 'restorePlacement'
      tripId: string
      placement: PlacementSnapshot
      expected: string
    }
  | {
      type: 'saveTransport'
      tripId: string
      record: TransportRecord
      expected?: string
    }
  | { type: 'deleteTransport'; tripId: string; recordId: string }
  | {
      type: 'savePlaceCity'
      tripId: string
      placeId: string
      coordinates: Wgs84Point
      city: CityInfo
    }
  | { type: 'saveLibraryPlace'; place: TripPlace; allowDuplicate?: boolean }
  | { type: 'deleteLibraryPlace'; placeId: string }
  | {
      type: 'copyToTrip'
      placeId: string
      tripId: string
      dayId: string | null
      afterPlaceId?: string
      beforePlaceId?: string | null
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
      preventDuplicate?: boolean
      tripId: string
      place: TripPlace
      dayId: string | null
      afterPlaceId?: string
      beforePlaceId?: string | null
    }
  | { type: 'deletePlace'; tripId: string; placeId: string }
  | { type: 'movePlace'; tripId: string; placeId: string; dayId: string | null }
  | {
      type: 'reorderPlace'
      tripId: string
      placeId: string
      direction: -1 | 1 | 'top' | 'bottom'
    }
