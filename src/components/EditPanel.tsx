import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { useBackHandler } from './BackHandler'
import styles from './EditPanel.module.css'

export function EditPanel({
  title,
  children,
  onClose,
  dirty = false,
  busy = false,
}: {
  title: string
  children: ReactNode | ((requestClose: () => boolean) => ReactNode)
  onClose: () => void
  dirty?: boolean
  busy?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [discard, setDiscard] = useState(false)
  function requestClose() {
    if (busy) return true
    if (discard) setDiscard(false)
    else if (dirty) setDiscard(true)
    else onClose()
    return true
  }
  useBackHandler(requestClose)
  useLayoutEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => {
      element?.close()
      document.body.style.overflow = oldOverflow
      // React 移除 dialog 后原生焦点恢复不稳定，在卸载前显式返回触发控件。
      const activeDialog = document.querySelector('dialog[open]')
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        (!activeDialog || activeDialog.contains(trigger))
      ) {
        trigger.focus({ preventScroll: true })
      }
    }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <dialog
      ref={dialog}
      className={styles.panel}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="关闭编辑面板"
          disabled={busy}
          onClick={requestClose}
        >
          <X size={20} />
        </button>
      </header>
      {discard ? (
        <div className={styles.discard} role="alert">
          <h3>放弃未保存的修改？</h3>
          <p>这些修改还没有保存，关闭后不会保留。</p>
          <div className={styles.actions}>
            <button
              className="secondaryButton"
              onClick={() => setDiscard(false)}
            >
              继续编辑
            </button>
            <button className="dangerButton" onClick={onClose}>
              放弃修改
            </button>
          </div>
        </div>
      ) : typeof children === 'function' ? (
        children(requestClose)
      ) : (
        children
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  title,
  message,
  onClose,
  onConfirm,
  failure,
}: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => Promise<boolean>
  failure?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function confirm() {
    setBusy(true)
    setError(false)
    try {
      if (await onConfirm()) onClose()
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <EditPanel title={title} onClose={onClose} busy={busy}>
      <p className="muted">{message}</p>
      {error &&
        (failure ?? (
          <p className="formError" role="alert">
            操作未保存，请重试。原数据仍然保留。
          </p>
        ))}
      <div className={styles.actions}>
        <button className="secondaryButton" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          className="dangerButton"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? '处理中…' : '确认删除'}
        </button>
      </div>
    </EditPanel>
  )
}
