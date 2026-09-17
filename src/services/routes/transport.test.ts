import { describe, it, expect } from 'vitest'
import { applyTravelAction, defaultCategories } from '../travel/model'
import {
  parseWorkspace,
  TravelRepository,
  TRAVEL_WORKSPACE_KEY,
} from '../travel/repository'
import { createBackup, parseBackup, serializeBackup } from '../backup/model'
import { daySegments, recordForRequest, configFingerprint } from './transport'
import { dayTransport, selectSegment, transportLines } from './segmentView'
import { parseRouteCache } from './repository'
import { validTransport, validInstant } from './transportValidation'
import {
  travelFixture,
  optionFixture,
  memoryStore,
} from '../../test/transportFixtures'
import type { SegmentState } from './segmentController'
const empty: SegmentState = {
  status: 'ready',
  entries: {},
  operations: {},
  error: null,
}
const legacy = {
  status: 'ready' as const,
  entries: {},
  operations: {},
  error: null,
}
function recorded() {
  let w = travelFixture()
  const t = w.trips[0],
    r = daySegments(t, t.days[0])[0],
    record = recordForRequest(t, r)
  record.config = { mode: 'train', provider: 'amap', strategy: 0 }
  record.train = {
    number: 'G123',
    departureStation: '北京',
    arrivalStation: '天津',
    departureAt: '2026-09-16T23:00:00+08:00',
    arrivalAt: '2026-09-17T01:00:00+08:00',
    note: '已确定',
  }
  w = applyTravelAction(w, { type: 'saveTransport', tripId: t.id, record })
  return w
}
describe('分段业务数据和迁移', () => {
  it('v2 读取仅内存迁移，下次保存写 v4；默认相邻段为高德自驾', async () => {
    const { store, values } = memoryStore(),
      old = {
        ...travelFixture(),
        schemaVersion: 2,
        categories: defaultCategories()
          .filter(
            (c) => !['category-airport', 'category-station'].includes(c.id),
          )
          .concat({ id: 'category-transport', name: '交通', builtin: true }),
      }
    const raw = JSON.stringify(old)
    values.set(TRAVEL_WORKSPACE_KEY, raw)
    const repo = new TravelRepository(store),
      loaded = await repo.load()
    expect(loaded.schemaVersion).toBe(4)
    expect(values.get(TRAVEL_WORKSPACE_KEY)).toBe(raw)
    expect(
      daySegments(loaded.trips[0], loaded.trips[0].days[0])[0].config,
    ).toMatchObject({ mode: 'driving', provider: 'amap' })
    await repo.run({
      type: 'updateTrip',
      tripId: 'trip',
      name: '新名称',
      startDate: null,
    })
    expect(JSON.parse(values.get(TRAVEL_WORKSPACE_KEY)!).schemaVersion).toBe(4)
  })
  it.each(['reorder', 'move', 'delete', 'deleteDay'])(
    '地点关系变化保留完整车次为待关联：%s',
    (mode) => {
      const w = recorded(),
        before = structuredClone(w.trips[0].transport![0])
      const next = applyTravelAction(
        w,
        mode === 'reorder'
          ? {
              type: 'reorderPlace',
              tripId: 'trip',
              placeId: 'b',
              direction: -1,
            }
          : mode === 'move'
            ? {
                type: 'movePlace',
                tripId: 'trip',
                placeId: 'b',
                dayId: 'other',
              }
            : mode === 'deleteDay'
              ? { type: 'deleteDay', tripId: 'trip', dayId: 'day' }
              : { type: 'deletePlace', tripId: 'trip', placeId: 'a' },
      )
      const after = next.trips[0].transport![0]
      expect(after.dayId).toBeNull()
      expect(after.train).toEqual(before.train)
      expect(after.from.name).toBe('起点')
      expect(parseWorkspace(JSON.stringify(next))).toEqual(next)
    },
  )
  it('改名保留车次，坐标与日期改变只标记待核对，不改写已确定时间', () => {
    let w = recorded()
    w.trips[0].days[0].places[0].citycode = '010'
    let p = w.trips[0].days[0].places[0]
    w = applyTravelAction(w, {
      type: 'savePlace',
      tripId: 'trip',
      dayId: 'day',
      place: { ...p, name: '新名称' },
    })
    expect(w.trips[0].transport![0].needsReview).not.toBe(true)
    p = w.trips[0].days[0].places[0]
    w = applyTravelAction(w, {
      type: 'savePlace',
      tripId: 'trip',
      dayId: 'day',
      place: { ...p, coordinates: { ...p.coordinates, longitude: 117 } },
    })
    expect(w.trips[0].days[0].places[0].citycode).toBeUndefined()
    expect(w.trips[0].transport![0].needsReview).toBe(true)
    w = applyTravelAction(w, {
      type: 'updateTrip',
      tripId: 'trip',
      name: '改期',
      startDate: '2026-09-20',
    })
    expect(w.trips[0].transport![0].train!.departureAt).toBe(
      '2026-09-16T23:00:00+08:00',
    )
  })
  it('交通快照白名单往返保留城市、车次、已选方案和待关联记录', () => {
    const w = recorded(),
      record = w.trips[0].transport![0]
    record.selected = { fingerprint: 'saved', option: optionFixture() }
    record.dayId = null
    Object.assign(record.config, { amapKey: 'secret-should-not-export' })
    Object.assign(record.selected.option.steps[0], {
      rawResponse: 'secret-should-not-export',
    })
    w.trips[0].days[0].places[0].citycode = '010'
    w.trips[0].days[0].places[0].adcode = '110105'
    const text = serializeBackup(createBackup(w, '个人备注'))
    expect(text).not.toContain('secret-should-not-export')
    const restored = parseBackup(text)
    expect(restored.workspace.trips[0].transport![0].train).toEqual(
      record.train,
    )
    expect(
      restored.workspace.trips[0].transport![0].selected!.option.steps,
    ).toEqual(optionFixture().steps)
    expect(restored.workspace.trips[0].days[0].places[0].citycode).toBe('010')
  })
  it('拒绝重复关联、畸形记录、无效日期，过期草稿不覆盖新记录', () => {
    const w = recorded(),
      record = w.trips[0].transport![0]
    expect(() =>
      applyTravelAction(w, {
        type: 'saveTransport',
        tripId: 'trip',
        record: { ...record, id: 'another' },
      }),
    ).toThrow('已有')
    expect(() =>
      applyTravelAction(w, {
        type: 'saveTransport',
        tripId: 'trip',
        record,
        expected: 'null',
      }),
    ).toThrow('已更新')
    expect(
      validTransport({
        ...record,
        train: { ...record.train, arrivalAt: 'broken' },
      }),
    ).toBe(false)
    expect(validInstant('2026-02-30T12:00:00+08:00')).toBe(false)
  })
  it('旧整日缓存迁移不拆分几何，也不伪造分段结果', () => {
    expect(
      parseRouteCache(JSON.stringify({ schemaVersion: 1, entries: [] })),
    ).toEqual({ schemaVersion: 2, entries: [], segments: [] })
  })
})
describe('方案保护与部分汇总', () => {
  it('新候选不会覆盖已选公交；改变端点后旧选择不参与汇总', () => {
    const w = travelFixture(),
      t = w.trips[0]
    let r = daySegments(t, t.days[0])[0]
    const record = recordForRequest(t, r)
    record.config = {
      mode: 'transit',
      provider: 'amap',
      strategy: 0,
      departure: { kind: 'now' },
      reviewedDate: r.date,
    }
    t.transport = [record]
    r = daySegments(t, t.days[0])[0]
    record.selected = {
      fingerprint: configFingerprint(r),
      option: optionFixture(),
    }
    const state = { ...empty, entries: {} }
    expect(selectSegment(state, t, r).durationSeconds).toBe(600)
    t.days[0].places[0].coordinates.longitude = 117
    r = daySegments(t, t.days[0])[0]
    expect(selectSegment(state, t, r).durationSeconds).toBeUndefined()
    expect(dayTransport(state, legacy, t, t.days[0]).completed).toBe(0)
    // 原查询指纹保持不变；只有显式核对当前关系后才恢复汇总。
    const original = record.selected.fingerprint
    record.selected.confirmedFingerprint = configFingerprint(r)
    expect(selectSegment(state, t, r).durationSeconds).toBe(600)
    expect(record.selected.fingerprint).toBe(original)
  })
  it('跨午夜车次计时正确，未知距离与缺失路段不当作完整总计', () => {
    const w = recorded(),
      t = w.trips[0]
    t.days[0].places.push({ ...t.days[0].places[1], id: 'c' })
    const summary = dayTransport(empty, legacy, t, t.days[0])
    expect(summary).toMatchObject({
      completed: 1,
      total: 2,
      durationSeconds: 7200,
      unknownDistance: true,
    })
    expect(transportLines(empty, legacy, t, 'all')).toEqual([])
  })
})

