import { getLocalStore } from '../storage'

export interface MapSettings {
  provider: 'openfreemap' | 'amap'
  amapJsKey: string
  securityJsCode: string
}
export const MAP_SETTINGS_KEY = 'map.plan.settings.v1'
const validKey = (value: string) => /^[a-f\d]{32}$/i.test(value)

export function getDefaultMapSettings(): MapSettings {
  const amapJsKey = import.meta.env.VITE_AMAP_JS_KEY?.trim() ?? ''
  const securityJsCode =
    import.meta.env.VITE_AMAP_JS_SECURITY_CODE?.trim() ?? ''
  return {
    provider:
      validKey(amapJsKey) && validKey(securityJsCode) ? 'amap' : 'openfreemap',
    amapJsKey,
    securityJsCode,
  }
}
function normalize(value: MapSettings): MapSettings {
  if (
    !['openfreemap', 'amap'].includes(value?.provider) ||
    typeof value.amapJsKey !== 'string' ||
    typeof value.securityJsCode !== 'string'
  )
    throw new Error('底图设置读取失败，请重新填写并保存。')
  const settings = {
    ...value,
    amapJsKey: value.amapJsKey.trim(),
    securityJsCode: value.securityJsCode.trim(),
  }
  if (settings.provider === 'amap') {
    if (!validKey(settings.amapJsKey))
      throw new Error('请输入 32 位高德 Web 端（JS API）Key。')
    if (!validKey(settings.securityJsCode))
      throw new Error('请输入对应的 32 位安全密钥 securityJsCode。')
  }
  return settings
}
export async function getMapSettings(): Promise<MapSettings> {
  const store = await getLocalStore()
  await store.initialize()
  const raw = await store.get(MAP_SETTINGS_KEY)
  return raw
    ? normalize(JSON.parse(raw) as MapSettings)
    : getDefaultMapSettings()
}
export async function saveMapSettings(
  value: MapSettings,
): Promise<MapSettings> {
  const settings = normalize(value)
  const store = await getLocalStore()
  await store.initialize()
  // JS API 配置只保存在当前设备，不复用 Web 服务 Key，也不进入旅行文档和备份。
  await store.set(MAP_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}
