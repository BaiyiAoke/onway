import { useRef, useState } from 'react'
import { useTravel } from '../../services/travel/TravelContext'
import {
  applyTravelAction,
  placementSnapshot,
} from '../../services/travel/model'
import type {
  PlacementSnapshot,
  TravelAction,
} from '../../services/travel/types'

export interface InsertionTarget {
  dayId: string | null
  beforePlaceId: string | null
}
export function usePlacement(tripId: string) {
  const { workspace, saving, run } = useTravel()
  const pending = useRef(false)
  const [undo, setUndo] = useState<{
    expected: string
    before: string
    adopted: boolean
    placement: PlacementSnapshot
    name: string
  } | null>(null)
  const [message, setMessage] = useState('')
  const fingerprint = JSON.stringify(workspace)
  // 持久化成功后的精确快照是撤销边界；任何后续旅行文档修改都会使令牌失效。
  const available = !!undo && undo.expected === fingerprint
  // 拖拽库可能同步刷新展示，run 成功和 Context 采用新快照不一定同一帧。
  // 等到成功快照被采用后再失效旧令牌，不能把这段过渡误判为后续编辑。
  if (undo && available && !undo.adopted) setUndo({ ...undo, adopted: true })
  else if (undo && !available && (undo.adopted || fingerprint !== undo.before))
    setUndo(null)
  async function move(
    placeId: string,
    target: InsertionTarget,
    expected = fingerprint,
  ) {
    if (!workspace || saving || pending.current) return false
    const trip = workspace.trips.find((t) => t.id === tripId)
    if (!trip) return false
    const action: TravelAction = {
      type: 'relocatePlace',
      tripId,
      placeId,
      ...target,
      expected,
    }
    let after: string
    try {
      after = JSON.stringify(applyTravelAction(workspace, action))
    } catch (reason) {
      setMessage((reason as Error).message)
      return false
    }
    if (after === fingerprint) return true
    pending.current = true
    const snapshot = placementSnapshot(trip)
    const name =
      [...trip.days.flatMap((d) => d.places), ...trip.unscheduledPlaces].find(
        (p) => p.id === placeId,
      )?.name ?? '地点'
    try {
      if (!(await run(action))) {
        setMessage('移动未保存，原顺序已保留。请重试。')
        return false
      }
      setUndo({
        expected: after,
        before: fingerprint,
        adopted: false,
        placement: snapshot,
        name,
      })
      setMessage('已移动：' + name)
      return true
    } finally {
      pending.current = false
    }
  }
  async function undoMove() {
    if (!available || !undo || saving || pending.current) return
    pending.current = true
    try {
      if (
        await run({
          type: 'restorePlacement',
          tripId,
          placement: undo.placement,
          expected: undo.expected,
        })
      ) {
        setMessage('已撤销移动：' + undo.name)
        setUndo(null)
      } else setMessage('撤销未保存，当前顺序已保留。请重试。')
    } finally {
      pending.current = false
    }
  }
  return { move, undoMove, canUndo: available, message, fingerprint }
}
