import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  fail: false,
  set: vi.fn(),
}))
vi.mock('../storage', () => ({
  getLocalStore: async () => ({
    initialize: async () => {},
    get: async (key: string) => storage.values.get(key) ?? null,
    set: async (key: string, value: string) => {
      if (storage.fail) throw new Error('保存失败')
      storage.set(key, value)
      storage.values.set(key, value)
    },
  }),
}))
import {
  getMapSettings,
  getDefaultMapSettings,
  saveMapSettings,
  MAP_SETTINGS_KEY,
  type MapSettings,
} from './settings'
const configured: MapSettings = {
  provider: 'amap',
  amapJsKey: 'a'.repeat(32),
  securityJsCode: 'b'.repeat(32),
}
beforeEach(() => {
  storage.values.clear()
  storage.fail = false
  storage.set.mockClear()
  vi.stubEnv('VITE_AMAP_JS_KEY', '')
  vi.stubEnv('VITE_AMAP_JS_SECURITY_CODE', '')
  vi.stubEnv('VITE_AMAP_SEARCH_KEY', 'c'.repeat(32))
})
afterEach(() => vi.unstubAllEnvs())
describe('计划页设备底图配置', () => {
  it('不把 Web 服务 Key 当作 JS API Key，读取默认配置不写入设备', async () => {
    expect(await getMapSettings()).toEqual({
      provider: 'openfreemap',
      amapJsKey: '',
      securityJsCode: '',
    })
    expect(storage.set).not.toHaveBeenCalled()
  })
  it('仅完整的私有构建 JS 配置默认启用高德，设备选择仍优先', async () => {
    vi.stubEnv('VITE_AMAP_JS_KEY', configured.amapJsKey)
    expect(getDefaultMapSettings().provider).toBe('openfreemap')
    vi.stubEnv('VITE_AMAP_JS_SECURITY_CODE', configured.securityJsCode)
    expect(getDefaultMapSettings()).toEqual(configured)
    await saveMapSettings({ ...configured, provider: 'openfreemap' })
    expect((await getMapSettings()).provider).toBe('openfreemap')
  })
  it('配置独立保存且保留其它设备数据', async () => {
    storage.values.set('search.provider.v1', '原来的搜索配置')
    storage.values.set('travel.workspace', '原来的旅行文档')
    await saveMapSettings({
      ...configured,
      amapJsKey: ' ' + configured.amapJsKey + ' ',
    })
    expect(await getMapSettings()).toEqual(configured)
    expect(storage.set).toHaveBeenCalledWith(
      MAP_SETTINGS_KEY,
      JSON.stringify(configured),
    )
    expect(storage.values.get('search.provider.v1')).toBe('原来的搜索配置')
    expect(storage.values.get('travel.workspace')).toBe('原来的旅行文档')
  })
  it('缺少安全密钥不覆盖已有配置，存储失败可重试', async () => {
    await saveMapSettings(configured)
    await expect(
      saveMapSettings({ ...configured, securityJsCode: '' }),
    ).rejects.toThrow('安全密钥')
    storage.fail = true
    await expect(
      saveMapSettings({ ...configured, provider: 'openfreemap' }),
    ).rejects.toThrow('保存失败')
    expect(await getMapSettings()).toEqual(configured)
    storage.fail = false
    await saveMapSettings({ ...configured, provider: 'openfreemap' })
    expect((await getMapSettings()).provider).toBe('openfreemap')
  })
  it('损坏配置报告失败，不静默覆盖', async () => {
    storage.values.set(MAP_SETTINGS_KEY, '{}')
    await expect(getMapSettings()).rejects.toThrow('底图设置读取失败')
    expect(storage.set).not.toHaveBeenCalled()
  })
})
