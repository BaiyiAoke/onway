import { useState } from 'react'

/** 仅记住当前浏览器会话的展示状态，不进入旅行文档或备份。 */
export function useSessionView<T>(
  key: string,
  fallback: T,
  accepts: (value: unknown) => value is T,
) {
  const read = (target: string): T => {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(target) ?? 'null')
      return accepts(raw) ? raw : fallback
    } catch {
      return fallback
    }
  }
  const [state, setState] = useState(() => ({ key, value: read(key) }))
  if (state.key !== key) setState({ key, value: read(key) })
  const value = state.key === key ? state.value : read(key)
  function update(next: T) {
    setState({ key, value: next })
    try {
      sessionStorage.setItem(key, JSON.stringify(next))
    } catch {
      // 展示偏好保存失败时仍可继续查看与编辑行程。
    }
  }
  return [value, update] as const
}
