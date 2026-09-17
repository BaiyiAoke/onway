import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EditPanel } from './EditPanel'
import { BackHandlerProvider, useBackRegistry } from './BackHandler'
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
    this.querySelector<HTMLButtonElement>('button')?.focus()
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
function Host({
  dirty = false,
  busy = false,
}: {
  dirty?: boolean
  busy?: boolean
}) {
  const [open, setOpen] = useState(false),
    back = useBackRegistry()
  return (
    <>
      <button onClick={() => setOpen(true)}>打开面板</button>
      {open && (
        <EditPanel
          title="测试交通"
          dirty={dirty}
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <button onClick={() => back.handle()}>模拟系统返回</button>
        </EditPanel>
      )}
    </>
  )
}
function setup(props: { dirty?: boolean; busy?: boolean } = {}) {
  render(
    <BackHandlerProvider>
      <Host {...props} />
    </BackHandlerProvider>,
  )
  const trigger = screen.getByRole('button', { name: '打开面板' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}
describe('面板焦点与返回处理', () => {
  it('Escape 关闭后将焦点还给原触发按钮并恢复页面滚动', () => {
    const overflow = document.body.style.overflow,
      trigger = setup()
    expect(screen.getByRole('button', { name: '关闭编辑面板' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe(overflow)
  })
  it('系统返回先保护草稿，确认放弃后才关闭并还原焦点', () => {
    const trigger = setup({ dirty: true })
    fireEvent.click(screen.getByRole('button', { name: '模拟系统返回' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('放弃未保存的修改？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('保存中拦截 Escape 和系统返回，面板不提前卸载', () => {
    setup({ busy: true })
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    )
    fireEvent.click(screen.getByRole('button', { name: '模拟系统返回' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭编辑面板' })).toBeDisabled()
  })
})
