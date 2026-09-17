import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { BackHandlerProvider } from './BackHandler'
import {
  BrowserNavigationGuard,
  GuardedLink,
  GuardedNavLink,
} from './GuardedNavigation'
import { NoteEditor } from '../features/today/NoteEditor'
import { NOTE_KEY, type LocalStore } from '../services/storage/types'
import {
  RESTORE_EPOCH_KEY,
  type AtomicLocalStore,
} from '../services/storage/atomic'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
afterEach(() => vi.restoreAllMocks())

function exampleStore(): LocalStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue('原备注'),
    set: vi.fn().mockResolvedValue(undefined),
  }
}
function show(store: LocalStore, onNavigate = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <BackHandlerProvider>
        <BrowserNavigationGuard />
        <Routes>
          <Route
            path="/today"
            element={
              <>
                <NoteEditor loadStore={async () => store} />
                <GuardedNavLink to="/plan" onNavigate={onNavigate}>
                  主导航计划
                </GuardedNavLink>
                <GuardedLink
                  to="/plan"
                  state={{ day: 'day-2' }}
                  onNavigate={onNavigate}
                >
                  查看完整计划
                </GuardedLink>
                <GuardedLink to="/map?place=p1" onNavigate={onNavigate}>
                  在地图查看地点
                </GuardedLink>
              </>
            }
          />
          <Route path="/plan" element={<h1>计划目的地</h1>} />
          <Route path="/map" element={<h1>地图目的地</h1>} />
        </Routes>
      </BackHandlerProvider>
    </MemoryRouter>,
  )
}

describe('统一导航草稿保护', () => {
  it('切换路由只更新历史索引，不重新注册到 HashRouter 监听器后方', async () => {
    const listen = vi.spyOn(window, 'addEventListener')
    show(exampleStore())
    await screen.findByDisplayValue('原备注')
    fireEvent.click(screen.getByRole('link', { name: '查看完整计划' }))
    expect(screen.getByRole('heading', { name: '计划目的地' })).toBeVisible()
    expect(
      listen.mock.calls.filter(
        ([name, , options]) => name === 'popstate' && options === true,
      ),
    ).toHaveLength(1)
  })

  it.each(['主导航计划', '查看完整计划', '在地图查看地点'])(
    '%s 取消时不改变筛选，放弃后完成原跳转',
    async (name) => {
      const store = exampleStore(),
        onNavigate = vi.fn()
      show(store, onNavigate)
      const input = await screen.findByDisplayValue('原备注')
      fireEvent.change(input, { target: { value: '还没保存的提醒' } })
      fireEvent.click(screen.getByRole('link', { name }))
      expect(onNavigate).not.toHaveBeenCalled()
      expect(
        screen.getByRole('dialog', { name: '个人备注尚未保存' }),
      ).toBeVisible()
      fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
      expect(input).toHaveValue('还没保存的提醒')
      fireEvent.click(screen.getByRole('link', { name }))
      fireEvent.click(screen.getByRole('button', { name: '放弃并继续' }))
      expect(onNavigate).toHaveBeenCalledOnce()
      expect(
        screen.getByRole('heading', {
          name: name.includes('地图') ? '地图目的地' : '计划目的地',
        }),
      ).toBeVisible()
      expect(store.set).not.toHaveBeenCalled()
    },
  )

  it('保存并继续在写入成功后完成原目的地，失败时可重试且不提前跳转', async () => {
    const store = exampleStore(),
      onNavigate = vi.fn()
    vi.mocked(store.set).mockRejectedValueOnce(new Error('disk full'))
    show(store, onNavigate)
    fireEvent.change(await screen.findByDisplayValue('原备注'), {
      target: { value: '保存后去计划' },
    })
    fireEvent.click(screen.getByRole('link', { name: '查看完整计划' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存失败，输入已保留',
    )
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('保存后去计划')
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await screen.findByRole('heading', { name: '计划目的地' })
    expect(onNavigate).toHaveBeenCalledOnce()
    expect(store.set).toHaveBeenLastCalledWith(NOTE_KEY, '保存后去计划')
  })

  it('恢复标识冲突时保留备注并停留，沿用保存时的过期快照校验', async () => {
    const snapshot = {
      [NOTE_KEY]: '原备注',
      [RESTORE_EPOCH_KEY]: 'before-restore',
    }
    const store: AtomicLocalStore = {
      ...exampleStore(),
      readBatch: vi.fn().mockResolvedValue(snapshot),
      writeBatch: vi
        .fn()
        .mockRejectedValue(
          new Error('本地数据已更新，请重新读取后再操作；此次修改未保存。'),
        ),
    }
    const onNavigate = vi.fn()
    show(store, onNavigate)
    fireEvent.change(await screen.findByDisplayValue('原备注'), {
      target: { value: '恢复前草稿' },
    })
    fireEvent.click(screen.getByRole('link', { name: '查看完整计划' }))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('本地数据已更新')
    expect(store.writeBatch).toHaveBeenCalledWith(
      { [NOTE_KEY]: '恢复前草稿' },
      snapshot,
    )
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('恢复前草稿')
  })

  it('浏览器返回先恢复当前位置，取消后可再次返回并确认继续', async () => {
    window.history.replaceState({ idx: 2 }, '', window.location.href)
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const bubbleListener = vi.fn()
    window.addEventListener('popstate', bubbleListener)
    const view = show(exampleStore())
    fireEvent.change(await screen.findByDisplayValue('原备注'), {
      target: { value: '返回前草稿' },
    })
    act(() =>
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { idx: 1 } }),
      ),
    )
    expect(go).toHaveBeenLastCalledWith(1)
    expect(bubbleListener).not.toHaveBeenCalled()
    act(() =>
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { idx: 2 } }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    act(() =>
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { idx: 1 } }),
      ),
    )
    expect(screen.getByRole('dialog')).toBeVisible()
    act(() =>
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { idx: 2 } }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '放弃并继续' }))
    expect(go).toHaveBeenLastCalledWith(-1)
    act(() =>
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { idx: 1 } }),
      ),
    )
    await waitFor(() => expect(bubbleListener).toHaveBeenCalledOnce())
    view.unmount()
    window.removeEventListener('popstate', bubbleListener)
    window.history.replaceState(null, '', window.location.href)
  })
})
