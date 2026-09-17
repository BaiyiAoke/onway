import { beforeAll, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TransportEditor } from './TransportEditor'
import { useTravel } from '../../services/travel/TravelContext'
import { useRoutes } from '../../services/routes/RoutesContext'
import {
  configFingerprint,
  daySegments,
  recordForRequest,
} from '../../services/routes/transport'
import { travelFixture, optionFixture } from '../../test/transportFixtures'
import { applyTravelAction } from '../../services/travel/model'
import type {
  TransportRecord,
  TransportMode,
} from '../../services/routes/transportTypes'
import type { TravelAction } from '../../services/travel/types'
vi.mock('../places/SearchPanel', () => ({
  MapServiceSettingsButton: () => null,
}))
vi.mock('../../services/travel/TravelContext', () => ({ useTravel: vi.fn() }))
vi.mock('../../services/routes/RoutesContext', () => ({ useRoutes: vi.fn() }))
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
function renderReview() {
  const w = travelFixture(),
    trip = w.trips[0],
    before = daySegments(trip, trip.days[0])[0],
    record = recordForRequest(trip, before)
  record.config = {
    mode: 'transit',
    provider: 'amap',
    strategy: 0,
    departure: { kind: 'scheduled', at: '2026-09-16T09:00:00+08:00' },
    reviewedDate: before.date,
  }
  trip.transport = [record]
  record.selected = {
    fingerprint: configFingerprint(daySegments(trip, trip.days[0])[0]),
    option: optionFixture(),
  }
  trip.days[0].places[0].coordinates.longitude = 116.45
  record.needsReview = true
  const run = vi.fn(async () => true),
    onClose = vi.fn(),
    request = daySegments(trip, trip.days[0])[0]
  vi.mocked(useTravel).mockReturnValue({
    run,
    saving: false,
    error: null,
  } as unknown as ReturnType<typeof useTravel>)
  vi.mocked(useRoutes).mockReturnValue({
    segments: { status: 'ready', entries: {}, operations: {}, error: null },
    segmentController: { calculate: vi.fn() },
  } as unknown as ReturnType<typeof useRoutes>)
  render(<TransportEditor trip={trip} request={request} onClose={onClose} />)
  return { run, onClose, record, request }
}
describe('公共交通待确认面板', () => {
  it('未核对不能保存，普通保存不把旧选择自动认作当前路线', async () => {
    const f = renderReview()
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    expect(f.run).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('请核对')
    fireEvent.click(screen.getByLabelText('我已核对路段和出发、到达时间'))
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    await waitFor(() => expect(f.run).toHaveBeenCalledOnce())
    expect(f.run.mock.calls[0]).toBeDefined()
    expect(vi.mocked(useTravel)().run).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ selected: f.record.selected }),
      }),
    )
  })
  it('显式确认原方案后绑定当前输入，原查询指纹仍保留', async () => {
    const f = renderReview(),
      original = f.record.selected!.fingerprint
    fireEvent.click(screen.getByLabelText('我已核对路段和出发、到达时间'))
    fireEvent.click(
      screen.getByLabelText('我已核对原方案，确认将它用于当前路段和时间'),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    await waitFor(() => expect(f.run).toHaveBeenCalledOnce())
    expect(f.onClose).not.toHaveBeenCalled()
    expect(vi.mocked(useTravel)().run).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          selected: expect.objectContaining({
            fingerprint: original,
            confirmedFingerprint: configFingerprint(f.request),
          }),
        }),
      }),
    )
  })
})

