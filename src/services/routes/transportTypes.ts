import type { Wgs84Point } from './types'

export type TransportMode =
  'driving' | 'walking' | 'transit' | 'train' | 'flight'
export type RouteProvider = 'amap' | 'osrm'
export interface CityInfo {
  citycode?: string
  adcode?: string
  cityName?: string
}
export interface TransportPoint extends CityInfo {
  id: string
  name: string
  coordinates: Wgs84Point
}
export type Departure = { kind: 'now' } | { kind: 'scheduled'; at: string }
export interface TransportConfig {
  mode: TransportMode
  provider: RouteProvider
  strategy: 0 | 2 | 7
  departure?: Departure
  reviewedDate?: string | null
}
export interface TransportStep {
  mode: 'driving' | 'walking' | 'bus' | 'subway' | 'railway' | 'taxi'
  instruction: string
  departureStop?: string
  arrivalStop?: string
  distanceMeters?: number
  durationSeconds?: number
  lines: [number, number][][]
}
export interface TransportOption {
  id: string
  distanceMeters: number
  durationSeconds: number
  source: string
  calculatedAt: string
  steps: TransportStep[]
}
export interface TrainJourney {
  number: string
  departureStation: string
  arrivalStation: string
  departureAt: string
  arrivalAt: string
  note: string
}
export interface FlightJourney {
  number: string
  departureAirport: string
  arrivalAirport: string
  departureAt: string
  arrivalAt: string
  note: string
}
export interface TransportRecord {
  id: string
  dayId: string | null
  from: TransportPoint
  to: TransportPoint
  config: TransportConfig
  selected?: {
    fingerprint: string
    confirmedFingerprint?: string
    option: TransportOption
  }
  train?: TrainJourney
  flight?: FlightJourney
  needsReview?: boolean
}
export interface SegmentRequest {
  tripId: string
  dayId: string
  from: TransportPoint
  to: TransportPoint
  config: TransportConfig
  date: string | null
}
export interface SegmentResult {
  options: TransportOption[]
}
export interface SegmentService {
  calculateSegment(
    request: SegmentRequest,
    signal: AbortSignal,
  ): Promise<SegmentResult>
}
export interface CachedSegment {
  key: string
  fingerprint: string
  configFingerprint: string
  expiresAt: number
  result: SegmentResult
}
