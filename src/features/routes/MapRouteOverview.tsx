import { useRoutes } from '../../services/routes/RoutesContext'
import { selectDayRoute } from '../../services/routes/view'
import { ROUTE_COLORS } from '../../services/routes/model'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel } from '../../services/travel/model'
import { DayRouteSummary } from './DayRouteSummary'
import styles from './Routes.module.css'

export function MapRouteOverview() {
  const { activeTrip: trip, group, setGroup } = useTravel()
  const { state } = useRoutes()
  if (!trip || group === 'unscheduled') return null
  const selected = trip.days.find((day) => day.id === group)
  if (selected) return <DayRouteSummary trip={trip} day={selected} editable />
  return (
    <div className={styles.overview} aria-label="每日路线图例">
      <div className={styles.legend}>
        {trip.days.map((day, index) => {
          const view = selectDayRoute(state, trip.id, day)
          return (
            <button
              key={day.id}
              className="textButton"
              onClick={() => setGroup(day.id)}
            >
              <span
                className={styles.swatch}
                style={{
                  background: ROUTE_COLORS[index % ROUTE_COLORS.length],
                  opacity: view.entry ? 1 : 0.25,
                }}
              />
              {formatDayLabel(trip, index)} ·{' '}
              {view.entry
                ? view.unsaved
                  ? '未保存'
                  : '已计算'
                : view.busy
                  ? '计算中'
                  : view.stale
                    ? '待更新'
                    : '未计算'}
            </button>
          )
        })}
      </div>
    </div>
  )
}
