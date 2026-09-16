import { getLocalStore } from '../storage'
import { AmapSearch } from './amap'
import { placeSearch } from './nominatim'
export interface SearchSettings {
  provider: 'osm' | 'amap'
  amapKey: string
}
const KEY = 'search.provider.v1'
const amap = new AmapSearch()
export function getDefaultSearchSettings(): SearchSettings {
  // 私有构建可预置个人 Key；设备上保存的设置优先，切换服务不会覆盖个人选择。
  const key = import.meta.env.VITE_AMAP_SEARCH_KEY?.trim() ?? ''
  return /^[a-f\d]{32}$/i.test(key)
    ? { provider: 'amap', amapKey: key }
    : { provider: 'osm', amapKey: '' }
}
export async function getSearchSettings(): Promise<SearchSettings> {
  const store = await getLocalStore()
  await store.initialize()
  const raw = await store.get(KEY)
  if (!raw) return getDefaultSearchSettings()
  const value = JSON.parse(raw) as SearchSettings
  if (
    !['osm', 'amap'].includes(value.provider) ||
    typeof value.amapKey !== 'string'
  )
    throw new Error('搜索设置读取失败，请重新保存。')
  return value
}
export async function saveSearchSettings(value: SearchSettings) {
  const key = value.amapKey.trim()
  if (value.provider === 'amap' && !/^[a-f\d]{32}$/i.test(key))
    throw new Error('请输入 32 位高德 Web 服务 Key。')
  const store = await getLocalStore()
  await store.initialize()
  // 用户覆盖值只保存在当前设备；不进入搜索缓存或错误日志。
  await store.set(
    KEY,
    JSON.stringify({ provider: value.provider, amapKey: key }),
  )
}
export async function searchPlaces(query: string, signal: AbortSignal) {
  const settings = await getSearchSettings()
  // 不自动回退到其他供应商，避免额外请求和不明确的数据发送。
  return settings.provider === 'amap'
    ? amap.search(query, settings.amapKey, signal)
    : placeSearch.search(query, signal)
}
