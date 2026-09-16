import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ raw: null as string | null, writes: 0 }))
vi.mock('../storage', () => ({
  getLocalStore: async () => ({
    initialize: async () => {},
    get: async () => state.raw,
    set: async (_key: string, value: string) => {
      state.writes++
      state.raw = value
    },
  }),
}))
import {
  getDefaultSearchSettings,
  getSearchSettings,
  saveSearchSettings,
} from './service'
beforeEach(() => {
  state.raw = null
  state.writes = 0
  vi.stubEnv('VITE_AMAP_SEARCH_KEY', '0123456789abcdef0123456789abcdef')
})
afterEach(() => vi.unstubAllEnvs())
describe('私有构建默认搜索设置', () => {
  it('有效构建 Key 默认选高德，读取不强制写入设备', async () => {
    expect((await getSearchSettings()).provider).toBe('amap')
    expect((await getSearchSettings()).amapKey).toHaveLength(32)
    expect(state.writes).toBe(0)
  })
  it('没有构建 Key 则保留无需 Key 的搜索', () => {
    vi.stubEnv('VITE_AMAP_SEARCH_KEY', '')
    expect(getDefaultSearchSettings()).toEqual({ provider: 'osm', amapKey: '' })
  })
  it('设备手动选择优先于构建默认，允许更换和恢复', async () => {
    await saveSearchSettings({ provider: 'osm', amapKey: '' })
    expect(await getSearchSettings()).toEqual({ provider: 'osm', amapKey: '' })
    await saveSearchSettings(getDefaultSearchSettings())
    expect((await getSearchSettings()).provider).toBe('amap')
  })
  it('无效 Key 不覆盖已有设置', async () => {
    await saveSearchSettings({ provider: 'osm', amapKey: '' })
    const previous = state.raw
    await expect(
      saveSearchSettings({ provider: 'amap', amapKey: 'bad' }),
    ).rejects.toThrow('32')
    expect(state.raw).toBe(previous)
  })
})
