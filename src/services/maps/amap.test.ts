import { beforeEach, describe, expect, it, vi } from 'vitest'
const loader = vi.hoisted(() => ({ load: vi.fn(), reset: vi.fn() }))
vi.mock('@amap/amap-jsapi-loader', () => ({ default: loader }))
const settings = {
  provider: 'amap' as const,
  amapJsKey: 'a'.repeat(32),
  securityJsCode: 'b'.repeat(32),
}
beforeEach(() => {
  vi.resetModules()
  loader.load.mockReset()
  loader.reset.mockReset()
})
describe('高德 SDK 边界', () => {
  it('先设置安全密钥，同一配置的并发和后续加载复用同一请求', async () => {
    const { loadAmap } = await import('./amap')
    const sdk = { Map: 'SDK' }
    loader.load.mockImplementation(async () => {
      expect(
        (window as unknown as { _AMapSecurityConfig: unknown })
          ._AMapSecurityConfig,
      ).toEqual({ securityJsCode: settings.securityJsCode })
      return sdk
    })
    const first = loadAmap(settings),
      second = loadAmap(settings)
    expect(first).toBe(second)
    expect(await second).toBe(sdk)
    expect(await loadAmap(settings)).toBe(sdk)
    expect(loader.load).toHaveBeenCalledTimes(1)
  })
  it('在途更换密钥要求重开，旧响应不会被当作新配置', async () => {
    const { loadAmap } = await import('./amap')
    let resolve!: (value: unknown) => void
    loader.load.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const pending = loadAmap(settings)
    await expect(
      loadAmap({ ...settings, securityJsCode: 'c'.repeat(32) }),
    ).rejects.toThrow('重新打开页面')
    expect(loader.reset).not.toHaveBeenCalled()
    resolve({})
    await pending
    expect(loader.load).toHaveBeenCalledTimes(1)
  })
  it('已失败的请求可重试，原始异常不回显凭据', async () => {
    const { loadAmap } = await import('./amap')
    loader.load
      .mockRejectedValueOnce(
        new Error('https://example.invalid/?key=' + settings.amapJsKey),
      )
      .mockResolvedValueOnce({})
    await expect(loadAmap(settings)).rejects.toThrow(
      '高德地图加载失败，请检查网络及 JS API 配置。',
    )
    await loadAmap(settings)
    expect(loader.reset).toHaveBeenCalledOnce()
    expect(loader.load).toHaveBeenCalledTimes(2)
  })
  it('地点和线路转入 GCJ02，选点转回 WGS84，不改写原坐标', async () => {
    const { toAmapPoint, fromAmapPoint } = await import('./amap')
    const point = { longitude: 116.4, latitude: 39.9, crs: 'WGS84' as const }
    const [lng, lat] = toAmapPoint(point)
    expect(Math.abs(lng - point.longitude)).toBeGreaterThan(0.001)
    const restored = fromAmapPoint(lng, lat)
    expect(restored.longitude).toBeCloseTo(point.longitude, 5)
    expect(restored.latitude).toBeCloseTo(point.latitude, 5)
    expect(restored.crs).toBe('WGS84')
    expect(point.longitude).toBe(116.4)
  })
})
