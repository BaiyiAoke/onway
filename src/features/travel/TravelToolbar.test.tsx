import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTravel } from '../../services/travel/TravelContext'
import type { Trip } from '../../services/travel/types'
import { TravelToolbar } from './TravelToolbar'

vi.mock('../../services/travel/TravelContext', () => ({ useTravel: vi.fn() }))

const scrollTo = vi.fn()
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollTo',
)
let stripWidth = 900
let selectedLeft = 720
let selectedWidth = 120
let observers: {
  callback: () => void
  disconnect: ReturnType<typeof vi.fn>
}[]
let travel: ReturnType<typeof useTravel>

beforeEach(() => {
  scrollTo.mockReset()
  stripWidth = 900
  selectedLeft = 720
  selectedWidth = 120
  observers = []
  const trip: Trip = {
    id: 'trip',
    name: '日期条验证',
    startDate: '2026-09-30',
    days: Array.from({ length: 7 }, (_, index) => ({
      id: 'day-' + (index + 1),
      places: [],
    })),
    unscheduledPlaces: [],
  }
  travel = {
    activeTrip: trip,
    workspace: { trips: [trip] },
    status: 'ready',
    group: 'day-7',
    saving: false,
    error: null,
    setGroup: vi.fn(),
    run: vi.fn(),
    reload: vi.fn(),
  } as unknown as ReturnType<typeof useTravel>
  vi.mocked(useTravel).mockImplementation(() => travel)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn()
      constructor(callback: () => void) {
        observers.push({ callback, disconnect: this.disconnect })
      }
      observe() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === '地点筛选')
        return new DOMRect(0, 0, stripWidth, 40)
      if (this.getAttribute('aria-pressed') === 'true')
        return new DOMRect(selectedLeft, 0, selectedWidth, 40)
      return new DOMRect()
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollTo)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

describe('日期筛选条可见性', () => {
  it('宽屏缩窄后只横移日期条，不改变筛选或写入行程', () => {
    const view = render(<TravelToolbar compact />)
    expect(scrollTo).not.toHaveBeenCalled()
    stripWidth = 360
    act(() => observers[0].callback())
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 488 })
    expect(travel.setGroup).not.toHaveBeenCalled()
    expect(travel.run).not.toHaveBeenCalled()
    view.unmount()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
  })

  it('重新读取以及重新显示日期条后仍定位同一选中日期', () => {
    stripWidth = 360
    const view = render(<TravelToolbar compact />)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    travel = { ...travel, status: 'loading' }
    view.rerender(<TravelToolbar compact />)
    expect(
      screen.queryByRole('group', { name: '地点筛选' }),
    ).not.toBeInTheDocument()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    travel = { ...travel, status: 'ready' }
    view.rerender(<TravelToolbar compact />)
    expect(scrollTo).toHaveBeenCalledTimes(2)
    view.rerender(<TravelToolbar compact showGroups={false} />)
    view.rerender(<TravelToolbar compact />)
    expect(scrollTo).toHaveBeenCalledTimes(3)
    expect(travel.run).not.toHaveBeenCalled()
  })

  it('日期标签变宽后重新校正，向左移出时也只调整横轴', () => {
    stripWidth = 360
    selectedLeft = 200
    selectedWidth = 100
    const view = render(<TravelToolbar compact />)
    expect(scrollTo).not.toHaveBeenCalled()
    selectedWidth = 180
    travel = {
      ...travel,
      activeTrip: { ...travel.activeTrip!, startDate: '2026-10-01' },
    }
    view.rerender(<TravelToolbar compact />)
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 28 })
    const strip = screen.getByRole('group', { name: '地点筛选' })
    strip.scrollLeft = 100
    selectedLeft = -20
    act(() => observers.at(-1)!.callback())
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 72 })
  })
})

it('桌面日期下拉可直接跳到指定日期，上下天正确处理边界且不写数据', () => {
  const view = render(<TravelToolbar />)
  expect(screen.getByRole('button', { name: '下一天' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '上一天' }))
  expect(travel.setGroup).toHaveBeenLastCalledWith('day-6')
  fireEvent.change(screen.getByRole('combobox', { name: '选择日期' }), {
    target: { value: 'day-1' },
  })
  expect(travel.setGroup).toHaveBeenLastCalledWith('day-1')
  travel = { ...travel, group: 'day-1' }
  view.rerender(<TravelToolbar />)
  expect(screen.getByRole('button', { name: '上一天' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '下一天' }))
  expect(travel.setGroup).toHaveBeenLastCalledWith('day-2')
  expect(travel.run).not.toHaveBeenCalled()
})
