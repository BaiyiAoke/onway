import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TravelProvider, useTravel } from './TravelContext'
import { TravelRepository } from './repository'
import type { LocalStore } from '../storage/types'

function Screen() {
  const travel = useTravel()
  return (
    <>
      <span data-testid="name">{travel.activeTrip?.name ?? '空行程'}</span>
      <span data-testid="status">{travel.status}</span>
      <span data-testid="group">{travel.group}</span>
      <span role="status">
        {travel.error ?? (travel.saving ? '保存中' : '')}
      </span>
      <button
        onClick={() =>
          void travel.run({
            type: 'createTrip',
            name: '我的旅行',
            startDate: null,
            dayCount: 2,
          })
        }
      >
        创建
      </button>
      <button onClick={() => travel.setGroup(travel.activeTrip!.days[0].id)}>
        选择第一天
      </button>
      <button
        onClick={() =>
          void travel.run({
            type: 'deleteDay',
            tripId: travel.activeTrip!.id,
            dayId: travel.activeTrip!.days[0].id,
          })
        }
      >
        删除第一天
      </button>
      <button onClick={() => void travel.reload()}>重新读取</button>
    </>
  )
}

describe('旅行页面共享状态', () => {
  it('写入成功才发布新行程，保存失败保留已保存状态并允许重试，删掉选中天后返回全部', async () => {
    const values = new Map<string, string>()
    let finish: (() => void) | undefined
    const store: LocalStore = {
      initialize: vi.fn(async () => undefined),
      get: vi.fn(async (key) => values.get(key) ?? null),
      set: vi.fn(async (key, value) => {
        values.set(key, value)
      }),
    }
    vi.mocked(store.set).mockImplementationOnce(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = () => {
            reject(new Error('存储空间不足'))
            resolve()
          }
        }),
    )
    render(
      <TravelProvider repository={new TravelRepository(store)}>
        <Screen />
      </TravelProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    )
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('保存中'),
    )
    expect(screen.getByTestId('name')).toHaveTextContent('空行程')
    await act(async () => {
      finish!()
    })
    expect(screen.getByRole('status')).toHaveTextContent('保存失败')
    expect(screen.getByTestId('name')).toHaveTextContent('空行程')
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() =>
      expect(screen.getByTestId('name')).toHaveTextContent('我的旅行'),
    )
    fireEvent.click(screen.getByRole('button', { name: '选择第一天' }))
    expect(screen.getByTestId('group')).not.toHaveTextContent('all')
    fireEvent.click(screen.getByRole('button', { name: '删除第一天' }))
    await waitFor(() =>
      expect(screen.getByTestId('group')).toHaveTextContent('all'),
    )
  })

  it('读取异常显示错误，重试后恢复空工作区，不自动写入任何旅行', async () => {
    const store: LocalStore = {
      initialize: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      set: vi.fn(),
    }
    vi.mocked(store.get).mockRejectedValueOnce(new Error('读取失败'))
    render(
      <TravelProvider repository={new TravelRepository(store)}>
        <Screen />
      </TravelProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('ready'),
    )
    expect(store.set).not.toHaveBeenCalled()
  })
})
