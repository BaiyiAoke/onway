import { Car, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRoutes } from '../../services/routes/RoutesContext'
import { formatDistance, formatDuration } from '../../services/routes/model'
import { selectDayRoute } from '../../services/routes/view'
import { formatDayLabel } from '../../services/travel/model'
import { useTravel } from '../../services/travel/TravelContext'
import type { Trip, TripDay } from '../../services/travel/types'
import styles from './Routes.module.css'

export function RouteAttribution() {
  return (
    <p className={styles.attribution}>
      路线由{' '}
      <a href="https://project-osrm.org/" target="_blank" rel="noreferrer">
        OSRM
      </a>{' '}
      /{' '}
      <a
        href="https://routing.openstreetmap.de/about.html"
        target="_blank"
        rel="noreferrer"
      >
        FOSSGIS
      </a>{' '}
      提供， 数据 ©{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        OpenStreetMap 贡献者
      </a>{' '}
      ·{' '}
      <a
        href="https://www.openstreetmap.org/fixthemap"
        target="_blank"
        rel="noreferrer"
      >
        地图纠错
      </a>
    </p>
  )
}

export function DayRouteSummary({
  trip,
  day,
  editable = false,
}: {
  trip: Trip
  day: TripDay
  editable?: boolean
}) {
  const { state, calculate, retrySave, reload } = useRoutes()
  const { saving, setGroup } = useTravel()
  const view = selectDayRoute(state, trip.id, day)
  const result = view.entry?.result
  const enough = day.places.length >= 2
  const label = formatDayLabel(
    trip,
    trip.days.findIndex((item) => item.id === day.id),
  )
  return (
    <section className={styles.summary} aria-label={label + '自驾路线'}>
      <div className={styles.summaryTop}>
        <div>
          <p className={styles.caption}>
            <Car size={16} /> 自驾路线
          </p>
          {result ? (
            <p className={styles.metrics}>
              <strong>{formatDistance(result.distanceMeters)}</strong>
              <span>约 {formatDuration(result.durationSeconds)}</span>
            </p>
          ) : (
            <p className={styles.hint}>
              {!enough
                ? '至少安排两个地点后计算路线。'
                : view.stale
                  ? '路线待更新 · 地点或顺序已改变。'
                  : '尚未计算这一天的路线。'}
            </p>
          )}
        </div>
        {editable ? (
          <button
            className="secondaryButton"
            disabled={
              !enough || saving || view.busy || state.status !== 'ready'
            }
            onClick={() => void calculate(trip.id, day.id)}
          >
            <RefreshCw size={15} />
            {view.operation?.stage === 'calculating'
              ? '计算中…'
              : view.operation?.stage === 'saving'
                ? '保存路线中…'
                : view.entry || view.stale
                  ? '重新计算'
                  : '计算自驾路线'}
          </button>
        ) : !result && enough ? (
          <Link
            to="/plan"
            className="textButton"
            onClick={() => setGroup(day.id)}
          >
            前往计划页计算
          </Link>
        ) : null}
      </div>
      {state.status === 'loading' && (
        <p className={styles.hint} role="status">
          正在读取路线缓存…
        </p>
      )}
      {state.status === 'error' && (
        <div role="alert" className={styles.error}>
          <p>{state.error} 行程与个人备注仍可使用。</p>
          <button className="textButton" onClick={() => void reload()}>
            重新读取路线缓存
          </button>
        </div>
      )}
      {view.operation?.error && (
        <div role="alert" className={styles.error}>
          <p>
            {view.operation.stage === 'unsaved'
              ? '路线已计算，但本地缓存保存失败：'
              : '路线计算失败：'}
            {view.operation.error}
          </p>
          {view.operation.stage === 'unsaved' && (
            <button
              className="textButton"
              disabled={saving || view.busy}
              onClick={() => void retrySave(trip.id, day.id)}
            >
              重试保存路线
            </button>
          )}
        </div>
      )}
      {result && (
        <>
          <p className={styles.hint}>
            {view.unsaved
              ? '尚未保存到本机'
              : view.operation?.stage === 'error'
                ? '显示上次保存的估算'
                : '已保存在本机'}
            {' · '}
            {new Date(result.calculatedAt).toLocaleString('zh-CN', {
              hour12: false,
            })}
          </p>
          <p className={styles.hint}>驾驶估算，不含停留时间和实时路况。</p>
          <RouteAttribution />
        </>
      )}
      {editable && enough && (
        <p className={styles.disclosure}>
          点击计算会将当天地点坐标发送给 FOSSGIS 路线服务；名称和备注留在本机。
        </p>
      )}
    </section>
  )
}

export function RouteLeg({
  tripId,
  day,
  toIndex,
}: {
  tripId: string
  day: TripDay
  toIndex: number
}) {
  const { state } = useRoutes()
  const view = selectDayRoute(state, tripId, day)
  const leg = view.entry?.result.legs[toIndex - 1]
  if (!leg || !day.places[toIndex - 1]) return null
  return (
    <p className={styles.leg}>
      <Car size={13} /> 从 {day.places[toIndex - 1].name} ·{' '}
      {formatDistance(leg.distanceMeters)} · 约{' '}
      {formatDuration(leg.durationSeconds)}
      {view.unsaved ? '（未保存）' : ''}
    </p>
  )
}
