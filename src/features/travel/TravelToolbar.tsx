import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel } from '../../services/travel/model'
import styles from './Travel.module.css'

export function TravelToolbar({
  showGroups = true,
  compact = false,
  heading,
  actions,
}: {
  showGroups?: boolean
  compact?: boolean
  heading?: ReactNode
  actions?: ReactNode
}) {
  const {
    workspace,
    activeTrip,
    status,
    saving,
    error,
    group,
    setGroup,
    run,
    reload,
  } = useTravel()
  const dayIndex = activeTrip?.days.findIndex((day) => day.id === group) ?? -1
  const groups = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = groups.current
    const selected = strip?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    )
    if (!strip || !selected) return
    function ensureVisible() {
      if (!strip || !selected) return
      // 只横移日期条；屏幕缩窄和重新读取后也保持选中日期可见，不卷动页面。
      const bounds = strip.getBoundingClientRect()
      const item = selected.getBoundingClientRect()
      const offset =
        item.left < bounds.left || item.width > bounds.width
          ? item.left - bounds.left - 8
          : item.right > bounds.right
            ? item.right - bounds.right + 8
            : 0
      if (offset)
        strip.scrollTo?.({ left: Math.max(0, strip.scrollLeft + offset) })
    }
    ensureVisible()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(ensureVisible)
    observer.observe(strip)
    observer.observe(selected)
    return () => observer.disconnect()
  }, [
    group,
    activeTrip?.id,
    activeTrip?.days.length,
    activeTrip?.startDate,
    status,
    showGroups,
  ])
  if (status === 'loading')
    return (
      <div className={styles.status} role="status">
        正在读取我的行程…
      </div>
    )
  if (status === 'error')
    return (
      <div className={styles.status} role="alert">
        <p>{error || '行程读取失败，原数据已保留。'}</p>
        <button className="secondaryButton" onClick={() => void reload()}>
          重新读取行程
        </button>
      </div>
    )
  return (
    <div className={`${styles.toolbar} ${compact ? styles.compact : ''}`}>
      <div className={styles.selectorRow}>
        {heading && <div className={styles.toolbarHeading}>{heading}</div>}
        <label className={styles.selector}>
          当前行程
          <select
            value={activeTrip?.id ?? ''}
            disabled={saving || !workspace?.trips.length}
            onChange={(event) =>
              void run({ type: 'selectTrip', tripId: event.target.value })
            }
          >
            {!workspace?.trips.length && <option value="">还没有行程</option>}
            {workspace?.trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.name}
              </option>
            ))}
          </select>
        </label>
        {actions && <div className={styles.toolbarActions}>{actions}</div>}
        <span className={styles.saveState} role="status">
          {saving ? '正在保存…' : ''}
        </span>
      </div>
      {error && (
        <div className="formError" role="alert">
          {error}
          <button
            className="textButton"
            disabled={saving}
            onClick={() => void reload()}
          >
            重新读取
          </button>
        </div>
      )}
      {showGroups && activeTrip && (
        <div className={styles.dateBar}>
          <div
            ref={groups}
            className={styles.groups}
            role="group"
            aria-label="地点筛选"
          >
            <button
              aria-pressed={group === 'all'}
              onClick={() => setGroup('all')}
            >
              全部
            </button>
            <button
              aria-pressed={group === 'unscheduled'}
              onClick={() => setGroup('unscheduled')}
            >
              未安排 · {activeTrip.unscheduledPlaces.length}
            </button>
            {activeTrip.days.map((day, index) => (
              <button
                key={day.id}
                className={styles.mobileDay}
                aria-pressed={group === day.id}
                onClick={() => setGroup(day.id)}
              >
                {formatDayLabel(activeTrip, index)}
              </button>
            ))}
          </div>
          <div className={styles.dateNavigation} aria-label="按天查看">
            <button
              className="iconButton"
              aria-label="上一天"
              disabled={dayIndex <= 0}
              onClick={() => setGroup(activeTrip.days[dayIndex - 1].id)}
            >
              <ChevronLeft size={18} />
            </button>
            <label>
              <span className="srOnly">选择日期</span>
              <select
                value={dayIndex >= 0 ? group : ''}
                onChange={(event) => setGroup(event.target.value)}
              >
                <option value="" disabled>
                  选择一天
                </option>
                {activeTrip.days.map((day, index) => (
                  <option key={day.id} value={day.id}>
                    {formatDayLabel(activeTrip, index)} · {day.places.length}{' '}
                    个地点
                  </option>
                ))}
              </select>
            </label>
            <button
              className="iconButton"
              aria-label="下一天"
              disabled={dayIndex < 0 || dayIndex === activeTrip.days.length - 1}
              onClick={() => setGroup(activeTrip.days[dayIndex + 1].id)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
