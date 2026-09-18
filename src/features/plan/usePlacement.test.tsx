import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { travelFixture } from '../../test/transportFixtures'
import { applyTravelAction } from '../../services/travel/model'
import type { TravelAction, TravelWorkspace } from '../../services/travel/types'
import { usePlacement } from './usePlacement'
const state = vi.hoisted(() => ({
  workspace: null as TravelWorkspace | null,
  run: vi.fn<(action: TravelAction) => Promise<boolean>>(),
}))
vi.mock('../../services/travel/TravelContext', () => ({
  useTravel: () => ({ ...state, saving: false }),
}))
beforeEach(() => {
  state.workspace = travelFixture()
  state.run.mockReset()
})
describe('移动撤销的采用时序', () => {
  it('拖拽同步渲染先于 Context 更新时，成功令牌等待正确快照；其它编辑后不复活', async () => {
    const before = state.workspace!,
      action: TravelAction = {
        type: 'relocatePlace',
        tripId: 'trip',
        placeId: 'a',
        dayId: 'other',
        beforePlaceId: null,
        expected: JSON.stringify(before),
      },
      after = applyTravelAction(before, action)
    state.run.mockResolvedValue(true)
    const hook = renderHook(() => usePlacement('trip'))
    await act(async () => {
      await hook.result.current.move('a', {
        dayId: 'other',
        beforePlaceId: null,
      })
    })
    expect(hook.result.current.canUndo).toBe(false)
    state.workspace = after
    hook.rerender()
    expect(hook.result.current.canUndo).toBe(true)
    state.workspace = structuredClone(after)
    hook.rerender()
    expect(hook.result.current.canUndo).toBe(true)
    state.workspace = applyTravelAction(after, {
      type: 'addDay',
      tripId: 'trip',
    })
    hook.rerender()
    expect(hook.result.current.canUndo).toBe(false)
    state.workspace = after
    hook.rerender()
    expect(hook.result.current.canUndo).toBe(false)
  })
  it('原位移动不保存；失败移动保留旧顺序和可重试入口', async () => {
    state.run.mockResolvedValue(false)
    const hook = renderHook(() => usePlacement('trip'))
    await act(async () => {
      await hook.result.current.move('a', { dayId: 'day', beforePlaceId: 'b' })
    })
    expect(state.run).not.toHaveBeenCalled()
    await act(async () => {
      await hook.result.current.move('a', {
        dayId: 'other',
        beforePlaceId: null,
      })
    })
    expect(hook.result.current.canUndo).toBe(false)
    expect(hook.result.current.message).toContain('原顺序已保留')
    expect(state.workspace!.trips[0].days[0].places.map((p) => p.id)).toEqual([
      'a',
      'b',
    ])
  })
  it('卸载结束撤销会话', async () => {
    state.run.mockImplementation(async (action) => {
      state.workspace = applyTravelAction(state.workspace!, action)
      return true
    })
    const hook = renderHook(() => usePlacement('trip'))
    await act(async () => {
      await hook.result.current.move('a', {
        dayId: 'other',
        beforePlaceId: null,
      })
    })
    hook.rerender()
    expect(hook.result.current.canUndo).toBe(true)
    hook.unmount()
    const next = renderHook(() => usePlacement('trip'))
    expect(next.result.current.canUndo).toBe(false)
  })
})
