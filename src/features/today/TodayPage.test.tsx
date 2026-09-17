import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip } from '../../services/travel/types'
import { TodayPage } from './TodayPage'

const state = vi.hoisted(() => ({
  activeTrip: null as Trip | null,
  setGroup: vi.fn(),
}))

vi.mock('../../services/travel/TravelContext', () => ({
  useTravel: () => ({
    ...state,
    status: 'ready',
    workspace: state.activeTrip ? { trips: [state.activeTrip] } : null,
  }),
}))
vi.mock('../travel/TravelToolbar', () => ({
  TravelToolbar: () => <div>行程切换</div>,
}))
vi.mock('./NoteEditor', () => ({
  NoteEditor: () => <section aria-label="个人备注">个人备注</section>,
}))

function exampleTrip(startDate: string | null): Trip {
  const place = (id: string, name: string) => ({
    id,
    name,
    note: '',
    coordinates: {
      longitude: 103.8343,
      latitude: 36.0611,
      crs: 'WGS84' as const,
    },
  })
  return {
    id: 'trip-1',
    name: '我的西北行',
    startDate,
    days: [
      { id: 'day-1', places: [place('first', '首日地点')] },
      { id: 'day-2', places: [place('second', '当天地点')] },
    ],
    unscheduledPlaces: [place('unplanned', '未安排地点')],
  }
}

function showPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 9, 12))
  state.activeTrip = null
  state.setGroup.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('今天页的真实行程', () => {
  it('无行程时引导创建，个人备注仍可独立使用', () => {
    showPage()
    expect(
      screen.getByRole('link', { name: /前往计划页创建行程/ }),
    ).toHaveAttribute('href', '/plan')
    expect(screen.getByRole('region', { name: '个人备注' })).toBeInTheDocument()
    expect(screen.queryByText('兰州')).not.toBeInTheDocument()
  })

  it('行程覆盖今天时展示当天地点，跳到地图前清除日期筛选', () => {
    state.activeTrip = exampleTrip('2026-09-08')
    showPage()
    expect(
      screen.getByRole('heading', { name: '今天 · 第 2 天 · 9 月 9 日' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('首日地点')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: '在地图查看当天地点' })
    expect(link).toHaveAttribute('href', '/map?place=second')
    fireEvent.click(link)
    expect(state.setGroup).toHaveBeenCalledWith('all')
  })

  it.each([null, '2026-10-01', '2026-08-01'])(
    '日期 %s 不属于今天时明确展示首日预览',
    (startDate) => {
      state.activeTrip = exampleTrip(startDate)
      showPage()
      expect(
        screen.getByRole('heading', { name: '第 1 天预览' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: '在地图查看首日地点' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: '在地图查看当天地点' }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText('行程概览')).toHaveTextContent(
        '行程天数2天已安排地点2个未安排地点1个',
      )
    },
  )
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

describe('总览紧凑预览', () => {
  it.each([0, 1, 3, 5, 20])(
    '%s 个地点只预览前三个，展开后保持 N−1 段对应关系',
    (count) => {
      state.activeTrip = exampleTrip('2026-10-01')
      const day = state.activeTrip.days[0],
        template = day.places[0]
      day.places = Array.from({ length: count }, (_, index) => ({
        ...template,
        id: 'p' + index,
        name: '地点' + index,
      }))
      showPage()
      const visible = Math.min(3, count)
      expect(
        screen.queryAllByRole('link', { name: /^在地图查看/ }),
      ).toHaveLength(visible)
      expect(screen.queryAllByRole('button', { name: /^交通：/ })).toHaveLength(
        Math.max(0, visible - 1),
      )
      expect(
        screen.queryByLabelText('快速选择交通方式'),
      ).not.toBeInTheDocument()
      if (count > 1)
        expect(screen.getByLabelText('当天交通汇总')).toHaveTextContent(
          '0 / ' + (count - 1) + ' 段有结果',
        )
      if (count > 3) {
        fireEvent.click(
          screen.getByRole('button', { name: '展开全部 ' + count + ' 个地点' }),
        )
        expect(
          screen.getAllByRole('link', { name: /^在地图查看/ }),
        ).toHaveLength(count)
        const segments = screen.getAllByRole('button', { name: /^交通：/ })
        expect(segments).toHaveLength(count - 1)
        segments.forEach((segment, i) => {
          const from = screen.getByRole('link', { name: '在地图查看地点' + i }),
            to = screen.getByRole('link', { name: '在地图查看地点' + (i + 1) })
          expect(segment).toHaveAccessibleName(
            '交通：地点' + i + '到地点' + (i + 1),
          )
          expect(
            from.compareDocumentPosition(segment) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy()
          expect(
            segment.compareDocumentPosition(to) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy()
        })
        fireEvent.click(screen.getByRole('button', { name: '收起' }))
        expect(
          screen.getAllByRole('link', { name: /^在地图查看/ }),
        ).toHaveLength(3)
      } else
        expect(
          screen.queryByRole('button', { name: /展开全部/ }),
        ).not.toBeInTheDocument()
    },
  )
  it('切换行程或预览日期后收起，查看完整计划定位到预览日期', () => {
    state.activeTrip = exampleTrip('2026-09-08')
    const day = state.activeTrip.days[1]
    day.places = Array.from({ length: 5 }, (_, i) => ({
      ...day.places[0],
      id: 'p' + i,
      name: '当天地点' + i,
    }))
    const page = showPage()
    fireEvent.click(screen.getByRole('button', { name: '展开全部 5 个地点' }))
    fireEvent.click(screen.getByRole('link', { name: '查看完整计划' }))
    expect(state.setGroup).toHaveBeenLastCalledWith('day-2')
    state.activeTrip = { ...state.activeTrip, id: 'trip-2' }
    page.rerender(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('link', { name: /^在地图查看/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '展开全部 5 个地点' }))
    state.activeTrip = { ...state.activeTrip, startDate: '2026-10-01' }
    page.rerender(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: '第 1 天预览' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '收起' }),
    ).not.toBeInTheDocument()
  })
})
