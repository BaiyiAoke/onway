import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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

beforeAll(() => {
  // 模拟 dialog 的可见性，不绕过真实的确认、取消和数据保存流程。
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function fixture() {
  const workspace: TravelWorkspace = {
    schemaVersion: 1,
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

function openPlan(repository: TravelRepository) {
  render(
    <MemoryRouter>
      <BackHandlerProvider>
        <TravelProvider repository={repository}>
          <PlanPage />
        </TravelProvider>
      </BackHandlerProvider>
    </MemoryRouter>,
  )
}

describe('计划页的行程操作', () => {
  it('已有行程启动时不被示例改写，显式另建示例也保留原行程和个人备注', async () => {
    const { store, repository, workspace, read, values } = fixture()
    openPlan(repository)
    await screen.findByRole('heading', { name: '已经安排好的旅行' })
    expect(store.set).not.toHaveBeenCalled()
    expect(read()).toEqual(workspace)
    fireEvent.click(screen.getByRole('button', { name: '另建一个示例行程' }))
    await screen.findByRole('heading', { name: '河西走廊之旅（示例）' })
    const saved = read()
    expect(saved.trips).toHaveLength(2)
    expect(saved.trips[0]).toEqual(workspace.trips[0])
    expect(saved.trips[1].days.flatMap((day) => day.places)).toHaveLength(3)
    expect(values.get(NOTE_KEY)).toBe('升级以前的个人备注')
    fireEvent.change(screen.getByRole('combobox', { name: '当前行程' }), {
      target: { value: 'trip-existing' },
    })
    await screen.findByRole('heading', { name: '已经安排好的旅行' })
    expect(
      screen.getByRole('heading', { name: '我保存的第一站' }),
    ).toBeVisible()
  })

  it('删天先说明地点会移回未安排，取消不保存，确认后保留地点 ID 并重新编号', async () => {
    const { store, repository, read } = fixture()
    openPlan(repository)
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
    openPlan(repository)
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
