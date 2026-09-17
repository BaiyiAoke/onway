import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { NoteEditor } from './NoteEditor'
import {
  BackHandlerProvider,
  useBackRegistry,
} from '../../components/BackHandler'
import { NOTE_KEY, type LocalStore } from '../../services/storage/types'

describe('备注错误恢复', () => {
  it('写入失败保留输入，重试成功才显示已保存', async () => {
    const store: LocalStore = {
      initialize: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue('原备注'),
      set: vi
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined),
    }
    render(<NoteEditor loadStore={async () => store} />)
    const input = await screen.findByDisplayValue('原备注')
    expect(screen.getByRole('textbox', { name: '个人备注' })).toBe(input)
    fireEvent.change(input, { target: { value: '修改后的备注' } })
    fireEvent.click(screen.getByRole('button', { name: '保存备注' }))
    await screen.findByText('保存失败，输入已保留，请重试。')
    expect(input).toHaveValue('修改后的备注')
    fireEvent.click(screen.getByRole('button', { name: '保存备注' }))
    await screen.findByText('已保存到当前设备')
    expect(store.set).toHaveBeenLastCalledWith(NOTE_KEY, '修改后的备注')
  })

  it('初始化失败时禁用编辑，重试成功后读取原数据', async () => {
    const loadStore = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({
        initialize: async () => {},
        get: async () => '恢复的备注',
        set: async () => {},
      })
    render(<NoteEditor loadStore={loadStore} />)
    await screen.findByText('本地数据读取失败，请重试。')
    expect(screen.getByRole('textbox')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox')).toHaveValue('恢复的备注'),
    )
    expect(screen.getByRole('textbox')).toBeEnabled()
  })
})

beforeAll(() => {
  // jsdom 只补充模态窗可见状态，交互仍使用真实返回注册表与编辑面板。
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function LeaveControls({ onLeave }: { onLeave: () => void }) {
  const registry = useBackRegistry()
  const attempt = () => {
    if (!registry.handle()) onLeave()
  }
  return (
    <>
      <button onClick={attempt}>系统返回</button>
      <button onClick={attempt}>切换计划</button>
    </>
  )
}

describe('个人备注未保存保护', () => {
  it('返回和主导航先询问，继续编辑保留草稿，放弃才恢复最近保存文本', async () => {
    const store: LocalStore = {
      initialize: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue('最近保存的备注'),
      set: vi.fn().mockResolvedValue(undefined),
    }
    const onLeave = vi.fn()
    render(
      <BackHandlerProvider>
        <NoteEditor loadStore={async () => store} />
        <LeaveControls onLeave={onLeave} />
      </BackHandlerProvider>,
    )
    const input = await screen.findByDisplayValue('最近保存的备注')
    fireEvent.change(input, { target: { value: '还没有保存的提醒' } })
    fireEvent.click(screen.getByRole('button', { name: '系统返回' }))
    expect(
      screen.getByRole('dialog', { name: '个人备注尚未保存' }),
    ).toBeInTheDocument()
    expect(onLeave).not.toHaveBeenCalled()
    expect(input).toHaveValue('还没有保存的提醒')
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(input).toHaveValue('还没有保存的提醒')

    fireEvent.click(screen.getByRole('button', { name: '切换计划' }))
    expect(
      screen.getByRole('dialog', { name: '个人备注尚未保存' }),
    ).toBeInTheDocument()
    expect(onLeave).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '放弃并继续' }))
    expect(input).toHaveValue('最近保存的备注')
    expect(store.set).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '切换计划' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('保存进行中拦截返回，保存成功后允许退出', async () => {
    let finishSave: () => void = () => {}
    const store: LocalStore = {
      initialize: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue('原备注'),
      set: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve
          }),
      ),
    }
    const onLeave = vi.fn()
    render(
      <BackHandlerProvider>
        <NoteEditor loadStore={async () => store} />
        <LeaveControls onLeave={onLeave} />
      </BackHandlerProvider>,
    )
    const input = await screen.findByDisplayValue('原备注')
    fireEvent.change(input, { target: { value: '更新并保存的备注' } })
    fireEvent.click(screen.getByRole('button', { name: '保存备注' }))
    fireEvent.click(screen.getByRole('button', { name: '系统返回' }))
    expect(onLeave).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    finishSave()
    await screen.findByText('已保存到当前设备')
    fireEvent.click(screen.getByRole('button', { name: '系统返回' }))
    expect(onLeave).toHaveBeenCalledOnce()
    expect(store.set).toHaveBeenCalledWith(NOTE_KEY, '更新并保存的备注')
  })
})
