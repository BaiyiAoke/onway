import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DayRouteSummary, RouteLeg } from './TransportSummary'
import { OptionDetails } from './TransportEditor'
import { useRoutes } from '../../services/routes/RoutesContext'
import { useTravel } from '../../services/travel/TravelContext'
import { daySegments, recordForRequest } from '../../services/routes/transport'
import { travelFixture, optionFixture } from '../../test/transportFixtures'
vi.mock('../../services/travel/TravelContext', () => ({ useTravel: vi.fn() }))
vi.mock('../../services/routes/RoutesContext', () => ({ useRoutes: vi.fn() }))
vi.mock('../places/SearchPanel', () => ({
  MapServiceSettingsButton: () => null,
}))
const run = vi.fn(async () => true)
let workspace = travelFixture()
beforeEach(() => {
  workspace = travelFixture()
  run.mockClear()
  vi.mocked(useTravel).mockReturnValue({
    workspace,
    run,
    saving: false,
  } as unknown as ReturnType<typeof useTravel>)
  vi.mocked(useRoutes).mockReturnValue({
    segments: { status: 'ready', entries: {}, operations: {}, error: null },
    state: { status: 'ready', entries: {}, operations: {}, error: null },
  } as unknown as ReturnType<typeof useRoutes>)
})
describe('分段交通展示', () => {
  it('飞机展示已存跨日时刻和航班号，纯手动交通无需刷新按钮', () => {
    const trip = workspace.trips[0],
      day = trip.days[0],
      record = recordForRequest(trip, daySegments(trip, day)[0])
    record.config.mode = 'flight'
    record.flight = {
      number: 'CA1234',
      departureAirport: '首都机场',
      arrivalAirport: '白云机场',
      departureAt: '2026-09-16T23:00:00+08:00',
      arrivalAt: '2026-09-17T01:10:00+08:00',
      note: '',
    }
    trip.transport = [record]
    render(
      <>
        <RouteLeg tripId={trip.id} day={day} toIndex={1} />
        <DayRouteSummary trip={trip} day={day} editable />
      </>,
    )
    expect(screen.getByRole('button', { name: '飞机' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: '飞机' }))
    expect(run).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: '交通：起点到终点' }),
    ).toHaveTextContent('CA1234 · 已记录')
    expect(screen.getByText('23:00 → 01:10（次日）')).toBeInTheDocument()
    expect(screen.getByLabelText('当天交通汇总')).toHaveTextContent(
      '含距离未知的交通',
    )
    expect(
      screen.queryByRole('button', { name: '刷新当天交通' }),
    ).not.toBeInTheDocument()
  })
  it('当前方式可聚焦且保持选中，重复点选不保存，切换步行才提交', () => {
    const trip = workspace.trips[0]
    render(<RouteLeg tripId={trip.id} day={trip.days[0]} toIndex={1} />)
    const selected = screen.getByRole('button', { name: '自驾' })
    expect(selected).toBeEnabled()
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(selected)
    expect(run).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '步行' }))
    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          config: expect.objectContaining({ mode: 'walking' }),
        }),
      }),
    )
  })
  it('紧凑条目无快捷控件，车次显示实际跨午夜时刻，待核对不能计入总计', () => {
    const trip = workspace.trips[0],
      day = trip.days[0],
      record = recordForRequest(trip, daySegments(trip, day)[0])
    record.config.mode = 'train'
    record.needsReview = true
    record.train = {
      number: 'G123',
      departureStation: '起始站',
      arrivalStation: '终点站',
      departureAt: '2026-09-16T23:00:00+08:00',
      arrivalAt: '2026-09-17T01:10:00+08:00',
      note: '',
    }
    trip.transport = [record]
    render(
      <>
        <RouteLeg tripId={trip.id} day={day} toIndex={1} variant="compact" />
        <DayRouteSummary trip={trip} day={day} density="compact" />
      </>,
    )
    expect(screen.queryByLabelText('快速选择交通方式')).not.toBeInTheDocument()
    expect(screen.getByText('23:00 → 01:10（次日）')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '交通：起点到终点' }),
    ).toHaveTextContent('待核对车次')
    expect(screen.getByLabelText('当天交通汇总')).toHaveTextContent(
      '0 / 1 段有结果 · 部分汇总 · 含待确认路段',
    )
    expect(screen.queryByText('约 2 小时 10 分钟')).not.toBeInTheDocument()
  })
  it('步骤仅显示服务实际提供的距离和时间，缺失字段不生成零值', () => {
    const option = optionFixture()
    option.steps = [
      {
        mode: 'walking',
        instruction: '步行至车站',
        durationSeconds: 480,
        distanceMeters: 600,
        lines: [],
      },
      {
        mode: 'subway',
        instruction: '地铁示例线',
        departureStop: '起始站',
        arrivalStop: '终点站',
        lines: [],
      },
    ]
    render(<OptionDetails option={option} />)
    expect(screen.getByText('约 8 分钟 · 600 米')).toBeInTheDocument()
    const subway = screen.getByText('地铁示例线').closest('li')!
    expect(subway).toHaveTextContent('起始站 → 终点站')
    expect(subway).not.toHaveTextContent('分钟')
    expect(subway).not.toHaveTextContent('0 米')
  })
})
