import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useDragDropManager,
  useDragOperation,
  type DragDropEventHandlers,
} from '@dnd-kit/react'
import { Accessibility, PointerActivationConstraints } from '@dnd-kit/dom'
import { GripVertical, Plus } from 'lucide-react'
import { useBackHandler } from '../../components/BackHandler'
import type { TripPlace } from '../../services/travel/types'
import type { InsertionTarget } from './usePlacement'
import styles from './Plan.module.css'

const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
        : [new PointerActivationConstraints.Distance({ value: 8 })],
  }),
  KeyboardSensor,
]
function DragCancel({
  fingerprint,
  initial,
}: {
  fingerprint: string
  initial: React.RefObject<string>
}) {
  const manager = useDragDropManager()
  const { source } = useDragOperation()
  useBackHandler(() => {
    manager?.actions.stop({ canceled: true })
    return true
  }, !!source)
  useEffect(() => {
    if (
      source &&
      manager?.dragOperation.status.dragging &&
      fingerprint !== initial.current
    )
      manager?.actions.stop({ canceled: true })
  }, [source, fingerprint, initial, manager])
  return null
}
function destination(
  value: unknown,
): (InsertionTarget & { label: string; heading?: boolean }) | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  return (typeof data.dayId === 'string' || data.dayId === null) &&
    (typeof data.beforePlaceId === 'string' || data.beforePlaceId === null) &&
    typeof data.label === 'string'
    ? {
        dayId: data.dayId,
        beforePlaceId: data.beforePlaceId,
        label: data.label,
        heading: data.heading === true,
      }
    : null
}
export function PlanDrag({
  children,
  fingerprint,
  onMove,
  onHoverDay,
  onFinish,
}: {
  children: ReactNode
  fingerprint: string
  onMove: (
    placeId: string,
    target: InsertionTarget,
    expected: string,
  ) => Promise<boolean>
  onHoverDay: (dayId: string) => void
  onFinish: (target?: InsertionTarget) => void
}) {
  const initial = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [announcement, setAnnouncement] = useState('')
  const clear = () => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  const onDragStart: DragDropEventHandlers['onDragStart'] = ({ operation }) => {
    initial.current = fingerprint
    setAnnouncement(
      '正在移动：' +
        String(operation.source?.data.name ?? '') +
        '。方向键选择位置，空格放下，Esc 取消。',
    )
  }
  const onDragMove: DragDropEventHandlers['onDragMove'] = (event, manager) => {
    if (!(event.nativeEvent instanceof KeyboardEvent)) return
    const key = event.nativeEvent.key
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key))
      return
    event.preventDefault()
    // 键盘按插入位置前进，不要求用户按固定像素猜测目的地。
    const slots = [
      ...document.querySelectorAll<HTMLElement>('[data-plan-drop]'),
    ].filter((e) => e.getClientRects().length > 0)
    const active = String(
      event.operation.target?.id ?? 'before:' + event.operation.source?.id,
    )
    const current = slots.findIndex((e) => e.dataset.planDrop === active)
    const delta = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
    const next = slots[Math.max(0, Math.min(slots.length - 1, current + delta))]
    if (next) {
      void manager.actions.setDropTarget(next.dataset.planDrop)
      next.scrollIntoView?.({ block: 'nearest' })
    }
  }
  return (
    <DragDropProvider
      sensors={sensors}
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== Accessibility),
        Accessibility.configure({
          screenReaderInstructions: {
            draggable:
              '按空格或回车抓起地点，方向键选择插入位置，再按空格放下；Esc 取消。',
          },
          announcements: {
            dragstart: () => '',
            dragmove: () => '',
            dragover: () => '',
            dragend: () => '',
          },
        }),
      ]}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={({ operation }) => {
        clear()
        const target = destination(operation.target?.data)
        if (target) {
          setAnnouncement('放置位置：' + target.label)
          if (target.heading)
            timer.current = setTimeout(
              () => onHoverDay(target.dayId ?? 'unscheduled'),
              600,
            )
        }
      }}
      onDragEnd={(event) => {
        clear()
        const target = destination(event.operation.target?.data)
        const placeId = event.operation.source?.id
        if (event.canceled || !target || typeof placeId !== 'string') {
          onFinish()
          setAnnouncement('已取消移动')
          return
        }
        void onMove(placeId, target, initial.current).then((ok) => {
          onFinish(ok ? target : undefined)
          setAnnouncement(
            ok ? '已放置到：' + target.label : '移动未保存，原顺序已保留。',
          )
        })
      }}
    >
      <DragCancel fingerprint={fingerprint} initial={initial} />
      <span className="srOnly" role="status" aria-live="polite">
        {announcement}
      </span>
      {children}
      <DragOverlay dropAnimation={null}>
        {(source) => (
          <div className={styles.dragPreview}>
            <GripVertical size={16} />
            {String(source.data.name)}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  )
}
export function DraggablePlace({
  place,
  disabled,
  children,
}: {
  place: TripPlace
  disabled: boolean
  children: ReactNode
}) {
  const { ref, handleRef, isDragSource } = useDraggable({
    id: place.id,
    data: { name: place.name },
    disabled,
  })
  return (
    <div
      ref={ref}
      className={styles.placeRow + (isDragSource ? ' ' + styles.dragging : '')}
    >
      <button
        ref={handleRef}
        className={styles.dragHandle}
        disabled={disabled}
        aria-label={'拖动' + place.name}
        title="拖动调整顺序；键盘空格开始，方向键选择位置"
      >
        <GripVertical size={17} />
      </button>
      {children}
    </div>
  )
}
export function DropSlot({
  id,
  target,
  label,
  disabled,
  onAdd,
  onActivate,
  children,
}: {
  id: string
  target: InsertionTarget
  label: string
  disabled: boolean
  onAdd?: () => void
  onActivate?: () => void
  children?: ReactNode
}) {
  const { source } = useDragOperation()
  const { ref, isDropTarget } = useDroppable({
    id,
    data: { ...target, label, heading: !!children },
    disabled,
    accept: () => true,
  })
  return (
    <div
      ref={ref}
      data-plan-drop={disabled ? undefined : id}
      data-selectable={onActivate ? true : undefined}
      onClick={(event) => {
        // 整块摘要可选日，内部按钮保持自己的动作；拖动期间不把落点误当点击。
        const target = event.target
        if (
          !onActivate ||
          source ||
          event.defaultPrevented ||
          !(target instanceof Element)
        )
          return
        if (
          target.closest(
            'button, a, input, select, textarea, summary, [role="button"]',
          )
        )
          return
        onActivate()
      }}
      className={
        (children ? styles.dayDrop : styles.dropSlot) +
        (source ? ' ' + styles.dragActive : '') +
        (isDropTarget ? ' ' + styles.dropTarget : '')
      }
    >
      {children ?? (
        <button
          className={styles.insertButton}
          disabled={disabled}
          aria-label={label + '添加地点'}
          onClick={onAdd}
        >
          <Plus size={13} />
          <span>{isDropTarget ? '放在这里' : '在这里添加'}</span>
        </button>
      )}
      {isDropTarget && <span className={styles.dropLabel}>{label}</span>}
    </div>
  )
}
