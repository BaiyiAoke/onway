import { describe, expect, it, vi } from 'vitest'
import { AmapSearch, parseAmapResults } from './amap'
import type { LocalStore } from '../storage/types'
const response = {
  status: '1',
  infocode: '10000',
  pois: [
    {
      id: 'B123',
      name: '公开测试地点',
      pname: '甘肃省',
      cityname: '兰州市',
      adname: '永登县',
      address: '机场大道',
      location: '103.633554,36.515199',
    },
  ],
}
describe('高德可选搜索', () => {
  it('转换高德坐标并保存 POI 来源', () => {
    const result = parseAmapResults(response)[0]
    expect(result.source).toEqual({ provider: 'amap', id: 'B123' })
    expect(result.coordinates.crs).toBe('WGS84')
    expect(Math.abs(result.coordinates.longitude - 103.633554)).toBeGreaterThan(
      0.0001,
    )
    expect(result.address).toBe('甘肃省兰州市永登县机场大道')
  })
  it('显示平台与配额错误，不用空结果伪装成功', () => {
    expect(() => parseAmapResults({ status: '0', infocode: '10009' })).toThrow(
      '平台不匹配',
    )
    expect(() => parseAmapResults({ status: '0', infocode: '10003' })).toThrow(
      '配额',
    )
    expect(parseAmapResults({ ...response, pois: [] })).toEqual([])
  })
  it('缓存命中不消耗第二次请求，不持久化 Key 或请求 URL', async () => {
    const values = new Map<string, string>()
    const store: LocalStore = {
      initialize: async () => {},
      get: async (k) => values.get(k) ?? null,
      set: async (k, v) => {
        values.set(k, v)
      },
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response)))
    const service = new AmapSearch(store, fetcher)
    const key = '0123456789abcdef0123456789abcdef'
    expect(
      (await service.search('公开地点', key, new AbortController().signal))
        .cached,
    ).toBe(false)
    expect(
      (await service.search('公开地点', key, new AbortController().signal))
        .cached,
    ).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect([...values.values()].join('')).not.toContain(key)
    expect([...values.values()].join('')).not.toContain('restapi.amap.com')
  })
})