describe('飞机手动记录', () => {
  function flightWorkspace() {
    const w = recorded(),
      record = w.trips[0].transport![0]
    record.config.mode = 'flight'
    record.flight = {
      number: 'CA1234',
      departureAirport: '首都机场',
      arrivalAirport: '白云机场',
      departureAt: '2026-09-16T23:30:00+08:00',
      arrivalAt: '2026-09-17T02:10:00+08:00',
      note: 'T3 出发',
    }
    return w
  }
  it('航班和原车次独立往返备份，跨日只计入出发当天且不伪造几何', () => {
    const w = flightWorkspace(),
      trip = w.trips[0],
      record = trip.transport![0]
    Object.assign(record.flight!, { apiKey: 'not-exported' })
    const text = serializeBackup(createBackup(w, ''))
    expect(text).not.toContain('not-exported')
    const restored = parseBackup(text).workspace.trips[0].transport![0]
    expect(restored.flight).toMatchObject({
      number: 'CA1234',
      departureAirport: '首都机场',
      arrivalAirport: '白云机场',
      arrivalAt: '2026-09-17T02:10:00+08:00',
    })
    expect(restored.train).toEqual(record.train)
    expect(dayTransport(empty, legacy, trip, trip.days[0])).toMatchObject({
      completed: 1,
      durationSeconds: 9600,
      unknownDistance: true,
    })
    expect(dayTransport(empty, legacy, trip, trip.days[1]).completed).toBe(0)
    expect(transportLines(empty, legacy, trip, 'all')).toEqual([])
  })
  it('航班关系变化进入待关联，日期改变仅要求核对', () => {
    const w = flightWorkspace(),
      before = structuredClone(w.trips[0].transport![0])
    const changed = applyTravelAction(w, {
      type: 'updateTrip',
      tripId: 'trip',
      name: '改期',
      startDate: '2026-09-20',
    })
    expect(changed.trips[0].transport![0].needsReview).toBe(true)
    expect(changed.trips[0].transport![0].flight).toEqual(before.flight)
    expect(
      dayTransport(empty, legacy, changed.trips[0], changed.trips[0].days[0])
        .completed,
    ).toBe(0)
    const moved = applyTravelAction(w, {
      type: 'movePlace',
      tripId: 'trip',
      placeId: 'b',
      dayId: 'other',
    })
    expect(moved.trips[0].transport![0]).toMatchObject({
      dayId: null,
      needsReview: true,
      flight: before.flight,
      train: before.train,
    })
  })
  it('拒绝缺机场和逆序时刻的航班记录', () => {
    const record = flightWorkspace().trips[0].transport![0]
    expect(validTransport(record)).toBe(true)
    expect(
      validTransport({
        ...record,
        flight: { ...record.flight, arrivalAirport: '' },
      }),
    ).toBe(false)
    expect(
      validTransport({
        ...record,
        flight: { ...record.flight, arrivalAt: record.flight!.departureAt },
      }),
    ).toBe(false)
  })
})
