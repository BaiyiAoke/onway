import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePageScroll } from './usePageScroll'

let frames: Map<number, FrameRequestCallback>
let nextFrame = 0
function flushFrame() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  })
}
function Shell() {
  const navigate = useNavigate(),
    location = useLocation()
  usePageScroll()
  return (
    <>
      <p>{location.pathname}</p>
      <button
        onClick={() => {
          window.scrollTo(0, 0)
          void navigate('/short')
        }}
      >
        短页面
      </button>
      <button onClick={() => void navigate('/places')}>地点</button>
      <button onClick={() => void navigate('/today')}>总览</button>
      <button
        onClick={() =>
          void navigate('/plan', {
            state: { planReturn: { tripId: 't', dayId: 'd', placeId: 'p' } },
          })
        }
      >
        返回计划地点
      </button>
    </>
  )
}
beforeEach(() => {
  frames = new Map()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrame
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(
    3000,
  )
  vi.stubGlobal('innerHeight', 900)
  vi.stubGlobal('scrollY', 0)
  vi.stubGlobal(
    'scrollTo',
    vi.fn((_x: number, y: number) => vi.stubGlobal('scrollY', y)),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('普通页面往返恢复各自滚动位置，明确地点来源优先交给计划页', () => {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <Shell />
    </MemoryRouter>,
  )
  flushFrame()
  act(() => {
    window.scrollTo(0, 700)
    fireEvent.scroll(window)
  })
  fireEvent.click(screen.getByRole('button', { name: '地点' }))
  flushFrame()
  expect(window.scrollY).toBe(0)
  act(() => {
    window.scrollTo(0, 300)
    fireEvent.scroll(window)
  })
  fireEvent.click(screen.getByRole('button', { name: '总览' }))
  flushFrame()
  expect(window.scrollY).toBe(700)
  fireEvent.click(screen.getByRole('button', { name: '地点' }))
  flushFrame()
  expect(window.scrollY).toBe(300)
  vi.mocked(window.scrollTo).mockClear()
  fireEvent.click(screen.getByRole('button', { name: '返回计划地点' }))
  flushFrame()
  expect(window.scrollTo).not.toHaveBeenCalled()
})

it('用户主动滚动后取消待执行的自动恢复', () => {
  render(
    <MemoryRouter>
      <Shell />
    </MemoryRouter>,
  )
  act(() => {
    window.scrollTo(0, 120)
    fireEvent.wheel(window)
  })
  flushFrame()
  expect(window.scrollY).toBe(120)
})

it('新页面先压低 scrollY 时仍保留导航前的位置', () => {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <Shell />
    </MemoryRouter>,
  )
  flushFrame()
  act(() => {
    window.scrollTo(0, 600)
    fireEvent.scroll(window)
  })
  fireEvent.click(screen.getByRole('button', { name: '短页面' }))
  flushFrame()
  expect(window.scrollY).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: '总览' }))
  flushFrame()
  expect(window.scrollY).toBe(600)
})
