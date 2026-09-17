import { defaultCategories } from '../../services/travel/model'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BackHandlerProvider } from '../../components/BackHandler'
import { TravelProvider } from '../../services/travel/TravelContext'
import {
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from '../../services/travel/repository'
import { NOTE_KEY, type LocalStore } from '../../services/storage/types'
import type { TravelWorkspace } from '../../services/travel/types'
import { PlanPage } from './PlanPage'

beforeEach(() => sessionStorage.clear())

beforeAll(() => {
  // 模拟 dialog 的可见性，不绕过真实的确认、取消和数据保存流程。
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function fixture(customize?: (workspace: TravelWorkspace) => void) {
  const workspace: TravelWorkspace = {
    schemaVersion: 4,
    libraryPlaces: [],
    categories: defaultCategories(),
    activeTripId: 'trip-existing',
    trips: [
      {
        id: 'trip-existing',
        name: '已经安排好的旅行',
        startDate: '2026-09-30',
        days: [
          {
            id: 'day-first',
            places: [
              {
                id: 'place-first',
                name: '我保存的第一站',
                note: '重要安排',
                coordinates: { longitude: 103.8, latitude: 36.1, crs: 'WGS84' },
              },
            ],
          },
          {
            id: 'day-second',
            places: [
              {
                id: 'place-second',
                name: '我保存的第二站',
                note: '',
                coordinates: { longitude: 102.6, latitude: 37.9, crs: 'WGS84' },
              },
            ],
          },
        ],
        unscheduledPlaces: [],
      },
    ],
  }
  customize?.(workspace)
  const values = new Map([
    [TRAVEL_WORKSPACE_KEY, JSON.stringify(workspace)],
    [NOTE_KEY, '升级以前的个人备注'],
  ])
  const store: LocalStore = {
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  return {
    store,
    values,
    workspace,
    repository: new TravelRepository(store),
    read: () =>
      JSON.parse(values.get(TRAVEL_WORKSPACE_KEY)!) as TravelWorkspace,
  }
}

async function openPlan(repository: TravelRepository, expanded = true) {
  const view = render(
    <MemoryRouter>
      <BackHandlerProvider>
        <TravelProvider repository={repository}>
          <PlanPage />
        </TravelProvider>
      </BackHandlerProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '全部展开' })
  if (expanded) {
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    fireEvent.click(screen.getByRole('button', { name: '调整顺序与日期' }))
  }
  return view
}

describe('计划页的行程操作', () => {
  it('交通位于相邻地点之间，排序和跨天移动后仅连接各天内的相邻端点', async () => {
    const { repository, read } = fixture((workspace) => {
      const day = workspace.trips[0].days[0]
      day.places.push(
        { ...day.places[0], id: 'place-middle', name: '中途停留点' },
        { ...day.places[0], id: 'place-last', name: '当天最后一站' },
      )
    })
    await openPlan(repository)
    const first = await screen.findByRole('heading', { name: '我保存的第一站' })
    const middle = screen.getByRole('heading', { name: '中途停留点' })
    const firstLeg = screen.getByRole('button', {
      name: '交通：我保存的第一站到中途停留点',
    })
    expect(screen.getAllByRole('button', { name: /^交通：/ })).toHaveLength(2)
    expect(first.closest('li')).toContainElement(firstLeg)
    expect(
      first.compareDocumentPosition(firstLeg) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      firstLeg.compareDocumentPosition(middle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      within(
        screen.getByRole('heading', { name: '当天最后一站' }).closest('li')!,
      ).queryByRole('button', { name: /^交通：/ }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '置底我保存的第一站' }))
    await waitFor(() =>
      expect(read().trips[0].days[0].places.map((p) => p.id)).toEqual([
        'place-middle',
        'place-last',
        'place-first',
      ]),
    )
    expect(
      screen.getByRole('button', { name: '交通：中途停留点到当天最后一站' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: '交通：当天最后一站到我保存的第一站',
      }),
    ).toBeVisible()

    fireEvent.change(
      screen.getByRole('combobox', { name: '移动我保存的第一站到' }),
      { target: { value: 'day-second' } },
    )
    await waitFor(() => expect(read().trips[0].days[1].places).toHaveLength(2))
    expect(screen.getAllByRole('button', { name: /^交通：/ })).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: '交通：中途停留点到当天最后一站' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: '交通：我保存的第二站到我保存的第一站',
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', {
        name: '交通：当天最后一站到我保存的第二站',
      }),
    ).not.toBeInTheDocument()
  })

  it('地点删除收进更多菜单，取消不保存，确认后只删除指定地点', async () => {
    const { store, repository, read } = fixture()
    await openPlan(repository)
    const place = (
      await screen.findByRole('heading', { name: '我保存的第一站' })
    ).closest('li')!
    expect(
      within(place).queryByRole('button', { name: '删除我保存的第一站' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      within(place).getByRole('button', { name: '我保存的第一站的更多操作' }),
    )
    fireEvent.click(
      within(place).getByRole('button', { name: '删除我保存的第一站' }),
    )
    let dialog = screen.getByRole('dialog', { name: '删除地点' })
    expect(dialog).toHaveTextContent('我保存的第一站')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(store.set).not.toHaveBeenCalled()
    expect(read().trips[0].days[0].places).toHaveLength(1)
    fireEvent.click(
      within(place).getByRole('button', { name: '删除我保存的第一站' }),
    )
    dialog = screen.getByRole('dialog', { name: '删除地点' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(read().trips[0].days[0].places).toHaveLength(0)
    expect(read().trips[0].days[1].places[0].id).toBe('place-second')
  })

  it('页内地点库按当前日期添加，连续添加仍保留重复保护与面板', async () => {
    const { repository, read } = fixture((workspace) => {
      workspace.libraryPlaces.push({
        ...workspace.trips[0].days[0].places[0],
        id: 'library-new',
        name: '收藏的新地点',
        coordinates: { longitude: 101, latitude: 38, crs: 'WGS84' },
      })
    })
    await openPlan(repository)
    await screen.findByRole('heading', { name: '已经安排好的旅行' })
    fireEvent.click(
      screen.getByRole('button', { name: '第 2 天 · 10 月 1 日' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '地点库添加' }))
    const dialog = screen.getByRole('dialog', { name: '从地点库添加' })
    expect(dialog).toHaveTextContent('添加到：第 2 天 · 10 月 1 日')
    fireEvent.click(within(dialog).getByRole('button', { name: '加入' }))
    await waitFor(() =>
      expect(dialog).toHaveTextContent('已添加：收藏的新地点'),
    )
    expect(read().trips[0].days[1].places).toHaveLength(2)
    expect(
      within(dialog).getByRole('button', { name: '已加入' }),
    ).toBeDisabled()
    expect(dialog).toHaveTextContent('已加入第 2 天')
    expect(read().trips[0].days[1].places).toHaveLength(2)
  })

  it('已有行程启动时不被示例改写，也不展示另建示例入口', async () => {
    const { store, repository, workspace, read, values } = fixture()
    await openPlan(repository)
    await screen.findByRole('heading', { name: '已经安排好的旅行' })
    expect(store.set).not.toHaveBeenCalled()
    expect(read()).toEqual(workspace)
    expect(values.get(NOTE_KEY)).toBe('升级以前的个人备注')
    expect(
      screen.queryByRole('button', { name: '另建一个示例行程' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('另建一个示例行程')).not.toBeVisible()
  })

  it('空工作区仍可显式创建示例，保留原个人备注', async () => {
    const { store, repository, read, values } = fixture((workspace) => {
      workspace.trips = []
      workspace.activeTripId = null
    })
    render(
      <MemoryRouter>
        <BackHandlerProvider>
          <TravelProvider repository={repository}>
            <PlanPage />
          </TravelProvider>
        </BackHandlerProvider>
      </MemoryRouter>,
    )
    // 通过仍向用户开放的空状态入口验证创建，不模拟点击已隐藏的按钮。
    const createDemo = await screen.findByRole('button', {
      name: '创建示例行程',
    })
    expect(store.set).not.toHaveBeenCalled()
    fireEvent.click(createDemo)
    await screen.findByRole('heading', { name: '河西走廊之旅（示例）' })
    const saved = read()
    expect(saved.trips).toHaveLength(1)
    expect(saved.activeTripId).toBe(saved.trips[0].id)
    expect(saved.trips[0].days.flatMap((day) => day.places)).toHaveLength(3)
    expect(values.get(NOTE_KEY)).toBe('升级以前的个人备注')
  })

  it('删天先说明地点会移回未安排，取消不保存，确认后保留地点 ID 并重新编号', async () => {
    const { store, repository, read } = fixture()
    await openPlan(repository)
    const firstDayHeading = await screen.findByRole('heading', {
      name: '第 1 天 · 9 月 30 日',
    })
    const firstDay = firstDayHeading.closest('section')!
    fireEvent.click(
      within(firstDay).getByRole('button', { name: '删除这一天' }),
    )
    let dialog = screen.getByRole('dialog', { name: '删除这一天' })
    expect(dialog).toHaveTextContent('1 个地点会移回未安排')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(store.set).not.toHaveBeenCalled()
    expect(read().trips[0].days).toHaveLength(2)
    fireEvent.click(
      within(firstDay).getByRole('button', { name: '删除这一天' }),
    )
    dialog = screen.getByRole('dialog', { name: '删除这一天' })
    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    const saved = read().trips[0]
    expect(saved.days).toHaveLength(1)
    expect(saved.days[0].id).toBe('day-second')
    expect(saved.unscheduledPlaces[0]).toMatchObject({
      id: 'place-first',
      name: '我保存的第一站',
      note: '重要安排',
    })
    const unscheduled = screen
      .getByRole('heading', { name: '未安排地点' })
      .closest('section')!
    expect(
      within(unscheduled).getByRole('heading', { name: '我保存的第一站' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: '第 1 天 · 9 月 30 日' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '删除这一天' })).toBeDisabled()
  })

  it('编辑行程遇到其他页面更新时保留输入，面板内重新读取后可保存并保留新天数', async () => {
    const { store, repository, read } = fixture()
    await openPlan(repository)
    await screen.findByRole('heading', { name: '已经安排好的旅行' })
    fireEvent.click(screen.getByRole('button', { name: '编辑行程' }))
    const dialog = screen.getByRole('dialog', { name: '编辑行程' })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: '行程名称' }),
      { target: { value: '我的新行程名称' } },
    )
    const other = new TravelRepository(store)
    await other.load()
    await other.run({
      type: 'createTrip',
      name: '其他页面新建的旅行',
      startDate: null,
      dayCount: 1,
    })
    await other.run({ type: 'addDay', tripId: 'trip-existing' })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存行程' }))
    await waitFor(() => expect(dialog).toHaveTextContent('其他页面更新'))
    expect(
      within(dialog).getByRole('textbox', { name: '行程名称' }),
    ).toHaveValue('我的新行程名称')
    fireEvent.click(within(dialog).getByRole('button', { name: /重新读取/ }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: '第 3 天 · 10 月 2 日' }),
      ).toBeInTheDocument(),
    )
    expect(
      within(dialog).getByRole('textbox', { name: '行程名称' }),
    ).toHaveValue('我的新行程名称')
    fireEvent.click(within(dialog).getByRole('button', { name: '保存行程' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(read().activeTripId).toBe('trip-existing')
    expect(read().trips).toHaveLength(2)
    expect(read().trips[0].name).toBe('我的新行程名称')
    expect(read().trips[0].days).toHaveLength(3)
    expect(read().trips[0].days[0].places[0].id).toBe('place-first')
  })
})

vi.mock('../../services/routes/RoutesContext', () => ({
  useRoutes: () => ({
    segments: { status: 'ready', entries: {}, operations: {}, error: null },
    segmentController: {
      calculate: vi.fn(),
      calculateDay: vi.fn(),
      retrySave: vi.fn(),
    },
    state: { status: 'ready', entries: {}, operations: {}, error: null },
    calculate: vi.fn(),
    retrySave: vi.fn(),
    reload: vi.fn(),
  }),
}))

describe('每日折叠与连续规划', () => {
  it('全部默认仅显示摘要，展开状态跨页面保留，展开和整理不保存数据', async () => {
    const { repository, store } = fixture()
    const view = await openPlan(repository, false)
    expect(
      screen.queryByRole('heading', { name: '我保存的第一站' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '展开第 1 天 · 9 月 30 日' }),
    ).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(
      screen.getByRole('button', { name: '展开第 1 天 · 9 月 30 日' }),
    )
    expect(
      screen.getByRole('heading', { name: '我保存的第一站' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: '我保存的第二站' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '置底我保存的第一站' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '调整顺序与日期' }))
    expect(
      screen.getByRole('button', { name: '置底我保存的第一站' }),
    ).toBeVisible()
    view.unmount()
    await openPlan(repository, false)
    expect(
      screen.getByRole('heading', { name: '我保存的第一站' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(
      screen.getByRole('heading', { name: '我保存的第二站' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '全部收起' }))
    expect(
      screen.queryByRole('heading', { name: '我保存的第一站' }),
    ).not.toBeInTheDocument()
    expect(store.set).not.toHaveBeenCalled()
  })
  it('单独选择一天立即展示地点，末尾添加默认归入当天', async () => {
    const { repository, store } = fixture()
    await openPlan(repository, false)
    fireEvent.change(screen.getByRole('combobox', { name: '选择日期' }), {
      target: { value: 'day-second' },
    })
    expect(
      screen.getByRole('heading', { name: '我保存的第二站' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '全部展开' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '下一天' }))
    expect(screen.getByRole('button', { name: '下一天' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '上一天' }))
    expect(
      screen.getByRole('heading', { name: '我保存的第一站' }),
    ).toBeVisible()
    expect(store.set).not.toHaveBeenCalled()
  })
  it('从中间站输入坐标新增后插入原位置，已有后续站点顺序不变', async () => {
    const { repository, read } = fixture((w) => {
      const day = w.trips[0].days[0]
      day.places.push({ ...day.places[0], id: 'tail', name: '末站' })
    })
    await openPlan(repository, false)
    fireEvent.change(screen.getByRole('combobox', { name: '选择日期' }), {
      target: { value: 'day-first' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '我保存的第一站的更多操作' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '在此后添加' }))
    const picker = screen.getByRole('dialog', { name: '在此后添加地点' })
    fireEvent.click(within(picker).getByRole('button', { name: '输入坐标' }))
    const editor = screen.getByRole('dialog', { name: '添加行程地点' })
    expect(editor).toHaveTextContent('我保存的第一站”之后插入')
    fireEvent.change(
      within(editor).getByRole('textbox', { name: '地点名称' }),
      { target: { value: '中间新站' } },
    )
    fireEvent.change(within(editor).getByRole('textbox', { name: '经度' }), {
      target: { value: '104' },
    })
    fireEvent.change(within(editor).getByRole('textbox', { name: '纬度' }), {
      target: { value: '36' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: '保存地点' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(read().trips[0].days[0].places.map((p) => p.name)).toEqual([
      '我保存的第一站',
      '中间新站',
      '末站',
    ])
    expect(screen.getAllByRole('button', { name: /^交通：/ })).toHaveLength(2)
  })
})
