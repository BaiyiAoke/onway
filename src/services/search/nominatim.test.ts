import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NominatimSearch,
  normalizeEndpoint,
  parseSearchResults,
} from './nominatim'
import type { LocalStore } from '../storage/types'
const raw = [
  {
    lon: '103.8343',
    lat: '36.0611',
    osm_type: 'node',
    osm_id: 123,
    name: '兰州',
    display_name: '兰州, 甘肃, 中国',
  },
]
function fixture() {
  const values = new Map<string, string>()
  const store: LocalStore = {
    initialize: async () => {},
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value)
    },
  }
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(raw)))
  return { values, store, fetcher, search: new NominatimSearch(store, fetcher) }
}
afterEach(() => vi.useRealTimers())
describe('手动地点搜索', () => {
  it('验证坐标、来源及服务地址', () => {
    expect(parseSearchResults(raw)[0].source).toEqual({
      provider: 'osm',
      id: 'node:123',
    })
    expect(
      parseSearchResults([
        ...raw,
        { ...raw[0], lat: '91' },
        { ...raw[0], osm_type: 'script' },
      ]),
    ).toHaveLength(1)
    expect(normalizeEndpoint('https://example.org/nominatim/')).toBe(
      'https://example.org/nominatim',
    )
    expect(() => normalizeEndpoint('http://example.org')).toThrow('HTTPS')
    expect(() => normalizeEndpoint('https://user:pass@example.org')).toThrow()
  })
  it('缓存命中不再联网，取消请求不调用网络', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const first = f.search.search('兰州', new AbortController().signal)
    await vi.runAllTimersAsync()
    expect((await first).cached).toBe(false)
    const second = await f.search.search(' 兰州 ', new AbortController().signal)
    expect(second.cached).toBe(true)
    expect(f.fetcher).toHaveBeenCalledTimes(1)
    const controller = new AbortController()
    controller.abort()
    await expect(
      f.search.search('西宁', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.fetcher).toHaveBeenCalledTimes(1)
  })
  it('串行开始间隔至少 1.1 秒，切换服务不复用旧结果', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const starts: number[] = []
    f.fetcher.mockImplementation(async () => {
      starts.push(Date.now())
      return new Response(JSON.stringify(raw))
    })
    const first = f.search.search('兰州', new AbortController().signal)
    const second = f.search.search('西宁', new AbortController().signal)
    await vi.runAllTimersAsync()
    await Promise.all([first, second])
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100)
    await f.search.setEndpoint('https://example.org/osm')
    const third = f.search.search('兰州', new AbortController().signal)
    await vi.runAllTimersAsync()
    expect((await third).cached).toBe(false)
    expect(String(f.fetcher.mock.calls[2][0])).toContain(
      'https://example.org/osm/search?',
    )
  })
  it('超时不自动重试，过期缓存需要重新查询', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const first = f.search.search('兰州', new AbortController().signal)
    await vi.runAllTimersAsync()
    await first
    vi.setSystemTime(Date.now() + 25 * 3600000)
    f.fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('abort', 'AbortError')),
          ),
        ),
    )
    const pending = f.search.search('兰州', new AbortController().signal)
    const assertion = expect(pending).rejects.toThrow('超时')
    await vi.runAllTimersAsync()
    await assertion
    expect(f.fetcher).toHaveBeenCalledTimes(2)
  })
})
