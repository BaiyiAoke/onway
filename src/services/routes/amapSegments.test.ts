import { afterEach, describe, it, expect, vi } from 'vitest'
import { AmapSegmentService, parseAmapRoute } from './amap'
import { AmapQueue, amapJson } from '../amap/client'
import { configFingerprint, daySegments, recordForRequest } from './transport'
import { transportLines } from './segmentView'
import { validOption } from './transportValidation'
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
  it('公交 2.0 的嵌套几何进入已选方案与地图，缺失铁路区间不补线', () => {
    // 与实网返回保持同一层级：公交及其中的步行把坐标串放在 polyline.polyline。
    const response = {
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
                      instruction: '步行至车站',
                      polyline: { polyline: '116.4,39.9;116.401,39.901' },
                    },
                  ],
                },
              },
              {
                bus: {
                  buslines: [
                    {
                      name: '地铁示例线',
                      type: '地铁线路',
                      departure_stop: { name: '甲站' },
                      arrival_stop: { name: '乙站' },
                      polyline: { polyline: '116.401,39.901;116.41,39.91' },
                    },
                    {
                      name: '备选线路',
                      polyline: { polyline: '116.5,39.9;116.6,39.91' },
                    },
                  ],
                },
              },
              {
                railway: {
                  name: '城际列车',
                  time: '1800',
                  departure_stop: { name: '乙站' },
                  arrival_stop: { name: '丙站' },
                },
              },
              {
                bus: {
                  buslines: [
                    {
                      name: '公交示例线',
                      type: '普通公交线路',
                      polyline: { polyline: '116.45,39.95;116.46,39.96' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    }
    const option = parseAmapRoute(response, 'transit').options[0]
    expect(validOption(option)).toBe(true)
    expect(option.steps.map((s) => s.mode)).toEqual([
      'walking',
      'subway',
      'railway',
      'bus',
    ])
    expect(option.steps.map((s) => s.lines.length)).toEqual([1, 1, 0, 1])
    expect(option.steps[1]).toMatchObject({
      departureStop: '甲站',
      arrivalStop: '乙站',
    })
    expect(option.durationSeconds).toBe(3600)
    expect(option.steps[0].lines[0][0][0]).not.toBe(116.4)
    expect(
      response.route.transits[0].segments[0].walking!.steps[0].polyline
        .polyline,
    ).toBe('116.4,39.9;116.401,39.901')

    const trip = travelFixture().trips[0],
      day = trip.days[0]
    const request = daySegments(trip, day)[0],
      record = recordForRequest(trip, request)
    record.config = {
      mode: 'transit',
      provider: 'amap',
      strategy: 0,
      departure: { kind: 'now' },
    }
    record.selected = {
      fingerprint: configFingerprint({ ...request, config: record.config }),
      option,
    }
    trip.transport = [record]
    const empty = {
      status: 'ready' as const,
      entries: {},
      operations: {},
      error: null,
    }
    const lines = transportLines(empty, empty, trip, day.id)
    expect(lines.map((line) => line.mode)).toEqual(['walking', 'subway', 'bus'])
    expect(lines.map((line) => line.entry.result.geometry.coordinates)).toEqual(
      [
        option.steps[0].lines[0],
        option.steps[1].lines[0],
        option.steps[3].lines[0],
      ],
    )
  })
  it.each(['driving', 'walking'] as const)(
    '保留 %s 的字符串坐标格式',
    (mode) => {
      const result = parseAmapRoute(body, mode)
      expect(result.options[0].steps[0].lines[0]).toHaveLength(2)
      expect(result.options[0].steps[0].mode).toBe(mode)
    },
  )
  it.each([
    { polyline: '' },
    { polyline: [] },
    { polyline: null },
    { polyline: '116.4,39.9' },
    { polyline: '116.4,39.9;999,40' },
    { polyline: '116.4,39.9;,40' },
    { polyline: '116.4,39.9;116.5, ' },
  ])('嵌套坐标损坏时保留方案文字而不画线：%j', (polyline) => {
    const result = parseAmapRoute(
      {
        route: {
          transits: [
            {
              distance: '1000',
              cost: { duration: '600' },
              segments: [{ bus: { buslines: [{ name: '公交', polyline }] } }],
            },
          ],
        },
      },
      'transit',
    )
    expect(result.options[0].steps[0].lines).toEqual([])
    expect(result.options[0].steps[0].instruction).toBe('公交')
    expect(result.options[0].durationSeconds).toBe(600)
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
