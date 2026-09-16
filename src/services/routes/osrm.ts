import type { RouteResult, RouteService, Wgs84Point } from './types'
import {
  isMetric,
  isObject,
  isPoint,
  isRouteResult,
  ROUTE_SOURCE,
} from './model'

export const OSRM_ENDPOINT =
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
const TIMEOUT_MS = 20_000
const INTERVAL_MS = 1_000

function abortError() {
  return new DOMException('路线请求已取消', 'AbortError')
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function parseOsrmResponse(
  body: unknown,
  pointCount: number,
): RouteResult {
  if (!isObject(body))
    throw new Error('路线服务返回了无法识别的数据，请稍后重试。')
  if (body.code === 'NoSegment')
    throw new Error('有地点在 1 公里内找不到可驾车道路，请重新选点。')
  if (body.code === 'NoRoute')
    throw new Error('这些地点之间没有连通的驾车路线，请检查位置或重新选点。')
  if (body.code === 'TooBig')
    throw new Error('本次地点数量超出路线服务限制，请分到更多天后再计算。')
  if (
    body.code !== 'Ok' ||
    !Array.isArray(body.routes) ||
    !isObject(body.routes[0])
  )
    throw new Error('路线服务暂时无法计算，请检查地点后重试。')
  if (
    !Array.isArray(body.waypoints) ||
    body.waypoints.length !== pointCount ||
    !body.waypoints.every(
      (point) =>
        isObject(point) && isMetric(point.distance) && point.distance <= 1000,
    )
  )
    throw new Error('地点与可驾车道路相距过远或道路匹配异常，请重新选点。')
  const route = body.routes[0]
  if (!Array.isArray(route.legs) || route.legs.length !== pointCount - 1)
    throw new Error('路线分段不完整，请稍后重新计算。')
  const result = {
    geometry: route.geometry,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    legs: route.legs.map((leg: unknown, index: number) => ({
      fromIndex: index,
      toIndex: index + 1,
      distanceMeters: isObject(leg) ? leg.distance : undefined,
      durationSeconds: isObject(leg) ? leg.duration : undefined,
    })),
    source: ROUTE_SOURCE,
    calculatedAt: new Date().toISOString(),
  }
  if (!isRouteResult(result))
    throw new Error('路线数据不完整，请稍后重新计算。')
  return result
}

export class OsrmRouteService implements RouteService {
  private queue: Promise<unknown> = Promise.resolve()
  private lastStarted = -Infinity

  constructor(
    private readonly request: typeof fetch = (...args) => fetch(...args),
  ) {}

  calculateDrivingRoute(
    waypoints: readonly Wgs84Point[],
    signal?: AbortSignal,
  ): Promise<RouteResult> {
    // 排队时复制输入，后续编辑不能改变已提交请求的途经点顺序。
    const points = waypoints.map((point) => ({ ...point }))
    const result = this.queue.then(async () => {
      if (points.length < 2 || !points.every(isPoint))
        throw new Error('请至少安排两个有效的 WGS84 地点后再计算。')
      if (signal?.aborted) throw abortError()
      await pause(
        Math.max(0, INTERVAL_MS - (Date.now() - this.lastStarted)),
        signal,
      )
      if (signal?.aborted) throw abortError()
      this.lastStarted = Date.now()
      return this.calculate(points, signal)
    })
    // 公共服务请求逐个执行；失败后仍可手动重试，不自动重试。
    this.queue = result.catch(() => undefined)
    return result
  }

  private async calculate(
    points: readonly Wgs84Point[],
    signal?: AbortSignal,
  ): Promise<RouteResult> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, TIMEOUT_MS)
    try {
      const coordinates = points
        .map((point) => point.longitude + ',' + point.latitude)
        .join(';')
      const query = new URLSearchParams({
        alternatives: 'false',
        steps: 'false',
        geometries: 'geojson',
        overview: 'full',
        radiuses: points.map(() => '1000').join(';'),
      })
      const response = await this.request(
        OSRM_ENDPOINT + coordinates + '?' + query,
        {
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
        },
      )
      if (response.status === 429)
        throw new Error('路线服务请求较多，请稍后手动重试。')
      if (!response.ok && response.status !== 400)
        throw new Error(
          '路线服务暂时不可用（' + response.status + '），请稍后重试。',
        )
      const body: unknown = await response.json()
      if (controller.signal.aborted) throw abortError()
      return parseOsrmResponse(body, points.length)
    } catch (error) {
      if (timedOut)
        throw new Error('路线计算超过 20 秒，请检查网络后重试。', {
          cause: error,
        })
      if (signal?.aborted) throw abortError()
      if (error instanceof TypeError)
        throw new Error('无法连接路线服务，请检查网络后重试。', {
          cause: error,
        })
      if (error instanceof SyntaxError)
        throw new Error('路线服务返回了无法识别的数据，请稍后重试。', {
          cause: error,
        })
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}

// 全应用共用一个队列，今天、地图和计划页不会各自创建并行请求。
export const routeService = new OsrmRouteService()
