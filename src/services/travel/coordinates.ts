import gcoord from 'gcoord'
import type { Wgs84Point } from '../routes/types'

export type CoordinateSystem = 'WGS84' | 'GCJ02'

export function parseCoordinates(
  longitude: string,
  latitude: string,
  system: CoordinateSystem,
): Wgs84Point {
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
  if (!decimal.test(longitude.trim()) || !decimal.test(latitude.trim()))
    throw new Error('请填写有效的经度和纬度。')
  const lng = Number(longitude),
    lat = Number(latitude)
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90)
    throw new Error('经度应在 -180～180，纬度应在 -90～90。')
  // 仅在输入来源为高德时转换，存储与再次编辑始终使用 WGS84。
  const point =
    system === 'GCJ02'
      ? gcoord.transform([lng, lat], gcoord.GCJ02, gcoord.WGS84)
      : [lng, lat]
  return { longitude: point[0], latitude: point[1], crs: 'WGS84' }
}

export function splitCoordinates(text: string): [string, string] | null {
  const parts = text.trim().split(/\s*[,，;；]\s*|\s+/)
  return parts.length === 2 &&
    parts.every((p) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(p))
    ? [parts[0], parts[1]]
    : null
}
