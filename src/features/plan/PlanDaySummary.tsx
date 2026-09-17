import { useRoutes } from '../../services/routes/RoutesContext'
import { dayTransport } from '../../services/routes/segmentView'
import { formatDuration } from '../../services/routes/model'
import type { Trip, TripDay } from '../../services/travel/types'
import styles from './Plan.module.css'

/** 折叠只隐藏清单，仍保留全天已有结果与需要处理的路段。 */
export function PlanDaySummary({ trip, day }: { trip: Trip; day: TripDay }) {
  const { segments, state } = useRoutes()
  const total = dayTransport(segments, state, trip, day)
  const legacy = total.legacyEntry?.result
  const review = total.views.filter((v) => v.needsReview).length
  const failed = total.views.filter((v) => v.operation?.error).length
  return (
    <p className={styles.dayPreview}>
      <span>{day.places.length} 个地点</span>
      {legacy ? (
        <span>旧版自驾约 {formatDuration(legacy.durationSeconds)}</span>
      ) : (
        total.completed > 0 && (
          <span>
            {total.completed < total.total ? '已知交通约 ' : '交通约 '}
            {formatDuration(total.durationSeconds)}
          </span>
        )
      )}
      {!legacy && total.total > 0 && (
        <span>
          {total.completed} / {total.total} 段有结果
        </span>
      )}
      {review > 0 && <span>{review} 段待确认</span>}
      {failed > 0 && <span>{failed} 段查询失败</span>}
      {total.unknownDistance && <span>含距离未知记录</span>}
      {total.views.some((v) => v.expired) && <span>含上次估算</span>}
      {total.views.some((v) => v.unsaved) && <span>含未保存结果</span>}
    </p>
  )
}
