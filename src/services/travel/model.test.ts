import { describe, expect, it } from 'vitest'
import {
  applyTravelAction,
  emptyWorkspace,
  formatDayLabel,
  getGroupPlaces,
  getTodayDayIndex,
  isValidCalendarDate,
} from './model'
import type { TripPlace, TravelWorkspace } from './types'

function place(id: string, name = id): TripPlace {
  return {
    id,
    name,
    note: '',
    coordinates: { longitude: 103.8, latitude: 36.1, crs: 'WGS84' },
  }
}

function create(
  name = '河西之旅',
  dayCount = 3,
  startDate: string | null = null,
) {
  return applyTravelAction(emptyWorkspace(), {
    type: 'createTrip',
    name,
    dayCount,
    startDate,
  })
}

function add(
  workspace: TravelWorkspace,
  value: TripPlace,
  dayId: string | null = null,
  tripId = workspace.activeTripId!,
) {
  return applyTravelAction(workspace, {
    type: 'savePlace',
    tripId,
    place: value,
    dayId,
  })
}

describe('个人行程动作', () => {
  it('默认空工作区；显式示例使用独立 ID，修改一个行程不影响另一个', () => {
    expect(emptyWorkspace().trips).toEqual([])
    let workspace = applyTravelAction(emptyWorkspace(), {
      type: 'createTrip',
      name: '示例一',
      dayCount: 3,
      startDate: null,
      demo: true,
    })
    const first = workspace.trips[0]
    workspace = applyTravelAction(workspace, {
      type: 'createTrip',
      name: '示例二',
      dayCount: 1,
      startDate: null,
      demo: true,
    })
    const second = workspace.trips[1]
    expect(getGroupPlaces(first, 'all')).toHaveLength(3)
    expect(getGroupPlaces(second, 'all')).toHaveLength(3)
    expect(getGroupPlaces(first, 'all').map((item) => item.id)).not.toEqual(
      getGroupPlaces(second, 'all').map((item) => item.id),
    )
    const changed = applyTravelAction(workspace, {
      type: 'savePlace',
      tripId: first.id,
      place: { ...first.days[0].places[0], name: '我的兰州' },
      dayId: first.days[0].id,
    })
    expect(changed.trips[0].days[0].places[0].name).toBe('我的兰州')
    expect(changed.trips[1]).toEqual(second)
    expect(workspace.trips[0].days[0].places[0].name).toBe('兰州')
    expect(() =>
      add(workspace, first.days[0].places[0], null, second.id),
    ).toThrow('属于其他行程')
  })

  it('地点在未安排和每天之间移动保留 ID；同组编辑保留位置，排序不会复制地点', () => {
    let workspace = create()
    const tripId = workspace.activeTripId!
    const dayId = workspace.trips[0].days[0].id
    workspace = add(add(workspace, place('a')), place('b'), dayId)
    workspace = applyTravelAction(workspace, {
      type: 'movePlace',
      tripId,
      placeId: 'a',
      dayId,
    })
    workspace = applyTravelAction(workspace, {
      type: 'reorderPlace',
      tripId,
      placeId: 'a',
      direction: -1,
    })
    workspace = add(workspace, place('a', '新名称'), dayId)
    expect(workspace.trips[0].days[0].places.map((item) => item.id)).toEqual([
      'a',
      'b',
    ])
    expect(workspace.trips[0].unscheduledPlaces).toEqual([])
    workspace = applyTravelAction(workspace, {
      type: 'movePlace',
      tripId,
      placeId: 'a',
      dayId: null,
    })
    expect(workspace.trips[0].unscheduledPlaces[0].name).toBe('新名称')
    expect(getGroupPlaces(workspace.trips[0], 'all')).toHaveLength(2)
  })

  it('删除一天将地点按顺序移回未安排，剩余日期重新编号且至少保留一天', () => {
    let workspace = create('跨月旅行', 3, '2026-09-30')
    const tripId = workspace.activeTripId!
    const day = workspace.trips[0].days[1]
    workspace = add(
      add(add(workspace, place('unplanned')), place('a'), day.id),
      place('b'),
      day.id,
    )
    workspace = applyTravelAction(workspace, {
      type: 'deleteDay',
      tripId,
      dayId: day.id,
    })
    expect(workspace.trips[0].unscheduledPlaces.map((item) => item.id)).toEqual(
      ['unplanned', 'a', 'b'],
    )
    expect(formatDayLabel(workspace.trips[0], 1)).toBe('第 2 天 · 10 月 1 日')
    workspace = applyTravelAction(workspace, {
      type: 'deleteDay',
      tripId,
      dayId: workspace.trips[0].days[0].id,
    })
    expect(() =>
      applyTravelAction(workspace, {
        type: 'deleteDay',
        tripId,
        dayId: workspace.trips[0].days[0].id,
      }),
    ).toThrow('至少保留一天')
  })

  it('修改出发日期不删除地点；删除当前行程后切换到剩余行程', () => {
    let workspace = add(create(), place('a'))
    const firstId = workspace.activeTripId!
    workspace = applyTravelAction(workspace, {
      type: 'updateTrip',
      tripId: firstId,
      name: '新行程名',
      startDate: '2026-12-31',
    })
    expect(workspace.trips[0].unscheduledPlaces[0].id).toBe('a')
    workspace = applyTravelAction(workspace, {
      type: 'createTrip',
      name: '另一个',
      startDate: null,
      dayCount: 1,
    })
    workspace = applyTravelAction(workspace, {
      type: 'deleteTrip',
      tripId: workspace.activeTripId!,
    })
    expect(workspace.activeTripId).toBe(firstId)
    workspace = applyTravelAction(workspace, {
      type: 'deleteTrip',
      tripId: firstId,
    })
    expect(workspace).toEqual(emptyWorkspace())
  })
})

describe('本地日历日期', () => {
  it('验证真实日期，支持闰日、跨月和跨年，未定日期没有今天索引', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true)
    for (const date of [
      '2026-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-9-1',
      '0000-01-01',
    ]) {
      expect(isValidCalendarDate(date)).toBe(false)
      expect(() => create('无效日期', 1, date)).toThrow('有效的出发日期')
    }
    const leapTrip = create('闰日', 3, '2024-02-28').trips[0]
    expect(formatDayLabel(leapTrip, 2)).toBe('第 3 天 · 3 月 1 日')
    expect(getTodayDayIndex(leapTrip, '2024-02-29')).toBe(1)
    expect(getTodayDayIndex(leapTrip, '2024-03-02')).toBeNull()
    const yearTrip = create('跨年', 2, '2026-12-31').trips[0]
    expect(getTodayDayIndex(yearTrip, '2027-01-01')).toBe(1)
    expect(getTodayDayIndex(yearTrip, '2026-12-30')).toBeNull()
    expect(getTodayDayIndex(create().trips[0], '2026-09-30')).toBeNull()
    expect(formatDayLabel(create().trips[0], 0)).toBe('第 1 天')
  })
})
