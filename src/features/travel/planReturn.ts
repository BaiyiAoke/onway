export interface PlanReturn {
  tripId: string
  dayId: string | null
  placeId: string
}

// 仅接收页面自己写入的轻量定位信息，行程内容仍从当前旅行文档读取。
export function readPlanReturn(state: unknown): PlanReturn | null {
  if (!state || typeof state !== 'object' || !('planReturn' in state))
    return null
  const value = state.planReturn
  if (
    !value ||
    typeof value !== 'object' ||
    !('tripId' in value) ||
    !('dayId' in value) ||
    !('placeId' in value)
  )
    return null
  if (
    typeof value.tripId !== 'string' ||
    typeof value.placeId !== 'string' ||
    (value.dayId !== null && typeof value.dayId !== 'string')
  )
    return null
  return { tripId: value.tripId, dayId: value.dayId, placeId: value.placeId }
}
