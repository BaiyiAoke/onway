import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocalStore } from '../../services/storage'
import type { LocalStore } from '../../services/storage/types'
import { AmapSearch } from '../../services/search/amap'
import { placeSearch } from '../../services/search/nominatim'
import { saveSearchSettings } from '../../services/search/service'
import { MapServiceSettingsButton, SearchPanel } from './SearchPanel'

vi.mock('../../services/storage', () => ({ getLocalStore: vi.fn() }))
vi.mock('../../components/BackHandler', () => ({ useBackHandler: vi.fn() }))

let values: Map<string, string>
let store: LocalStore

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
beforeEach(() => {
  vi.restoreAllMocks()
  values = new Map([
    [
      'search.provider.v1',
      JSON.stringify({
        provider: 'amap',
        amapKey: '0123456789abcdef0123456789abcdef',
      }),
    ],
  ])
  store = {
    initialize: vi.fn(async () => {}),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  vi.mocked(getLocalStore).mockResolvedValue(store)
  vi.spyOn(placeSearch, 'endpoint').mockResolvedValue(
    'https://nominatim.openstreetmap.org',
  )
  vi.spyOn(placeSearch, 'setEndpoint').mockResolvedValue()
})

function page() {
  return render(
    <>
      <SearchPanel inline onSelect={vi.fn()} />
      <div aria-label="独立设置入口">
        <MapServiceSettingsButton />
      </div>
    </>,
  )
}
async function switchFromIndependentEntry(provider: 'osm' | 'amap') {
  fireEvent.click(
    within(screen.getByLabelText('独立设置入口')).getByRole('button', {
      name: '地图服务设置',
    }),
  )
  const input = await screen.findByLabelText('搜索来源')
  await waitFor(() => expect(input).toBeEnabled())
  fireEvent.change(input, { target: { value: provider } })
  fireEvent.click(screen.getByRole('button', { name: '保存地图服务设置' }))
}

describe('地图服务设置跨入口同步', () => {
  it('独立入口保存后更新来源并清除旧结果，下一次手动搜索使用新服务', async () => {
    const amap = vi.spyOn(AmapSearch.prototype, 'search').mockResolvedValue({
      cached: false,
      results: [
        {
          name: '旧高德结果',
          note: '',
          address: '公开测试地址',
          coordinates: { longitude: 116.4, latitude: 39.9, crs: 'WGS84' },
          source: { provider: 'amap', id: 'old' },
        },
      ],
    })
    const osm = vi
      .spyOn(placeSearch, 'search')
      .mockResolvedValue({ results: [], cached: false })
    page()
    await screen.findByRole('link', { name: '高德地图' })
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '公开地点' },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '搜索' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByText('旧高德结果')
    await switchFromIndependentEntry('osm')
    await screen.findByRole('link', { name: 'Nominatim · © OpenStreetMap' })
    expect(screen.queryByText('旧高德结果')).not.toBeInTheDocument()
    expect(amap).toHaveBeenCalledOnce()
    expect(osm).not.toHaveBeenCalled()
    expect(screen.getByRole('searchbox')).toHaveValue('公开地点')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(osm).toHaveBeenCalledOnce())
  })

  it('其他入口保存设置取消旧请求，晚到结果不能覆盖新来源', async () => {
    let resolveSearch!: (value: { results: []; cached: boolean }) => void
    const amap = vi.spyOn(AmapSearch.prototype, 'search').mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
    )
    const osm = vi
      .spyOn(placeSearch, 'search')
      .mockResolvedValue({ results: [], cached: false })
    page()
    await screen.findByRole('link', { name: '高德地图' })
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '公开地点' },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '搜索' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(amap).toHaveBeenCalledOnce())
    const signal = amap.mock.calls[0][2]
    expect(signal.aborted).toBe(false)
    await switchFromIndependentEntry('osm')
    await screen.findByRole('link', { name: 'Nominatim · © OpenStreetMap' })
    expect(signal.aborted).toBe(true)
    await act(async () => resolveSearch({ results: [], cached: false }))
    expect(screen.queryByText(/未找到地点/)).not.toBeInTheDocument()
    expect(screen.queryByText('正在查询…')).not.toBeInTheDocument()
    expect(osm).not.toHaveBeenCalled()
  })

  it('设置保存失败保留原来源，不广播尚未保存的选择', async () => {
    page()
    await screen.findByRole('link', { name: '高德地图' })
    vi.mocked(store.set).mockRejectedValueOnce(new Error('磁盘写入失败'))
    await switchFromIndependentEntry('osm')
    await screen.findByText('磁盘写入失败')
    expect(screen.getByRole('link', { name: '高德地图' })).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Nominatim · © OpenStreetMap' }),
    ).not.toBeInTheDocument()
  })

  it('卸载后取消订阅，再次保存不会让旧面板重新读取', async () => {
    const view = page()
    await screen.findByRole('link', { name: '高德地图' })
    await waitFor(() => expect(store.get).toHaveBeenCalled())
    view.unmount()
    vi.mocked(store.get).mockClear()
    await act(async () => saveSearchSettings({ provider: 'osm', amapKey: '' }))
    expect(store.get).not.toHaveBeenCalled()
  })
})
