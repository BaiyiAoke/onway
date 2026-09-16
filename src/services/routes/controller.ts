import type { TravelWorkspace, TripDay } from '../travel/types'
import {
  matchesRoute,
  routeFingerprint,
  routeKey,
  type CachedRoute,
} from './model'
import { RouteCacheRepository } from './repository'
import { routeService } from './osrm'
import type { RouteService } from './types'

export interface RouteOperation {
  fingerprint: string
  stage: 'calculating' | 'saving' | 'error' | 'unsaved'
  entry?: CachedRoute
  error?: string
}
export interface RoutesState {
  status: 'loading' | 'ready' | 'error'
  entries: Record<string, CachedRoute>
  operations: Record<string, RouteOperation>
  error: string | null
}
type Job = {
  fingerprint: string
  controller: AbortController
  tripId: string
  dayId: string
}
type CacheSource = Pick<RouteCacheRepository, 'load' | 'save'>

export class RouteController {
  private state: RoutesState = {
    status: 'loading',
    entries: {},
    operations: {},
    error: null,
  }
  private listeners = new Set<() => void>()
  private workspace: TravelWorkspace | null = null
  private travelReady = false
  private travelSaving = false
  private jobs = new Map<string, Job>()
  private loadId = 0

  constructor(
    private readonly repository: CacheSource = new RouteCacheRepository(),
    private readonly service: RouteService = routeService,
  ) {}

  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private publish(next: Partial<RoutesState>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((listener) => listener())
  }
  private operation(key: string, value?: RouteOperation) {
    const operations = { ...this.state.operations }
    if (value) operations[key] = value
    else delete operations[key]
    this.publish({ operations })
  }

  load = async () => {
    const id = ++this.loadId
    this.publish({ status: 'loading', error: null })
    try {
      const cache = await this.repository.load()
      if (id === this.loadId)
        this.publish({
          entries: Object.fromEntries(
            cache.entries.map((entry) => [
              routeKey(entry.tripId, entry.dayId),
              entry,
            ]),
          ),
          status: 'ready',
          error: null,
        })
    } catch (error) {
      if (id === this.loadId)
        this.publish({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : '路线缓存读取失败，请重试。',
        })
    }
  }

  private day(tripId: string, dayId: string): TripDay | undefined {
    return this.workspace?.trips
      .find((trip) => trip.id === tripId)
      ?.days.find((day) => day.id === dayId)
  }

  private current(job: Job): boolean {
    const day = this.day(job.tripId, job.dayId)
    return (
      !job.controller.signal.aborted &&
      this.travelReady &&
      this.workspace?.activeTripId === job.tripId &&
      !!day &&
      day.places.length >= 2 &&
      routeFingerprint(day) === job.fingerprint
    )
  }

  updateWorkspace(
    workspace: TravelWorkspace | null,
    ready: boolean,
    saving = false,
  ) {
    this.workspace = workspace
    this.travelReady = ready
    this.travelSaving = saving
    // 切换行程或改变计算输入立即取消；晚到的响应不得进入当前结果。
    for (const [key, job] of this.jobs) {
      if (!this.current(job)) {
        job.controller.abort()
        this.jobs.delete(key)
        this.operation(key)
      }
    }
  }

  dispose = () => {
    ++this.loadId
    for (const job of this.jobs.values()) job.controller.abort()
    this.jobs.clear()
    this.publish({ operations: {} })
  }

  calculate = async (tripId: string, dayId: string) => this.start(tripId, dayId)

  retrySave = async (tripId: string, dayId: string) => {
    const operation = this.state.operations[routeKey(tripId, dayId)]
    if (operation?.stage === 'unsaved' && operation.entry)
      await this.start(tripId, dayId, operation.entry)
  }

  private async start(tripId: string, dayId: string, previous?: CachedRoute) {
    const day = this.day(tripId, dayId)
    const key = routeKey(tripId, dayId)
    if (
      this.state.status !== 'ready' ||
      !this.travelReady ||
      this.travelSaving ||
      this.workspace?.activeTripId !== tripId ||
      !day ||
      day.places.length < 2 ||
      this.jobs.has(key)
    )
      return
    if (previous && !matchesRoute(previous, day)) return
    const job: Job = {
      fingerprint: routeFingerprint(day),
      controller: new AbortController(),
      tripId,
      dayId,
    }
    this.jobs.set(key, job)
    let entry = previous
    this.operation(key, {
      fingerprint: job.fingerprint,
      stage: previous ? 'saving' : 'calculating',
      entry,
    })
    try {
      if (!entry) {
        const result = await this.service.calculateDrivingRoute(
          day.places.map((place) => ({ ...place.coordinates })),
          job.controller.signal,
        )
        entry = { tripId, dayId, fingerprint: job.fingerprint, result }
      }
      if (!this.current(job)) return
      this.operation(key, {
        fingerprint: job.fingerprint,
        stage: 'saving',
        entry,
      })
      const dayKeys = this.workspace!.trips.flatMap((trip) =>
        trip.days.map((item) => routeKey(trip.id, item.id)),
      )
      const saved = await this.repository.save(entry, dayKeys, () =>
        this.current(job),
      )
      if (!saved || !this.current(job)) return
      this.publish({ entries: { ...this.state.entries, [key]: entry } })
      this.operation(key)
    } catch (error) {
      if (!this.current(job)) return
      this.operation(key, {
        fingerprint: job.fingerprint,
        stage: entry ? 'unsaved' : 'error',
        entry,
        error:
          error instanceof Error ? error.message : '路线处理失败，请重试。',
      })
    } finally {
      if (this.jobs.get(key) === job) {
        this.jobs.delete(key)
        if (!this.current(job)) this.operation(key)
      }
    }
  }
}
