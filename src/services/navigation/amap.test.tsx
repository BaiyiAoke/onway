import { fireEvent, render, screen } from '@testing-library/react'
import { Capacitor } from '@capacitor/core'
import { AppLauncher } from '@capacitor/app-launcher'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { amapNavigationUrl, navigateWithAmap } from './amap'
import { AmapButton } from '../../features/routes/AmapButton'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: vi.fn(() => 'android') },
}))
vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: { canOpenUrl: vi.fn(), openUrl: vi.fn() },
}))
const place = {
  id: 'public-example',
  name: '兰州 & 黄河（示例）',
  note: '私人备注不发送',
  coordinates: {
    longitude: 103.8343,
    latitude: 36.0611,
    crs: 'WGS84' as const,
  },
}
beforeEach(() => {
  vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
  vi.mocked(AppLauncher.canOpenUrl).mockResolvedValue({ value: true })
  vi.mocked(AppLauncher.openUrl).mockResolvedValue({ completed: true })
})
describe('高德导航边界', () => {
  it('名称正确编码，WGS84 使用 dev=1，只发送目的地与来源', async () => {
    const url = new URL(amapNavigationUrl(place))
    expect(url.protocol).toBe('androidamap:')
    expect(url.hostname).toBe('navi')
    expect(url.searchParams.get('poiname')).toBe(place.name)
    expect(url.searchParams.get('dev')).toBe('1')
    expect(url.searchParams.get('lon')).toBe('103.8343')
    expect(url.searchParams.get('lat')).toBe('36.0611')
    expect(url.searchParams.get('sourceApplication')).toBe('Onway')
    expect(url.searchParams.has('note')).toBe(false)
    await navigateWithAmap(place)
    expect(AppLauncher.canOpenUrl).toHaveBeenCalledWith({
      url: 'com.autonavi.minimap',
    })
    expect(AppLauncher.openUrl).toHaveBeenCalledWith({
      url: amapNavigationUrl(place),
    })
  })
  it('未安装时不调用 openUrl，失败在原页面给出提示且可重试', async () => {
    vi.mocked(AppLauncher.canOpenUrl).mockResolvedValue({ value: false })
    render(<AmapButton place={place} />)
    fireEvent.click(
      screen.getByRole('button', { name: '高德驾车导航到' + place.name }),
    )
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('未检测到高德地图')
    expect(AppLauncher.openUrl).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeEnabled()
    vi.mocked(AppLauncher.canOpenUrl).mockResolvedValue({ value: true })
    vi.mocked(AppLauncher.openUrl).mockResolvedValue({ completed: false })
    fireEvent.click(screen.getByRole('button'))
    await screen.findByText(/无法打开高德地图/)
  })
  it('Web 不显示导航按钮，也不能调用原生启动器', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web')
    render(<AmapButton place={place} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await expect(navigateWithAmap(place)).rejects.toThrow('Android')
    expect(AppLauncher.canOpenUrl).not.toHaveBeenCalled()
  })
})
