import { isObject } from '../routes/model'

export function aborted(): DOMException {
  return new DOMException('请求已取消', 'AbortError')
}
export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(aborted())
    const cancel = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      reject(aborted())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}
type Job = {
  controller: AbortController
  users: number
  promise: Promise<unknown>
  run: () => void
}
// 所有高德 HTTP 服务共用调度；取消一个订阅者不会误取消其他仍需要同一结果的订阅者。
export class AmapQueue {
  private pending: Job[] = []
  private jobs = new Map<string, Job>()
  private active = 0
  private lastStart = -Infinity
  private timer: ReturnType<typeof setTimeout> | undefined
  run<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(aborted())
    let job = this.jobs.get(key)
    if (job?.controller.signal.aborted) job = undefined
    if (!job) {
      let resolve!: (value: unknown) => void, reject!: (reason: unknown) => void
      const promise = new Promise<unknown>((yes, no) => {
        resolve = yes
        reject = no
      })
      const current: Job = {
        controller: new AbortController(),
        users: 0,
        promise,
        run: () => {
          this.active++
          this.lastStart = Date.now()
          void operation(current.controller.signal)
            .then(resolve, reject)
            .finally(() => {
              this.active--
              this.pump()
            })
        },
      }
      job = current
      this.jobs.set(key, current)
      this.pending.push(current)
      void promise
        .finally(() => {
          if (this.jobs.get(key) === current) this.jobs.delete(key)
        })
        .catch(() => {})
    }
    const current = job
    current.users++
    const result = new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (finished) return false
        finished = true
        signal.removeEventListener('abort', cancel)
        current.users--
        if (current.users === 0) current.controller.abort()
        return true
      }
      const cancel = () => {
        if (finish()) reject(aborted())
      }
      signal.addEventListener('abort', cancel, { once: true })
      current.promise.then(
        (value) => {
          if (finish()) resolve(structuredClone(value) as T)
        },
        (error) => {
          if (finish()) reject(error)
        },
      )
    })
    this.pump()
    return result
  }
  private pump() {
    if (this.timer || this.active >= 2 || !this.pending.length) return
    const wait = Math.max(0, 550 - (Date.now() - this.lastStart))
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        this.pump()
      }, wait)
      return
    }
    this.pending.shift()!.run()
    this.pump()
  }
}
export const amapQueue = new AmapQueue()
export function amapError(code: string): Error {
  if (['10003', '10010', '10044', '10045', '40000', '40003'].includes(code))
    return new Error('高德配额已达限制，请查看控制台后重试。（' + code + '）')
  if (
    ['10001', '10005', '10007', '10008', '10009', '10012', '10013'].includes(
      code,
    )
  )
    return new Error(
      '高德 Key 无效、类型或权限不匹配，请检查地图服务设置。（' + code + '）',
    )
  return new Error('高德服务暂时不可用，请稍后重试。（' + code + '）')
}
export async function amapJson(
  url: URL,
  signal: AbortSignal,
  fetcher: typeof fetch = (...args) => fetch(...args),
  queue = amapQueue,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await queue.run(
      url.href + ':' + attempt,
      async (shared) => {
        if (shared.aborted) throw aborted()
        if (typeof navigator !== 'undefined' && !navigator.onLine)
          throw new Error('当前离线，请联网后重试。')
        const controller = new AbortController()
        const cancel = () => controller.abort()
        shared.addEventListener('abort', cancel, { once: true })
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, 20000)
        try {
          const response = await fetcher(url, {
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store',
          })
          if (response.status === 429) return { limited: true, data: {} }
          if (!response.ok) throw new Error('高德连接失败，请稍后重试。')
          const data: unknown = await response.json()
          if (shared.aborted) throw aborted()
          if (!isObject(data)) throw new Error('高德返回了无效数据。')
          if (
            [
              '10004',
              '10014',
              '10015',
              '10019',
              '10020',
              '10021',
              '10029',
            ].includes(String(data.infocode))
          )
            return { limited: true, data }
          if (data.status !== '1')
            throw amapError(String(data.infocode ?? '未知'))
          return { limited: false, data }
        } catch (error) {
          if (shared.aborted) throw aborted()
          if (timedOut)
            throw new Error('高德查询超过 20 秒，请检查网络后重试。', {
              cause: error,
            })
          if (error instanceof TypeError)
            throw new Error('无法连接高德，请检查网络后重试。', {
              cause: error,
            })
          if (error instanceof SyntaxError)
            throw new Error('高德返回了无效数据。', { cause: error })
          throw error
        } finally {
          clearTimeout(timer)
          shared.removeEventListener('abort', cancel)
        }
      },
      signal,
    )
    if (!result.limited) return result.data
    if (attempt === 0) await delay(2000, signal)
  }
  throw new Error('高德调用频率已达限制，请稍后手动重试。')
}
