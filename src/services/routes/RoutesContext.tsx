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

interface RoutesContextValue {
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
}: {
  children: ReactNode
  controller?: RouteController
}) {
  const [owned] = useState(() => new RouteController())
  const controller = provided ?? owned
  const { workspace, status, saving } = useTravel()
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )

  useLayoutEffect(() => {
    controller.updateWorkspace(workspace, status === 'ready', saving)
  }, [controller, workspace, status, saving])
  useEffect(() => {
    void controller.load()
    return () => controller.dispose()
  }, [controller])

  return (
    <RoutesContext.Provider
      value={{
        state,
        calculate: controller.calculate,
        retrySave: controller.retrySave,
        reload: controller.load,
        cancelPending: controller.dispose,
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
