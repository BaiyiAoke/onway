import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BackHandlerProvider } from '../../components/BackHandler'
import { getLocalStore } from '../../services/storage'
import type { LocalStore } from '../../services/storage/types'
import { TravelProvider } from '../../services/travel/TravelContext'
import { defaultCategories } from '../../services/travel/model'
import {
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from '../../services/travel/repository'
import type { TravelWorkspace, TripPlace } from '../../services/travel/types'
import PlacesPage from './PlacesPage'
import { PLACES_VIEW_KEY } from './usePlacesView'

vi.mock('../../services/storage', () => ({ getLocalStore: vi.fn() }))
vi.mock('./PointMap', () => ({
  default: ({
    places,
    onSelect,
    onPick,
  }: {
    places: TripPlace[]
    onSelect: (place: TripPlace) => void
    onPick: (coordinates: TripPlace['coordinates']) => void
  }) => (
    <div aria-label="地图内容" role="group">
      {places.map((place) => (
        <button key={place.id} onClick={() => onSelect(place)}>
          地图：{place.name}
        </button>
      ))}
      <button
        onClick={() =>
          onPick({ longitude: 102.5, latitude: 37.5, crs: 'WGS84' })
        }
      >
        地图选新点
      </button>
    </div>
  ),
}))
vi.mock('./SearchPanel', () => ({
  SearchPanel: ({
    visible = true,
    onSelect,
    onClose,
  }: {
    visible?: boolean
    onSelect: (place: Omit<TripPlace, 'id'>) => void
    onClose: () => void
  }) =>
    visible && (
      <section aria-label="搜索新地点">
        <button
          onClick={() =>
            onSelect({
              name: '搜索得到的新地点',
              note: '',
              coordinates: { longitude: 105, latitude: 35, crs: 'WGS84' },
            })
          }
        >
          选择搜索结果
        </button>
        <button onClick={onClose}>关闭搜索</button>
      </section>
    ),
}))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

let preferences: Map<string, string>
let preferenceStore: LocalStore
beforeEach(() => {
  sessionStorage.clear()
  preferences = new Map()
  preferenceStore = {
    initialize: vi.fn(async () => {}),
    get: vi.fn(async (key) => preferences.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      preferences.set(key, value)
    }),
  }
  vi.mocked(getLocalStore).mockResolvedValue(preferenceStore)
})

function fixture(count = 1) {
  const workspace: TravelWorkspace = {
    schemaVersion: 4,
    categories: defaultCategories(),
    libraryPlaces: Array.from({ length: count }, (_, index) => ({
      id: `saved-${index}`,
      name: `收藏地点 ${index + 1}`,
      address: `测试地址 ${index + 1}`,
      note: `入口备注 ${index + 1}`,
      categoryId: index % 2 === 0 ? 'category-sight' : undefined,
      coordinates: { longitude: 103 + index / 100, latitude: 36, crs: 'WGS84' },
    })),
    activeTripId: 'trip',
    trips: [
      {
        id: 'trip',
        name: '测试旅行',
        startDate: '2026-09-30',
        days: [{ id: 'day', places: [] }],
        unscheduledPlaces: [],
      },
    ],
  }
  let raw = JSON.stringify(workspace)
  const store: LocalStore = {
    initialize: vi.fn(async () => {}),
    get: vi.fn(async (key) => (key === TRAVEL_WORKSPACE_KEY ? raw : null)),
    set: vi.fn(async (key, value) => {
      if (key === TRAVEL_WORKSPACE_KEY) raw = value
    }),
  }
  const repository = new TravelRepository(store)
  const mounted = render(
    <MemoryRouter initialEntries={['/places']}>
      <BackHandlerProvider>
        <TravelProvider repository={repository}>
          <PlacesPage />
        </TravelProvider>
      </BackHandlerProvider>
    </MemoryRouter>,
  )
  return { store, read: () => JSON.parse(raw) as TravelWorkspace, ...mounted }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('地点库布局与操作', () => {
  it('零地点默认列表和收起地图，输入坐标保存后直接显示首个收藏', async () => {
    const { read } = fixture(0)
    await screen.findByText('还没有收藏地点。')
    expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '展开地图' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.queryByRole('group', { name: '地图内容' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '输入坐标' }))
    const dialog = screen.getByRole('dialog', { name: '收藏地点' })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: '地点名称' }),
      { target: { value: '第一处收藏' } },
    )
    fireEvent.change(within(dialog).getByRole('textbox', { name: '经度' }), {
      target: { value: '103.8' },
    })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '纬度' }), {
      target: { value: '36.1' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存地点' }))
    await screen.findByRole('heading', { name: '第一处收藏' })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(read().libraryPlaces[0].name).toBe('第一处收藏')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('多地点可组合分类与名称地址筛选，空结果仍可切换视图和管理分类', async () => {
    const { store } = fixture(20)
    await screen.findByRole('heading', { name: '收藏地点 20' })
    expect(screen.getAllByRole('article')).toHaveLength(20)
    fireEvent.change(screen.getByRole('combobox', { name: '分类' }), {
      target: { value: 'category-sight' },
    })
    expect(screen.getAllByRole('article')).toHaveLength(10)
    fireEvent.change(screen.getByRole('searchbox', { name: '筛选收藏地点' }), {
      target: { value: '测试地址 3' },
    })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '收藏地点 3' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    expect(screen.getByRole('button', { name: '网格' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.change(screen.getByRole('searchbox', { name: '筛选收藏地点' }), {
      target: { value: '不存在' },
    })
    expect(screen.getByText('没有符合筛选条件的地点。')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '0 个地点 · 共 20 个收藏',
    )
    expect(store.set).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '管理分类' }))
    expect(screen.getByRole('dialog', { name: '管理分类' })).toBeVisible()
  })

  it('列表和网格均直接编辑与添加到行程，编辑收藏不改写已添加的副本', async () => {
    const { read } = fixture()
    await screen.findByRole('heading', { name: '收藏地点 1' })
    fireEvent.click(screen.getByRole('button', { name: '添加到行程' }))
    const copy = screen.getByRole('dialog', { name: '添加到行程' })
    fireEvent.change(within(copy).getByRole('combobox', { name: '安排到' }), {
      target: { value: 'day' },
    })
    fireEvent.click(within(copy).getByRole('button', { name: '确认添加' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑地点' }))
    const editor = screen.getByRole('dialog', { name: '编辑收藏地点' })
    expect(within(editor).getByRole('textbox', { name: '备注' })).toHaveValue(
      '入口备注 1',
    )
    fireEvent.change(
      within(editor).getByRole('textbox', { name: '地点名称' }),
      { target: { value: '只改收藏名称' } },
    )
    fireEvent.click(within(editor).getByRole('button', { name: '保存地点' }))
    await screen.findByRole('heading', { name: '只改收藏名称' })
    expect(read().trips[0].days[0].places[0].name).toBe('收藏地点 1')
  })

  it('地图按需挂载、可选点编辑，收起后列表保留；搜索新地点复用保存表单', async () => {
    const { read } = fixture()
    await screen.findByRole('heading', { name: '收藏地点 1' })
    fireEvent.click(screen.getByRole('button', { name: '展开地图' }))
    fireEvent.click(
      await screen.findByRole('button', { name: '地图：收藏地点 1' }),
    )
    let editor = screen.getByRole('dialog', { name: '编辑收藏地点' })
    fireEvent.click(within(editor).getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '地图选新点' }))
    editor = screen.getByRole('dialog', { name: '收藏地点' })
    expect(within(editor).getByRole('textbox', { name: '经度' })).toHaveValue(
      '102.5',
    )
    fireEvent.click(within(editor).getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '收起地图' }))
    expect(
      screen.queryByRole('group', { name: '地图内容' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '搜索新地点' }))
    fireEvent.click(screen.getByRole('button', { name: '选择搜索结果' }))
    editor = screen.getByRole('dialog', { name: '收藏地点' })
    fireEvent.click(within(editor).getByRole('button', { name: '保存地点' }))
    await screen.findByRole('heading', { name: '搜索得到的新地点' })
    expect(read().libraryPlaces).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '关闭搜索' }))
    expect(
      screen.getByRole('searchbox', { name: '筛选收藏地点' }),
    ).toBeVisible()
  })
})

