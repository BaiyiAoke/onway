import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useTravel } from '../travel/TravelContext'
import { RouteController, type RoutesState } from './controller'
import { SegmentController, type SegmentState } from './segmentController'

interface RoutesContextValue {
  segments: SegmentState
  segmentController: SegmentController
  state: RoutesState
  calculate: RouteController['calculate']
  retrySave: RouteController['retrySave']
  reload: RouteController['load']
  cancelPending: RouteController['dispose']
}
const RoutesContext = createContext<RoutesContextValue | null>(null)

export function RoutesProvider({
  children,
  controller: provided,
  segmentController: providedSegments,
}: {
  children: ReactNode
  controller?: RouteController
  segmentController?: SegmentController
}) {
  const [owned] = useState(() => new RouteController())
  const controller = provided ?? owned
  const [ownedSegments] = useState(() => new SegmentController())
  const segmentController = providedSegments ?? ownedSegments
  const { workspace, status, saving, run } = useTravel()
  const segments = useSyncExternalStore(
    segmentController.subscribe,
    segmentController.getSnapshot,
    segmentController.getSnapshot,
  )
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )

  useLayoutEffect(() => {
    controller.updateWorkspace(workspace, status === 'ready', saving)
    segmentController.updateWorkspace(
      workspace,
      status === 'ready',
      saving,
      run,
    )
  }, [controller, segmentController, workspace, status, saving, run])
  useEffect(() => {
    void controller.load()
    void segmentController.load()
    return () => {
      controller.dispose()
      segmentController.dispose()
    }
  }, [controller, segmentController])

  return (
    <RoutesContext.Provider
      value={{
        state,
        segments,
        segmentController,
        calculate: controller.calculate,
        retrySave: controller.retrySave,
        reload: async () => {
          await Promise.all([controller.load(), segmentController.load()])
        },
        cancelPending: () => {
          controller.dispose()
          segmentController.dispose()
        },
      }}
    >
      {children}
    </RoutesContext.Provider>
  )
}

export function useRoutes() {
  const value = useContext(RoutesContext)
  if (!value) throw new Error('路线组件必须位于 RoutesProvider 内。')
  return value
}
