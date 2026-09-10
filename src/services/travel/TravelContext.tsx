import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { TravelRepository } from './repository'
import type { PlaceGroup, TravelAction, TravelWorkspace, Trip } from './types'

interface TravelContextValue {
  workspace: TravelWorkspace | null
  activeTrip: Trip | null
  status: 'loading' | 'ready' | 'error'
  saving: boolean
  error: string | null
  group: PlaceGroup
  setGroup: (group: PlaceGroup) => void
  reload: (options?: { preserveTripId?: string }) => Promise<void>
  run: (action: TravelAction) => Promise<boolean>
}

const TravelContext = createContext<TravelContextValue | null>(null)
type RepositorySource = Pick<TravelRepository, 'load' | 'run'>

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback}${error.message}` : fallback
}

export function TravelProvider({
  children,
  repository,
}: {
  children: ReactNode
  repository?: RepositorySource
}) {
  const [defaultRepository] = useState(() => new TravelRepository())
  const source = repository ?? defaultRepository
  const [workspace, setWorkspace] = useState<TravelWorkspace | null>(null)
  const [status, setStatus] = useState<TravelContextValue['status']>('loading')
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{
    tripId: string | null
    group: PlaceGroup
  }>({ tripId: null, group: 'all' })
  const activeTrip =
    workspace?.trips.find((trip) => trip.id === workspace.activeTripId) ?? null
  const group =
    selection.tripId === activeTrip?.id &&
    (selection.group === 'all' ||
      selection.group === 'unscheduled' ||
      activeTrip.days.some((day) => day.id === selection.group))
      ? selection.group
      : 'all'

  const adopt = useCallback((next: TravelWorkspace) => {
    setWorkspace(next)
    const selectedTrip = next.trips.find(
      (trip) => trip.id === next.activeTripId,
    )
    setSelection((previous) => {
      const validGroup =
        previous.group === 'all' ||
        previous.group === 'unscheduled' ||
        selectedTrip?.days.some((day) => day.id === previous.group)
      return previous.tripId === next.activeTripId && validGroup
        ? previous
        : { tripId: next.activeTripId, group: 'all' }
    })
    setStatus('ready')
    setError(null)
  }, [])

  useEffect(() => {
    let active = true
    source
      .load()
      .then((next) => {
        if (active) adopt(next)
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(describeError(reason, '读取失败。'))
          setStatus('error')
        }
      })
    return () => {
      active = false
    }
  }, [source, adopt])

  const reload = useCallback(
    async (options?: { preserveTripId?: string }) => {
      setStatus('loading')
      try {
        let next = await source.load()
        const tripId = options?.preserveTripId
        // 编辑中刷新时保留当前行程；同步仓库选中项，后续保存不会跳到其他行程。
        if (tripId) {
          if (!next.trips.some((trip) => trip.id === tripId))
            throw new Error(
              '此行程已在其他页面删除。当前输入仍保留，请关闭面板后重新读取行程。',
            )
          if (next.activeTripId !== tripId)
            next = await source.run({ type: 'selectTrip', tripId })
        }
        adopt(next)
      } catch (reason) {
        setError(describeError(reason, '读取失败。'))
        setStatus('error')
      }
    },
    [source, adopt],
  )

  const run = useCallback(
    async (action: TravelAction): Promise<boolean> => {
      if (status !== 'ready') return false
      setPending((count) => count + 1)
      setError(null)
      try {
        adopt(await source.run(action))
        return true
      } catch (reason) {
        setError(describeError(reason, '保存失败，输入已保留。'))
        return false
      } finally {
        setPending((count) => count - 1)
      }
    },
    [source, adopt, status],
  )

  const setGroup = useCallback(
    (next: PlaceGroup) => {
      setSelection({ tripId: workspace?.activeTripId ?? null, group: next })
    },
    [workspace?.activeTripId],
  )

  const value = useMemo(
    () => ({
      workspace,
      activeTrip,
      status,
      saving: pending > 0,
      error,
      group,
      setGroup,
      reload,
      run,
    }),
    [
      workspace,
      activeTrip,
      status,
      pending,
      error,
      group,
      setGroup,
      reload,
      run,
    ],
  )
  return (
    <TravelContext.Provider value={value}>{children}</TravelContext.Provider>
  )
}

export function useTravel(): TravelContextValue {
  const value = useContext(TravelContext)
  if (!value) throw new Error('旅行页面必须位于 TravelProvider 内。')
  return value
}
