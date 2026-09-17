import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { BackHandlerProvider } from '../../components/BackHandler'
import { TravelProvider, useTravel } from '../../services/travel/TravelContext'
import { emptyWorkspace } from '../../services/travel/model'
import {
  TRAVEL_WORKSPACE_KEY,
  TravelRepository,
} from '../../services/travel/repository'
import type { LocalStore } from '../../services/storage/types'
import type { TravelWorkspace, TripPlace } from '../../services/travel/types'
import { LibraryPicker } from './LibraryPicker'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function point(id: string, name: string): TripPlace {
  return {
    id,
    name,
    note: '',
    coordinates: { longitude: 103.8, latitude: 36.1, crs: 'WGS84' },
  }
}
function fixture() {
  const workspace = emptyWorkspace()
  workspace.activeTripId = 'trip'
  workspace.libraryPlaces = [
    point('one', '新地点一'),
    point('two', '新地点二'),
    point('existing', '已有收藏'),
    point('unplanned-source', '未安排收藏'),
  ]
  workspace.trips = [
    {
      id: 'trip',
      name: '选择行程',
      startDate: null,
      days: [
        { id: 'day', places: [point('start', '起点'), point('end', '终点')] },
        {
          id: 'other',
          places: [
            { ...point('old-copy', '原有地点'), libraryPlaceId: 'existing' },
          ],
        },
      ],
      unscheduledPlaces: [
        {
          ...point('unplanned-copy', '待安排地点'),
          libraryPlaceId: 'unplanned-source',
        },
      ],
    },
  ]
  const values = new Map([[TRAVEL_WORKSPACE_KEY, JSON.stringify(workspace)]])
  const store: LocalStore = {
    initialize: async () => {},
    get: async (key) => values.get(key) ?? null,
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  return {
    store,
    values,
    repository: new TravelRepository(store),
    read: () =>
      JSON.parse(values.get(TRAVEL_WORKSPACE_KEY)!) as TravelWorkspace,
  }
}
function Picker({
  afterPlaceId,
  onClose,
}: {
  afterPlaceId?: string
  onClose: () => void
}) {
  const { activeTrip } = useTravel()
  return (
    activeTrip && (
      <LibraryPicker
        trip={activeTrip}
        dayId="day"
        afterPlaceId={afterPlaceId}
        onClose={onClose}
      />
    )
  )
}
async function open(afterPlaceId?: string) {
  const source = fixture()
  const onClose = vi.fn()
  render(
    <BackHandlerProvider>
      <TravelProvider repository={source.repository}>
        <Picker afterPlaceId={afterPlaceId} onClose={onClose} />
      </TravelProvider>
    </BackHandlerProvider>,
  )
  await screen.findByRole('dialog', { name: '从地点库添加' })
  return { ...source, onClose }
}
function row(name: string) {
  return within(screen.getByRole('article', { name }))
}
function join(name: string, again = false) {
  fireEvent.click(
    row(name).getByRole('button', { name: again ? '再次加入' : '加入' }),
  )
}

describe('地点库连续选择', () => {
  it('已有地点直接显示所属日期或未安排，重复加入仍需明确勾选', async () => {
    const source = await open()
    expect(row('已有收藏').getByText('已加入第 2 天')).toBeInTheDocument()
    expect(row('未安排收藏').getByText('已加入未安排')).toBeInTheDocument()
    expect(
      row('已有收藏').getByRole('button', { name: '已加入' }),
    ).toBeDisabled()
    expect(screen.getByText('本次已加入 0 个')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('checkbox', { name: '允许重复添加同一地点' }),
    )
    join('已有收藏', true)
    await screen.findByText('本次已加入 1 个')
    expect(
      row('已有收藏').getByText('已加入第 1 天、第 2 天'),
    ).toBeInTheDocument()
    expect(source.read().trips[0].days[0].places.at(-1)?.libraryPlaceId).toBe(
      'existing',
    )
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(source.onClose).toHaveBeenCalledOnce()
  })
  it('连续选择按点击顺序插入，允许重复时也推进到刚保存的副本', async () => {
    const source = await open('start')
    join('新地点一')
    await screen.findByText('本次已加入 1 个')
    join('新地点二')
    await screen.findByText('本次已加入 2 个')
    fireEvent.click(
      screen.getByRole('checkbox', { name: '允许重复添加同一地点' }),
    )
    join('新地点一', true)
    await screen.findByText('本次已加入 3 个')
    expect(
      source.read().trips[0].days[0].places.map((place) => place.name),
    ).toEqual(['起点', '新地点一', '新地点二', '新地点一', '终点'])
  })
  it('插入目标失效明确失败，不静默追加且不会递增计数', async () => {
    const source = await open('missing')
    const before = source.read()
    join('新地点一')
    expect(screen.getByRole('alert')).toHaveTextContent('插入位置已改变')
    expect(screen.getByText('本次已加入 0 个')).toBeInTheDocument()
    expect(source.read()).toEqual(before)
    expect(source.store.set).not.toHaveBeenCalled()
  })
  it('保存失败保留游标和选择，重试后仍在正确位置插入', async () => {
    const source = await open('start')
    join('新地点一')
    await screen.findByText('本次已加入 1 个')
    vi.mocked(source.store.set).mockRejectedValueOnce(
      new Error('模拟磁盘写入失败'),
    )
    fireEvent.change(screen.getByRole('textbox', { name: '搜索地点库' }), {
      target: { value: '新地点二' },
    })
    join('新地点二')
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('模拟磁盘写入失败'),
    )
    expect(screen.getByText('本次已加入 1 个')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索地点库' })).toHaveValue(
      '新地点二',
    )
    join('新地点二')
    await screen.findByText('本次已加入 2 个')
    expect(
      source.read().trips[0].days[0].places.map((place) => place.name),
    ).toEqual(['起点', '新地点一', '新地点二', '终点'])
  })
  it('保存期间阻止重复点击和完成，成功持久化后才计数', async () => {
    const source = await open('start')
    let release!: () => void
    vi.mocked(source.store.set).mockImplementationOnce(async (key, value) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      source.values.set(key, value)
    })
    join('新地点一')
    await waitFor(() => expect(source.store.set).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '完成' })).toBeDisabled()
    expect(row('新地点二').getByRole('button', { name: '加入' })).toBeDisabled()
    expect(screen.getByText('本次已加入 0 个')).toBeInTheDocument()
    await act(async () => release())
    await screen.findByText('本次已加入 1 个')
    expect(source.store.set).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '完成' })).toBeEnabled()
  })
})
