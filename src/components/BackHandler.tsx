import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

interface Registry {
  register: (handler: () => boolean) => () => void
  handle: () => boolean
}
const BackContext = createContext<Registry | null>(null)

export function BackHandlerProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<(() => boolean)[]>([])
  const registry = useMemo<Registry>(
    () => ({
      register(handler) {
        handlers.current.push(handler)
        return () => {
          handlers.current = handlers.current.filter((item) => item !== handler)
        }
      },
      handle() {
        // 最上层编辑面板先处理返回，避免直接退出应用丢失草稿。
        return [...handlers.current].reverse().some((handler) => handler())
      },
    }),
    [],
  )
  return (
    <BackContext.Provider value={registry}>{children}</BackContext.Provider>
  )
}
export function useBackRegistry() {
  const value = useContext(BackContext)
  if (!value) throw new Error('返回操作缺少 Provider')
  return value
}
export function useBackHandler(handler: () => boolean, enabled = true) {
  const registry = useContext(BackContext)
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  }, [handler])
  useEffect(() => {
    if (!enabled || !registry) return
    return registry.register(() => latest.current())
  }, [enabled, registry])
}
