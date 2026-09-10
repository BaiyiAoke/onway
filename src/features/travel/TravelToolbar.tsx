import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel } from '../../services/travel/model'
import styles from './Travel.module.css'

export function TravelToolbar({ showGroups = true }: { showGroups?: boolean }) {
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
    <div className={styles.toolbar}>
      <div className={styles.selectorRow}>
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
        <span className={styles.saveState} role="status">
          {saving ? '正在保存…' : '仅保存在当前设备'}
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
        <div className={styles.groups} role="group" aria-label="地点筛选">
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
              aria-pressed={group === day.id}
              onClick={() => setGroup(day.id)}
            >
              {formatDayLabel(activeTrip, index)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
