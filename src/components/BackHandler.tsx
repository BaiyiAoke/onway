import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

export type BackSource = 'system' | 'navigation' | 'history'
type BackAction = (proceed?: () => void, source?: BackSource) => boolean
interface Registry {
  register: (handler: BackAction) => () => void
  handle: (proceed?: () => void, source?: BackSource) => boolean
}
const BackContext = createContext<Registry | null>(null)

export function BackHandlerProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<BackAction[]>([])
  const registry = useMemo<Registry>(
    () => ({
      register(handler) {
        handlers.current.push(handler)
        return () => {
          handlers.current = handlers.current.filter((item) => item !== handler)
        }
      },
      handle(proceed, source = 'system') {
        // 最上层编辑面板先处理返回，避免直接退出应用丢失草稿。
        return [...handlers.current]
          .reverse()
          .some((handler) => handler(proceed, source))
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
export function useOptionalBackRegistry() {
  return useContext(BackContext)
}
export function useBackHandler(handler: BackAction, enabled = true) {
  const registry = useContext(BackContext)
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  }, [handler])
  useEffect(() => {
    if (!enabled || !registry) return
    return registry.register((proceed, source) =>
      latest.current(proceed, source),
    )
  }, [enabled, registry])
}
