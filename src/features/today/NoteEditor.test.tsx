import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NoteEditor } from './NoteEditor'
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
