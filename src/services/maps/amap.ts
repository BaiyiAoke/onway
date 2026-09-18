import AMapLoader from '@amap/amap-jsapi-loader'
import type {} from '@amap/amap-jsapi-types'
import gcoord from 'gcoord'
import type { Wgs84Point } from '../routes/types'
import { parseCoordinates } from '../travel/coordinates'
import type { MapSettings } from './settings'

export type AmapSdk = typeof AMap
export class AmapReloadRequired extends Error {
  constructor() {
    super('高德配置已更换，请重新打开页面后使用。')
  }
}
const loader = AMapLoader as typeof AMapLoader & { reset: () => void }
let request:
  { signature: string; promise: Promise<AmapSdk>; failed: boolean } | undefined

export function loadAmap(settings: MapSettings): Promise<AmapSdk> {
  const signature = settings.amapJsKey + ':' + settings.securityJsCode
  // 官方 SDK 是页面级单例；切换密钥时不重置在途脚本，防止旧回调覆盖新实例。
  if (request && request.signature !== signature)
    return Promise.reject(new AmapReloadRequired())
  if (request?.failed) {
    loader.reset()
    request = undefined
  }
  if (request) return request.promise
  const target = window as typeof window & {
    _AMapSecurityConfig?: { securityJsCode: string }
  }
  target._AMapSecurityConfig = { securityJsCode: settings.securityJsCode }
  const pending = {
    signature,
    failed: false,
    promise: loader.load({
      key: settings.amapJsKey,
      version: '2.0',
      plugins: [],
    }) as Promise<AmapSdk>,
  }
  pending.promise = pending.promise.catch(() => {
    pending.failed = true
    // SDK 原始错误可能带请求地址；界面和日志都不回显凭据。
    throw new Error('高德地图加载失败，请检查网络及 JS API 配置。')
  })
  request = pending
  return pending.promise
}

/** 地图边界统一转换；旅行文档和路线缓存仍保持 WGS84。 */
export function toAmapPoint(
  point: Pick<Wgs84Point, 'longitude' | 'latitude'>,
): [number, number] {
  return gcoord.transform(
    [point.longitude, point.latitude],
    gcoord.WGS84,
    gcoord.GCJ02,
  ) as [number, number]
}
export function fromAmapPoint(longitude: number, latitude: number): Wgs84Point {
  return parseCoordinates(String(longitude), String(latitude), 'GCJ02')
}
