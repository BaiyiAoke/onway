import { Capacitor } from '@capacitor/core'
import { AppLauncher } from '@capacitor/app-launcher'
import type { TripPlace } from '../travel/types'
import { isPoint } from '../routes/model'

export function canUseAmap(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function amapNavigationUrl(place: TripPlace): string {
  if (!isPoint(place.coordinates))
    throw new Error('地点坐标无效，请重新选点并保存。')
  // WGS84 交由高德转换；不要在 Onway 再做一次 GCJ-02 偏移。
  const parameters = new URLSearchParams({
    sourceApplication: 'Onway',
    poiname: place.name,
    lat: String(place.coordinates.latitude),
    lon: String(place.coordinates.longitude),
    dev: '1',
    style: '2',
  })
  return 'androidamap://navi?' + parameters.toString().replace(/\+/g, '%20')
}

export async function navigateWithAmap(place: TripPlace): Promise<void> {
  if (!canUseAmap()) throw new Error('请在 Android 版 Onway 中打开高德导航。')
  const url = amapNavigationUrl(place)
  let installed: boolean
  try {
    installed = (await AppLauncher.canOpenUrl({ url: 'com.autonavi.minimap' }))
      .value
  } catch (error) {
    throw new Error('无法检查高德地图，请确认应用可用后重试。', {
      cause: error,
    })
  }
  if (!installed) throw new Error('未检测到高德地图，请安装后重试。')
  try {
    if (!(await AppLauncher.openUrl({ url })).completed)
      throw new Error('高德没有接受导航请求。')
  } catch (error) {
    throw new Error('无法打开高德地图，请确认应用可用后重试。', {
      cause: error,
    })
  }
}
