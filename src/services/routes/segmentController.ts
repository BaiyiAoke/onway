import { todayLocalDate } from '../travel/model'
import type { TravelAction, TravelWorkspace, Trip } from '../travel/types'
import { AmapSegmentService, CityResolver } from './amap'
import {
  configFingerprint,
  daySegments,
  findRecord,
  matchingCache,
  requestFingerprint,
  segmentKey,
  segmentTtl,
} from './transport'
import type {
  CachedSegment,
  SegmentRequest,
  SegmentService,
} from './transportTypes'
import { RouteCacheRepository } from './repository'

export interface SegmentOperation {
  signature: string
  stage: 'calculating' | 'saving' | 'error' | 'unsaved'
  entry?: CachedSegment
  error?: string
}
export interface SegmentState {
  status: 'loading' | 'ready' | 'error'
  entries: Record<string, CachedSegment>
  operations: Record<string, SegmentOperation>
  error: string | null
}
type Job = {
  request: SegmentRequest
  signature: string
  controller: AbortController
  generation: number
}
type Writer = (action: TravelAction) => Promise<boolean>
// 城市补齐是同一次任务的准备工作，不能被其自身的持久化更新取消。
function intent(r: SegmentRequest): string {
  return JSON.stringify([
    configFingerprint({
      ...r,
      from: { ...r.from, citycode: undefined, adcode: undefined },
      to: { ...r.to, citycode: undefined, adcode: undefined },
    }),
    r.config.mode === 'transit' ? r.config.reviewedDate : undefined,
  ])
}
function queryIntent(r: SegmentRequest): string {
  return JSON.stringify([
    r.config.mode,
    r.config.provider,
    r.config.strategy,
    r.config.departure,
    r.config.reviewedDate,
    r.date,
  ])
}
export class SegmentController {
  private state: SegmentState = {
    status: 'loading',
    entries: {},
    operations: {},
    error: null,
  }
  private listeners = new Set<() => void>()
  private workspace: TravelWorkspace | null = null
  private ready = false
  private saving = false
  private generation = 0
  private loadId = 0
  private jobs = new Map<string, Job>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private writer: Writer = async () => false
  constructor(
    private repository: Pick<
      RouteCacheRepository,
      'load' | 'saveSegment'
    > = new RouteCacheRepository(),
    private service: SegmentService = new AmapSegmentService(),
    private cities: Pick<CityResolver, 'resolve'> = new CityResolver(),
  ) {}
  getSnapshot = () => this.state
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private publish(next: Partial<SegmentState>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((fn) => fn())
  }
  private operation(key: string, value?: SegmentOperation) {
    const operations = { ...this.state.operations }
    if (value) operations[key] = value
    else delete operations[key]
    this.publish({ operations })
  }
  private trip() {
    return this.workspace?.trips.find(
      (t) => t.id === this.workspace?.activeTripId,
    )
  }
  private requests(trip: Trip | undefined = this.trip()) {
    return trip?.days.flatMap((day) => daySegments(trip, day)) ?? []
  }
  private current(job: Job) {
    const request = this.requests().find(
      (r) => segmentKey(r) === segmentKey(job.request),
    )
    return (
      this.ready &&
      !job.controller.signal.aborted &&
      job.generation === this.generation &&
      !!request &&
      intent(request) === job.signature
    )
  }
  load = async () => {
    const id = ++this.loadId
    this.publish({ status: 'loading', error: null })
    try {
      const cache = await this.repository.load()
      if (id === this.loadId)
        this.publish({
          status: 'ready',
          entries: Object.fromEntries(cache.segments.map((s) => [s.key, s])),
          error: null,
        })
    } catch (e) {
      if (id === this.loadId)
        this.publish({
          status: 'error',
          error: e instanceof Error ? e.message : '路线读取失败。',
        })
    }
  }
  updateWorkspace(
    workspace: TravelWorkspace | null,
    ready: boolean,
    saving: boolean,
    writer: Writer,
  ) {
    const previous = this.ready ? this.trip() : undefined
    this.workspace = workspace
    this.ready = ready
    this.saving = saving
    this.writer = writer
    for (const [key, job] of this.jobs)
      if (!this.current(job)) {
        job.controller.abort()
        this.jobs.delete(key)
        this.operation(key)
      }
    const trip = this.trip()
    if (!ready || !previous || previous.id !== trip?.id) {
      for (const timer of this.timers.values()) clearTimeout(timer)
      this.timers.clear()
      return
    }
    const before = new Map(
      this.requests(previous).map((r) => [segmentKey(r), queryIntent(r)]),
    )
    const after = this.requests(trip)
    for (const [key, timer] of this.timers)
      if (!after.some((r) => segmentKey(r) === key)) {
        clearTimeout(timer)
        this.timers.delete(key)
      }
    for (const request of after) {
      const key = segmentKey(request)
      if (
        before.has(key) &&
        before.get(key) !== queryIntent(request) &&
        !['train', 'flight'].includes(request.config.mode)
      )
        this.schedule(key)
    }
  }
  private schedule(key: string) {
    const previous = this.timers.get(key)
    if (previous) clearTimeout(previous)
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        if (this.saving) {
          this.schedule(key)
          return
        }
        const request = this.requests().find((r) => segmentKey(r) === key)
        if (request) void this.calculate(request, false)
      }, 600),
    )
  }
  dispose = () => {
    this.generation++
    this.loadId++
    for (const timer of this.timers.values()) clearTimeout(timer)
    for (const job of this.jobs.values()) job.controller.abort()
    this.timers.clear()
    this.jobs.clear()
    this.publish({ operations: {} })
  }
  calculateDay = async (tripId: string, dayId: string) => {
    if (this.trip()?.id !== tripId) return
    await Promise.all(
      this.requests()
        .filter(
          (r) =>
            r.dayId === dayId && !['train', 'flight'].includes(r.config.mode),
        )
        .map((r) => this.calculate(r, true)),
    )
  }
  retrySave = async (request: SegmentRequest) => {
    const op = this.state.operations[segmentKey(request)]
    if (op?.stage === 'unsaved' && op.entry)
      await this.start(request, false, op.entry)
  }
  calculate = async (request: SegmentRequest, force = true) =>
    this.start(request, force)
  private async start(
    input: SegmentRequest,
    force: boolean,
    previous?: CachedSegment,
  ) {
    const key = segmentKey(input)
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
    const request = this.requests().find((r) => segmentKey(r) === key)
    if (
      !request ||
      intent(request) !== intent(input) ||
      !this.ready ||
      this.saving ||
      this.state.status !== 'ready' ||
      ['train', 'flight'].includes(request.config.mode)
    )
      return
    if (this.jobs.has(key)) return
    const cached = matchingCache(this.state.entries[key], request)
    if (
      !force &&
      !previous &&
      cached &&
      cached.expiresAt > Date.now() &&
      cached.fingerprint === requestFingerprint(request)
    )
      return
    const job: Job = {
      request: structuredClone(request),
      signature: intent(request),
      controller: new AbortController(),
      generation: this.generation,
    }
    this.jobs.set(key, job)
    let entry = previous
    this.operation(key, {
      signature: configFingerprint(request),
      stage: previous ? 'saving' : 'calculating',
      entry,
    })
    try {
      if (previous && previous.configFingerprint !== configFingerprint(request))
        return
      const r = job.request
      if (!entry) {
        if (r.config.mode === 'transit') {
          if (!r.config.departure)
            throw new Error('请先设置公共交通出发日期和时间。')
          if (r.config.departure.kind === 'now' && r.date !== todayLocalDate())
            throw new Error('这一天不是今天，请设置明确的出发日期时间。')
          const record = findRecord(this.trip()!, r.dayId, r.from.id, r.to.id)
          if (record?.config.reviewedDate !== r.date)
            throw new Error('行程日期已改变，请核对交通时间并保存。')
          for (const side of ['from', 'to'] as const) {
            if (r[side].citycode) continue
            const city = await this.cities.resolve(
              r[side],
              job.controller.signal,
            )
            if (!this.current(job)) return
            if (
              !(await this.writer({
                type: 'savePlaceCity',
                tripId: r.tripId,
                placeId: r[side].id,
                coordinates: r[side].coordinates,
                city,
              }))
            )
              throw new Error('城市信息未保存，请重新读取行程后重试。')
            if (!this.current(job)) return
            Object.assign(r[side], city)
          }
        }
        const result = await this.service.calculateSegment(
          r,
          job.controller.signal,
        )
        if (!this.current(job)) return
        entry = {
          key,
          fingerprint: requestFingerprint(r),
          configFingerprint: configFingerprint(r),
          expiresAt: Date.now() + segmentTtl(r),
          result,
        }
      }
      if (!this.current(job)) return
      this.operation(key, {
        signature: entry.configFingerprint,
        stage: 'saving',
        entry,
      })
      const keys = this.workspace!.trips.flatMap((t) =>
        this.requests(t).map(segmentKey),
      )
      const saved = await this.repository.saveSegment(entry, keys, () =>
        this.current(job),
      )
      if (!this.current(job)) return
      if (!saved) {
        this.operation(key, {
          signature: entry.configFingerprint,
          stage: 'error',
          error: '数据已恢复或更新，请重新读取后查询。',
        })
        return
      }
      this.publish({ entries: { ...this.state.entries, [key]: entry } })
      this.operation(key)
    } catch (e) {
      if (this.current(job))
        this.operation(key, {
          signature: entry?.configFingerprint ?? configFingerprint(job.request),
          stage: entry ? 'unsaved' : 'error',
          entry,
          error: e instanceof Error ? e.message : '交通查询失败。',
        })
    } finally {
      if (this.jobs.get(key) === job) {
        this.jobs.delete(key)
        if (!this.current(job)) this.operation(key)
      }
    }
  }
}