function renderEditable(record?: TransportRecord, initialMode?: TransportMode) {
  let workspace = travelFixture()
  if (record) workspace.trips[0].transport = [record]
  const calculate = vi.fn(async () => undefined),
    onClose = vi.fn()
  const run = vi.fn(async (action: TravelAction) => {
    workspace = applyTravelAction(workspace, action)
    rendered.rerender(editor())
    return true
  })
  vi.mocked(useTravel).mockReturnValue({
    run,
    saving: false,
    error: null,
  } as unknown as ReturnType<typeof useTravel>)
  vi.mocked(useRoutes).mockReturnValue({
    segments: { status: 'ready', entries: {}, operations: {}, error: null },
    segmentController: { calculate },
  } as unknown as ReturnType<typeof useRoutes>)
  function editor() {
    const trip = workspace.trips[0]
    return (
      <TransportEditor
        trip={trip}
        request={daySegments(trip, trip.days[0])[0]}
        initialMode={initialMode}
        onClose={onClose}
      />
    )
  }
  const rendered = render(editor())
  return { run, calculate, onClose, workspace: () => workspace }
}
function trainRecord() {
  const trip = travelFixture().trips[0],
    record = recordForRequest(trip, daySegments(trip, trip.days[0])[0])
  record.config.mode = 'train'
  record.train = {
    number: 'G123',
    departureStation: '出发站',
    arrivalStation: '到达站',
    departureAt: '2026-09-16T23:00:00+08:00',
    arrivalAt: '2026-09-17T01:10:00+08:00',
    note: '已确认',
  }
  return record
}
describe('飞机录入与连续查询', () => {
  it('主动改为飞机继承车次字段，保存航班保留原车次并且不算路', async () => {
    const record = trainRecord(),
      f = renderEditable(record)
    expect(screen.getByLabelText('已保存的交通记录')).toHaveTextContent(
      '火车 · G123',
    )
    expect(
      screen.getByRole('button', { name: '修改交通设置' }),
    ).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: '修改交通设置' }))
    expect(screen.getByRole('option', { name: '火车' })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /手动记录/ }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'flight' },
    })
    expect(screen.getByLabelText('航班号')).toHaveValue('G123')
    expect(screen.getByLabelText('出发机场')).toHaveValue('出发站')
    expect(screen.getByLabelText('到达日期时间（北京时间）')).toHaveValue(
      '2026-09-17T01:10',
    )
    fireEvent.change(screen.getByLabelText('航班号'), {
      target: { value: 'CA1234' },
    })
    fireEvent.change(screen.getByLabelText('出发机场'), {
      target: { value: '首都机场' },
    })
    fireEvent.change(screen.getByLabelText('到达机场'), {
      target: { value: '白云机场' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalledOnce())
    expect(f.workspace().trips[0].transport![0]).toMatchObject({
      config: { mode: 'flight' },
      train: record.train,
      flight: {
        number: 'CA1234',
        departureAirport: '首都机场',
        arrivalAt: '2026-09-17T01:10:00+08:00',
      },
    })
    expect(f.calculate).not.toHaveBeenCalled()
  })
  it('两种已有记录之间来回切换，不覆盖各自号码与机场/车站', () => {
    const record = trainRecord()
    record.flight = {
      number: 'MU5678',
      departureAirport: '虹桥机场',
      arrivalAirport: '白云机场',
      departureAt: record.train!.departureAt,
      arrivalAt: record.train!.arrivalAt,
      note: '航班备注',
    }
    renderEditable(record)
    fireEvent.click(screen.getByRole('button', { name: '修改交通设置' }))
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'flight' },
    })
    expect(screen.getByLabelText('航班号')).toHaveValue('MU5678')
    expect(screen.getByLabelText('出发机场')).toHaveValue('虹桥机场')
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'train' },
    })
    expect(screen.getByLabelText('车次')).toHaveValue('G123')
    expect(screen.getByLabelText('出发站')).toHaveValue('出发站')
  })
  it('新航班离线填写跨日时间即可保存，出发日期不匹配时先提示', async () => {
    const f = renderEditable(undefined, 'flight')
    fireEvent.change(screen.getByLabelText('航班号'), {
      target: { value: 'CA1234' },
    })
    fireEvent.change(screen.getByLabelText('出发日期时间（北京时间）'), {
      target: { value: '2026-09-17T23:00' },
    })
    fireEvent.change(screen.getByLabelText('到达日期时间（北京时间）'), {
      target: { value: '2026-09-18T01:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '航班出发日期须与这一天一致',
    )
    expect(f.run).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('出发日期时间（北京时间）'), {
      target: { value: '2026-09-16T23:00' },
    })
    fireEvent.change(screen.getByLabelText('到达日期时间（北京时间）'), {
      target: { value: '2026-09-17T01:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }))
    await waitFor(() => expect(f.onClose).toHaveBeenCalledOnce())
    expect(f.calculate).not.toHaveBeenCalled()
  })
  it('保存并查询采用最新输入且保持面板打开，再次保存使用新的冲突快照', async () => {
    const f = renderEditable()
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'walking' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    await waitFor(() => expect(f.calculate).toHaveBeenCalledOnce())
    expect(f.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ mode: 'walking' }),
      }),
    )
    expect(f.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '交通详情' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '修改交通设置' }))
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'driving' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    await waitFor(() => expect(f.calculate).toHaveBeenCalledTimes(2))
    expect(f.workspace().trips[0].transport![0].config.mode).toBe('driving')
    expect(f.onClose).not.toHaveBeenCalled()
  })
  it('保存失败保留输入，不开始新查询', async () => {
    const f = renderEditable()
    f.run.mockResolvedValueOnce(false)
    fireEvent.change(screen.getByLabelText('交通方式'), {
      target: { value: 'walking' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并查询' }))
    await waitFor(() => expect(f.run).toHaveBeenCalledOnce())
    expect(f.calculate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('交通方式')).toHaveValue('walking')
    expect(f.onClose).not.toHaveBeenCalled()
  })
})
