import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useBackHandler } from './BackHandler'
import styles from './ActionMenu.module.css'

export function ActionMenu({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useBackHandler(() => {
    setOpen(false)
    return true
  }, open)
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  return (
    <div className={styles.root} ref={root}>
      <button
        type="button"
        className="textButton"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={14} />
        更多
      </button>
      {/* 菜单项各自带确认弹窗和结果提示，点击后不自动收起 */}
      {open && <div className={styles.menu}>{children}</div>}
    </div>
  )
}
