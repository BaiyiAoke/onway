import { defaultCategories } from '../../services/travel/model'
import { useState } from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  BackHandlerProvider,
  useBackRegistry,
} from '../../components/BackHandler'
import { TravelProvider, useTravel } from '../../services/travel/TravelContext'
import {
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from '../../services/travel/repository'
import type { LocalStore } from '../../services/storage/types'
import type { TravelWorkspace } from '../../services/travel/types'
import { PlaceEditor } from './PlaceEditor'

beforeAll(() => {
  // jsdom 不实现原生模态窗，只补充其可见状态，仍走真实取消与返回处理逻辑。
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function fixture() {
  const workspace: TravelWorkspace = {
    schemaVersion: 4,
    libraryPlaces: [],
    categories: defaultCategories(),
    activeTripId: 'trip-personal',
    trips: [
      {
        id: 'trip-personal',
        name: '我的河西之旅',
        startDate: '2026-09-30',
        days: [
          {
            id: 'day-first',
            places: [
              {
                id: 'place-original',
                name: '黄河边',
                note: '旧备注',
                coordinates: {
                  longitude: 103.8343,
                  latitude: 36.0611,
                  crs: 'WGS84',
                },
              },
            ],
          },
          { id: 'day-second', places: [] },
        ],
        unscheduledPlaces: [],
      },
    ],
  }
  const values = new Map([[TRAVEL_WORKSPACE_KEY, JSON.stringify(workspace)]])
  const store: LocalStore = {
    initialize: vi.fn(async () => undefined),
    get: vi.fn(async (key) => values.get(key) ?? null),
    set: vi.fn(async (key, value) => {
      values.set(key, value)
    }),
  }
  return {
    store,
    repository: new TravelRepository(store),
    read: () =>
      JSON.parse(values.get(TRAVEL_WORKSPACE_KEY)!) as TravelWorkspace,
  }
}

function EditorHost({ onClose }: { onClose: () => void }) {
  const { activeTrip } = useTravel()
  const back = useBackRegistry()
  const [open, setOpen] = useState(true)
  const day = activeTrip?.days.find((item) =>
    item.places.some((place) => place.id === 'place-original'),
  )
  const place =
    day?.places.find((item) => item.id === 'place-original') ??
    activeTrip?.unscheduledPlaces.find((item) => item.id === 'place-original')
  return (
    <>
      <button onClick={() => back.handle()}>模拟系统返回</button>
      {activeTrip && place && open && (
        <PlaceEditor
          trip={activeTrip}
          draft={{ ...place, dayId: day?.id ?? null }}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

function openEditor(repository: TravelRepository, onClose = vi.fn()) {
  render(
    <BackHandlerProvider>
      <TravelProvider repository={repository}>
        <EditorHost onClose={onClose} />
      </TravelProvider>
    </BackHandlerProvider>,
  )
  return onClose
}

describe('地点编辑与草稿保护', () => {
  it('保存失败保留名称、备注和所属天，重试成功只移动同一个地点 ID', async () => {
    const { store, repository, read } = fixture()
    vi.mocked(store.set).mockRejectedValueOnce(new Error('存储空间不足'))
    const onClose = openEditor(repository)
    const name = await screen.findByRole('textbox', { name: '地点名称' })
    fireEvent.change(name, { target: { value: '我的黄河边' } })
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), {
      target: { value: '傍晚散步' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '安排到' }), {
      target: { value: 'day-second' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存地点' }))
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((alert) => alert.textContent?.includes('保存失败')),
      ).toBe(true),
    )
    expect(name).toHaveValue('我的黄河边')
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue(
      '傍晚散步',
    )
    expect(screen.getByRole('combobox', { name: '安排到' })).toHaveValue(
      'day-second',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(read().trips[0].days[0].places[0].name).toBe('黄河边')
    fireEvent.click(screen.getByRole('button', { name: '保存地点' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const saved = read().trips[0]
    expect(saved.days[0].places).toEqual([])
    expect(saved.days[1].places).toHaveLength(1)
    expect(saved.days[1].places[0]).toMatchObject({
      id: 'place-original',
      name: '我的黄河边',
      note: '傍晚散步',
    })
  })

  it('取消与系统返回先确认脏草稿，继续编辑保留输入，明确放弃后才关闭', async () => {
    const { store, repository } = fixture()
    const onClose = openEditor(repository)
    fireEvent.change(await screen.findByRole('textbox', { name: '地点名称' }), {
      target: { value: '尚未保存的地点名' },
    })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(
      screen.getByRole('heading', { name: '放弃未保存的修改？' }),
    ).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue(
      '尚未保存的地点名',
    )
    fireEvent.click(screen.getByRole('button', { name: '模拟系统返回' }))
    expect(
      screen.getByRole('heading', { name: '放弃未保存的修改？' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '模拟系统返回' }))
    expect(screen.getByRole('textbox', { name: '地点名称' })).toHaveValue(
      '尚未保存的地点名',
    )
    fireEvent.click(screen.getByRole('button', { name: '关闭编辑面板' }))
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(store.set).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('其他页面更新后在面板内解释冲突，重新读取不清空草稿，再次保存保留新增天数', async () => {
    const { store, repository, read } = fixture()
    const onClose = openEditor(repository)
    fireEvent.change(await screen.findByRole('textbox', { name: '地点名称' }), {
      target: { value: '保留我的草稿' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '备注' }), {
      target: { value: '重试前不要丢失' },
    })
    const other = new TravelRepository(store)
    await other.load()
    await other.run({ type: 'addDay', tripId: 'trip-personal' })
    fireEvent.click(screen.getByRole('button', { name: '保存地点' }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('其他页面更新'))
    fireEvent.click(within(dialog).getByRole('button', { name: /重新读取/ }))
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole('combobox', { name: '安排到' })
          .querySelectorAll('option'),
      ).toHaveLength(4),
    )
    expect(
      within(dialog).getByRole('textbox', { name: '地点名称' }),
    ).toHaveValue('保留我的草稿')
    expect(within(dialog).getByRole('textbox', { name: '备注' })).toHaveValue(
      '重试前不要丢失',
    )
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '保存地点' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(read().trips[0].days).toHaveLength(3)
    expect(read().trips[0].days[0].places[0].name).toBe('保留我的草稿')
  })

  it('行程被其他页面删除时重新读取仍保留草稿，不重新创建或覆盖已删除数据', async () => {
    const { store, repository, read } = fixture()
    const onClose = openEditor(repository)
    fireEvent.change(await screen.findByRole('textbox', { name: '地点名称' }), {
      target: { value: '删除冲突中的草稿' },
    })
    const other = new TravelRepository(store)
    await other.load()
    await other.run({ type: 'deleteTrip', tripId: 'trip-personal' })
    fireEvent.click(screen.getByRole('button', { name: '保存地点' }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('其他页面更新'))
    fireEvent.click(within(dialog).getByRole('button', { name: /重新读取/ }))
    await waitFor(() =>
      expect(dialog).toHaveTextContent('此行程已在其他页面删除'),
    )
    expect(
      within(dialog).getByRole('textbox', { name: '地点名称' }),
    ).toHaveValue('删除冲突中的草稿')
    expect(onClose).not.toHaveBeenCalled()
    expect(read().trips).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: '保存地点' }))
    await waitFor(() => expect(dialog).toHaveTextContent('地点保存失败'))
    expect(read().trips).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })
})