describe('地点库设备视图偏好', () => {
  it('恢复网格并持久化后续选择，不写旅行文档', async () => {
    preferences.set(PLACES_VIEW_KEY, 'grid')
    const { store, unmount } = fixture()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '网格' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    await waitFor(() =>
      expect(preferenceStore.set).toHaveBeenCalledWith(
        'ui.places.view',
        'list',
      ),
    )
    expect(store.set).not.toHaveBeenCalled()
    unmount()
    fixture()
    await screen.findByRole('heading', { name: '收藏地点 1' })
    expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('晚读取不会覆盖用户点选，连续选择按顺序落盘', async () => {
    const read = deferred<string | null>()
    const firstWrite = deferred<void>()
    vi.mocked(preferenceStore.get).mockReturnValueOnce(read.promise)
    vi.mocked(preferenceStore.set).mockImplementationOnce(
      () => firstWrite.promise,
    )
    fixture()
    await screen.findByRole('heading', { name: '收藏地点 1' })
    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    await waitFor(() => expect(preferenceStore.set).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(preferenceStore.set).toHaveBeenCalledTimes(1)
    await act(async () => {
      read.resolve('grid')
      firstWrite.resolve()
    })
    await waitFor(() =>
      expect(preferenceStore.set).toHaveBeenLastCalledWith(
        PLACES_VIEW_KEY,
        'list',
      ),
    )
    expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it.each(['invalid', 'readFailure', 'writeFailure'])(
    '偏好异常 %s 时默认列表，仍能切换和编辑地点',
    async (failure) => {
      if (failure === 'invalid') preferences.set(PLACES_VIEW_KEY, 'unknown')
      if (failure === 'readFailure')
        vi.mocked(preferenceStore.get).mockRejectedValueOnce(
          new Error('不可读取'),
        )
      if (failure === 'writeFailure')
        vi.mocked(preferenceStore.set).mockRejectedValueOnce(
          new Error('不可写入'),
        )
      fixture()
      await screen.findByRole('heading', { name: '收藏地点 1' })
      expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      fireEvent.click(screen.getByRole('button', { name: '网格' }))
      await waitFor(() =>
        expect(preferenceStore.set).toHaveBeenCalledWith(
          PLACES_VIEW_KEY,
          'grid',
        ),
      )
      expect(screen.getByRole('button', { name: '网格' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      fireEvent.click(screen.getByRole('button', { name: '编辑地点' }))
      expect(screen.getByRole('dialog', { name: '编辑收藏地点' })).toBeVisible()
    },
  )
})
