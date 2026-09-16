export interface Wgs84Point {
  longitude: number
  latitude: number
  crs: 'WGS84'
}

export interface RouteResult {
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distanceMeters: number
  durationSeconds: number
  legs: {
    fromIndex: number
    toIndex: number
    distanceMeters: number
    durationSeconds: number
  }[]
  source: string
  calculatedAt: string
}

// 道路路线来自实际算路服务；保留 WGS84、米与秒，不以直线或虚构估时替代。
export interface RouteService {
  calculateDrivingRoute(
    waypoints: readonly Wgs84Point[],
    signal?: AbortSignal,
  ): Promise<RouteResult>
}
