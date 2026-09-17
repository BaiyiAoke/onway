import { useState } from 'react'
import {
  ArrowRight,
  Car,
  Footprints,
  Plane,
  TrainFront,
  RefreshCw,
} from 'lucide-react'
import { useRoutes } from '../../services/routes/RoutesContext'
import { useTravel } from '../../services/travel/TravelContext'
import { dayTransport, selectSegment } from '../../services/routes/segmentView'
import {
  daySegments,
  findRecord,
  MODE_LABELS,
  recordForRequest,
} from '../../services/routes/transport'
import { formatDistance, formatDuration } from '../../services/routes/model'
import type { Trip, TripDay } from '../../services/travel/types'
import type { TransportConfig } from '../../services/routes/transportTypes'
import { TransportEditor } from './TransportEditor'
import { MapServiceSettingsButton } from '../places/SearchPanel'
import styles from './Routes.module.css'

export function DayRouteSummary({
  trip,
  day,
  editable = false,
  density = 'default',
}: {
  trip: Trip
  day: TripDay
  editable?: boolean
  density?: 'default' | 'compact'
}) {
  const { state, segments, segmentController, reload } = useRoutes()
  const { saving } = useTravel()
  const value = dayTransport(segments, state, trip, day)
  const busy = value.views.some((v) => v.busy)
  const legacy = value.legacyEntry?.result
  return (
    <section
      className={`${styles.summary} ${density === 'compact' ? styles.summaryCompact : ''}`}
      aria-label="当天交通汇总"
    >
      <div className={styles.summaryTop}>
        <div>
          <p className={styles.caption}>当天交通</p>
          {legacy ? (
            <p className={styles.metrics}>
              <strong>{formatDistance(legacy.distanceMeters)}</strong>
              <span>约 {formatDuration(legacy.durationSeconds)}</span>
            </p>
          ) : value.completed > 0 ? (
            <p className={styles.metrics}>
              <strong>约 {formatDuration(value.durationSeconds)}</strong>
              <span>
                {value.views.some((v) => v.distanceMeters !== undefined)
                  ? '已知距离 ' + formatDistance(value.distanceMeters)
                  : '距离未知'}
              </span>
            </p>
          ) : (
            <p className={styles.hint}>
              {value.legacyStale
                ? '路线待更新 · 地点或顺序已改变。'
                : value.total
                  ? '尚无可汇总的交通结果'
                  : '至少安排两个地点后查询交通。'}
            </p>
          )}
          {legacy ? (
            <p className={styles.hint}>旧版自驾估算 · {legacy.source}</p>
          ) : (
            value.total > 0 && (
              <p className={styles.hint}>
                {value.completed} / {value.total} 段有结果
                {value.completed < value.total ? ' · 部分汇总' : ''}
                {value.views.some((v) => v.needsReview)
                  ? ' · 含待确认路段'
                  : ''}
                {value.unknownDistance ? ' · 含距离未知的交通' : ''}
                {value.views.some((v) => v.expired) ? ' · 含上次估算' : ''}
                {value.views.some((v) => v.unsaved) ? ' · 含未保存结果' : ''}
              </p>
            )
          )}
        </div>
        {editable &&
          value.views.some(
            (v) => !['train', 'flight'].includes(v.request.config.mode),
          ) && (
            <button
              className="secondaryButton"
              disabled={
                saving || busy || !value.total || segments.status !== 'ready'
              }
              onClick={() =>
                void segmentController.calculateDay(trip.id, day.id)
              }
            >
              <RefreshCw size={15} />
              {busy ? '查询中…' : '刷新当天交通'}
            </button>
          )}
      </div>
      {segments.status === 'error' && (
        <div role="alert" className={styles.error}>
          <p>{segments.error}</p>
          <button className="textButton" onClick={() => void reload()}>
            重新读取路线缓存
          </button>
        </div>
      )}
      {value.views.some((v) => v.operation?.error) && (
        <p className="formError" role="alert">
          部分路段查询或保存失败，请打开该段查看详情。
        </p>
      )}
      <details className={styles.details}>
        <summary>详情</summary>
        <p>
          各段独立估算，不含地点停留时间。公共交通耗时已包含接口返回的换乘与步行时间。地点或顺序变化后显示待更新，使用刷新按钮查询。
        </p>
        <p>
          查询会向所选服务发送端点坐标及必要的出发时间、城市编码；个人备注留在本机。
        </p>
        {legacy && (
          <p>
            旧版估算时间：
            {new Date(legacy.calculatedAt).toLocaleString('zh-CN')}
          </p>
        )}
        <MapServiceSettingsButton />
      </details>
    </section>
  )
}
export function RouteLeg({
  tripId,
  day,
  toIndex,
  variant = 'planner',
}: {
  tripId: string
  day: TripDay
  toIndex: number
  variant?: 'planner' | 'compact'
}) {
  const { workspace, run, saving } = useTravel(),
    { segments } = useRoutes()
  const [opened, setOpened] = useState(false)
  const [initialMode, setInitialMode] = useState<TransportConfig['mode']>()
  const trip = workspace?.trips.find((t) => t.id === tripId)
  const request = trip && daySegments(trip, day)[toIndex - 1]
  if (!trip || !request) return null
  const activeTrip = trip
  const segmentRequest = request
  const view = selectSegment(segments, activeTrip, segmentRequest)
  async function quickMode(mode: 'driving' | 'walking') {
    // 已选方式保持可聚焦的选中态；重复点击不保存配置，也不产生新查询。
    if (saving || mode === segmentRequest.config.mode) return
    const existing = findRecord(
      activeTrip,
      segmentRequest.dayId,
      segmentRequest.from.id,
      segmentRequest.to.id,
    )
    const record = structuredClone(
      existing ?? recordForRequest(activeTrip, segmentRequest),
    )
    record.config = {
      ...record.config,
      mode,
      provider: mode === 'driving' ? record.config.provider : 'amap',
      departure: undefined,
      reviewedDate: segmentRequest.date,
    }
    await run({
      type: 'saveTransport',
      tripId: activeTrip.id,
      record,
      expected: JSON.stringify(existing ?? null),
    })
  }
  function openMode(mode: TransportConfig['mode']) {
    if (saving || mode === segmentRequest.config.mode) return
    setInitialMode(mode)
    setOpened(true)
  }
  const Icon =
    segmentRequest.config.mode === 'driving'
      ? Car
      : segmentRequest.config.mode === 'walking'
        ? Footprints
        : segmentRequest.config.mode === 'flight'
          ? Plane
          : TrainFront
  const notices = [
    view.durationSeconds !== undefined ? view.label : '',
    view.busy ? '查询中…' : '',
    view.expired ? '上次估算' : '',
    view.unsaved ? '未保存' : '',
    view.operation?.error ? '操作失败' : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const journey =
    segmentRequest.config.mode === 'train'
      ? view.record?.train
      : segmentRequest.config.mode === 'flight'
        ? view.record?.flight
        : undefined
  const times = journey
    ? journeyTimes(journey.departureAt, journey.arrivalAt)
    : ''
  return (
    <div
      className={`${styles.segment} ${variant === 'compact' ? styles.segmentCompact : ''}`}
    >
      <button
        type="button"
        className={styles.segmentButton}
        onClick={() => {
          setInitialMode(undefined)
          setOpened(true)
        }}
        aria-label={
          '交通：' + segmentRequest.from.name + '到' + segmentRequest.to.name
        }
      >
        <Icon size={16} />
        <span className={styles.segmentContent}>
          <span className={styles.segmentHeadline}>
            <strong>{MODE_LABELS[segmentRequest.config.mode]}</strong>
            <span>
              {view.durationSeconds !== undefined
                ? '约 ' + formatDuration(view.durationSeconds)
                : view.busy
                  ? '查询中…'
                  : view.label}
              {view.distanceMeters !== undefined
                ? ' · ' + formatDistance(view.distanceMeters)
                : ['train', 'flight'].includes(segmentRequest.config.mode) &&
                    view.durationSeconds !== undefined
                  ? ' · 距离未知'
                  : ''}
            </span>
          </span>
          {times && <small>{times}</small>}
          {notices && <small>{notices}</small>}
        </span>
        <ArrowRight size={15} />
      </button>
      {variant === 'planner' && (
        <div className={styles.segmentQuick} aria-label="快速选择交通方式">
          <button
            type="button"
            disabled={saving}
            aria-pressed={segmentRequest.config.mode === 'driving'}
            onClick={() => void quickMode('driving')}
          >
            自驾
          </button>
          <button
            type="button"
            disabled={saving}
            aria-pressed={segmentRequest.config.mode === 'walking'}
            onClick={() => void quickMode('walking')}
          >
            步行
          </button>
          <button
            type="button"
            disabled={saving}
            aria-pressed={segmentRequest.config.mode === 'transit'}
            onClick={() => openMode('transit')}
          >
            公共交通
          </button>
          <button
            type="button"
            disabled={saving}
            aria-pressed={segmentRequest.config.mode === 'train'}
            onClick={() => openMode('train')}
          >
            火车
          </button>
          <button
            type="button"
            disabled={saving}
            aria-pressed={segmentRequest.config.mode === 'flight'}
            onClick={() => openMode('flight')}
          >
            飞机
          </button>
        </div>
      )}
      {opened && (
        <TransportEditor
          key={
            segmentRequest.from.id +
            segmentRequest.to.id +
            ':' +
            (initialMode ?? 'edit')
          }
          trip={activeTrip}
          request={segmentRequest}
          initialMode={initialMode}
          onClose={() => {
            setOpened(false)
            setInitialMode(undefined)
          }}
        />
      )}
    </div>
  )
}

function journeyTimes(departureAt: string, arrivalAt: string) {
  const start = Date.parse(departureAt),
    end = Date.parse(arrivalAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ''
  // 已确认车次和航班沿用北京时间展示；仅呈现已存时刻，不由各段耗时推算班次。
  const departure = new Date(start + 8 * 3600000).toISOString()
  const arrival = new Date(end + 8 * 3600000).toISOString()
  const days = Math.round(
    (Date.parse(arrival.slice(0, 10)) - Date.parse(departure.slice(0, 10))) /
      86400000,
  )
  const suffix =
    days > 0 ? (days === 1 ? '（次日）' : '（' + days + ' 天后）') : ''
  return departure.slice(11, 16) + ' → ' + arrival.slice(11, 16) + suffix
}
