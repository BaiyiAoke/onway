import { afterEach, describe, it, expect, vi } from 'vitest'
import { AmapSegmentService, parseAmapRoute } from './amap'
import { AmapQueue, amapJson } from '../amap/client'
import { daySegments } from './transport'
import { travelFixture, deferred } from '../../test/transportFixtures'
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const body = {
  status: '1',
  route: {
    paths: [
      {
        distance: '2500',
        cost: { duration: '500' },
        steps: [
          {
            instruction: '沿道路行驶',
            polyline: '116.466485,39.995197;116.46424,40.020642',
          },
        ],
      },
    ],
  },
}
describe('高德结果与坐标边界', () => {
  it('请求转换到 GCJ-02，结果转回 WGS84 并读取 cost.duration', async () => {
    const w = travelFixture(),
      r = daySegments(w.trips[0], w.trips[0].days[0])[0],
      fetcher = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(body)),
      )
    const result = await new AmapSegmentService(fetcher, async () =>
      'a'.repeat(32),
    ).calculateSegment(r, new AbortController().signal)
    const url = new URL(String(fetcher.mock.calls[0][0]))
    expect(url.searchParams.get('origin')).not.toBe('116.400000,39.900000')
    expect(url.searchParams.get('show_fields')).toBe('cost,polyline')
    expect(result.options[0].durationSeconds).toBe(500)
    expect(result.options[0].steps[0].lines[0][0][0]).not.toBe(116.466485)
  })
  it('解析公交、步行和铁路，空段忽略，不拼接没有几何的铁路', () => {
    const result = parseAmapRoute(
      {
        route: {
          transits: [
            {
              distance: '12000',
              cost: { duration: '3600' },
              segments: [
                {
                  walking: {
                    steps: [
                      {
                        instruction: '步行',
                        polyline: '116.4,39.9;116.41,39.91',
                      },
                    ],
                  },
                },
                {
                  bus: {
                    buslines: [
                      {
                        name: '地铁1号线',
                        type: '地铁线路',
                        departure_stop: { name: '甲站' },
                        arrival_stop: { name: '乙站' },
                      },
                      { name: '另一备选线路' },
                    ],
                  },
                },
                {
                  railway: {
                    name: 'G123',
                    departure_stop: { name: '北京南' },
                    arrival_stop: { name: '天津' },
                    time: '1800',
                  },
                },
                {},
              ],
            },
          ],
        },
      },
      'transit',
    )
    const option = result.options[0]
    expect(option.durationSeconds).toBe(3600)
    expect(option.steps).toHaveLength(3)
    expect(option.steps[2].lines).toEqual([])
    expect(option.steps[1].mode).toBe('subway')
  })
  it('空方案和缺失指标明确报错，畸形几何不会伪造直线', () => {
    expect(() => parseAmapRoute({ route: { paths: [] } }, 'walking')).toThrow(
      '未找到',
    )
    expect(() =>
      parseAmapRoute(
        { route: { paths: [{ distance: '', cost: { duration: '20' } }] } },
        'walking',
      ),
    ).toThrow('缺少')
    expect(
      parseAmapRoute(
        {
          route: {
            paths: [
              {
                distance: '0',
                cost: { duration: '0' },
                steps: [{ polyline: '999,1;2,3' }],
              },
            ],
          },
        },
        'walking',
      ).options[0].steps[0].lines,
    ).toEqual([])
  })
})
describe('高德共用调度', () => {
  it('550ms 开始间隔、最多两个在途请求，重复查询共享结果', async () => {
    vi.useFakeTimers()
    const queue = new AmapQueue(),
      pending = deferred<string>(),
      starts: number[] = []
    const run = vi.fn(async () => {
        starts.push(Date.now())
        return pending.promise
      }),
      signal = new AbortController().signal
    const a = queue.run('a', run, signal),
      same = queue.run('a', run, signal),
      b = queue.run('b', run, signal),
      c = queue.run('c', run, signal)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(550)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1100)
    expect(run).toHaveBeenCalledTimes(2)
    pending.resolve('done')
    await vi.runAllTimersAsync()
    await Promise.all([a, same, b, c])
    expect(run).toHaveBeenCalledTimes(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(550)
  })
  it('取消一个订阅者不取消其他订阅者，全部取消才中止请求', async () => {
    const queue = new AmapQueue(),
      pending = deferred<string>(),
      one = new AbortController(),
      two = new AbortController()
    let underlying: AbortSignal | undefined
    const operation = async (signal: AbortSignal) => {
      underlying = signal
      return pending.promise
    }
    const first = queue.run('same', operation, one.signal),
      second = queue.run('same', operation, two.signal),
      rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    one.abort()
    await rejected
    expect(underlying!.aborted).toBe(false)
    pending.resolve('ok')
    expect(await second).toBe('ok')
  })
  it('限流只重试一次，配额耗尽不重试', async () => {
    vi.useFakeTimers()
    const url = new URL('https://restapi.amap.com/test'),
      signal = new AbortController().signal
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: '1' })))
    const result = amapJson(url, signal, fetcher, new AmapQueue())
    await vi.advanceTimersByTimeAsync(2100)
    expect(await result).toMatchObject({ status: '1' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const denied = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status: '0', infocode: '10003' })),
    )
    await expect(
      amapJson(url, signal, denied, new AmapQueue()),
    ).rejects.toThrow('配额')
    expect(denied).toHaveBeenCalledOnce()
  })
})
