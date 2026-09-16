import { ArrowRight, ArrowUpRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel, getTodayDayIndex } from '../../services/travel/model'
import { TravelToolbar } from '../travel/TravelToolbar'
import { NoteEditor } from './NoteEditor'
import styles from './Today.module.css'
import { DayRouteSummary, RouteAttribution } from '../routes/DayRouteSummary'
import { AmapButton } from '../routes/AmapButton'

export function TodayPage() {
  const { activeTrip, status, setGroup } = useTravel()
  const todayIndex = activeTrip ? getTodayDayIndex(activeTrip) : null
  const scheduledCount =
    activeTrip?.days.reduce((total, day) => total + day.places.length, 0) ?? 0
  // 日期未确定或不在行程期间时，仅预览首日，避免把未来安排显示成今天。
  const displayedDay = activeTrip?.days[todayIndex ?? 0]
  const dayHeading = activeTrip
    ? todayIndex === null
      ? '第 1 天预览'
      : `今天 · ${formatDayLabel(activeTrip, todayIndex)}`
    : '行程安排'

  return (
    <div className="page">
      <div className="pageHeading">
        <div>
          <h1>今天</h1>
        </div>
        <span className="tag">个人旅行 · 仅当前设备</span>
      </div>
      <TravelToolbar showGroups={false} />
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.heroTag}>
            {activeTrip
              ? todayIndex === null
                ? '行程预览'
                : '当前行程'
              : '未创建行程'}
          </span>
          <h2>{activeTrip?.name ?? '尚未创建行程'}</h2>
          <p>
            {activeTrip
              ? activeTrip.startDate
                ? `${activeTrip.startDate} 出发 · 共 ${activeTrip.days.length} 天`
                : `出发日期未定 · 共 ${activeTrip.days.length} 天`
              : '先创建行程，再把地点放进每一天。'}
          </p>
          <Link
            to={activeTrip ? '/map' : '/plan'}
            className={styles.heroLink}
            onClick={() => setGroup('all')}
          >
            {activeTrip ? '打开旅行地图' : '开始规划行程'}{' '}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className={styles.landscape} aria-hidden="true">
          <div className={styles.sun} />
          <div className={styles.ridgeBack} />
          <div className={styles.ridgeFront} />
          <div className={styles.road} />
        </div>
      </section>
      {activeTrip && (
        <dl className={styles.tripStats} aria-label="行程概览">
          <div>
            <dt>行程天数</dt>
            <dd>
              {activeTrip.days.length}
              <span>天</span>
            </dd>
          </div>
          <div>
            <dt>已安排地点</dt>
            <dd>
              {scheduledCount}
              <span>个</span>
            </dd>
          </div>
          <div>
            <dt>未安排地点</dt>
            <dd>
              {activeTrip.unscheduledPlaces.length}
              <span>个</span>
            </dd>
          </div>
        </dl>
      )}
      <div className={styles.grid}>
        <section className="card" aria-labelledby="today-places-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="today-places-title">{dayHeading}</h2>
            </div>
            <MapPin size={20} className="muted" />
          </div>
          {activeTrip && todayIndex === null && (
            <p className={styles.previewHint}>
              {activeTrip.startDate
                ? '今天不在这段行程期间，以下是首日安排。'
                : '出发日期还未确定，以下是首日安排。'}
            </p>
          )}
          {activeTrip && displayedDay && (
            <DayRouteSummary trip={activeTrip} day={displayedDay} />
          )}
          {displayedDay && displayedDay.places.length > 0 ? (
            <ol className={styles.placeList}>
              {displayedDay.places.map((place, index) => (
                <li key={place.id}>
                  <Link
                    to={`/map?place=${encodeURIComponent(place.id)}`}
                    className={styles.placeLink}
                    onClick={() => setGroup('all')}
                    aria-label={`在地图查看${place.name}`}
                  >
                    <span className={styles.number}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3>{place.name}</h3>
                      <p>{place.note || '在地图上查看这个地点'}</p>
                    </div>
                    <ArrowUpRight size={17} className="muted" />
                  </Link>
                  <AmapButton place={place} />
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyHint}>
              {activeTrip
                ? '这一天还没有安排地点。去地图点选，或在计划里分配已有地点。'
                : status === 'ready'
                  ? '还没有行程。在计划页创建一段自己的旅行，随时调整。'
                  : '行程加载状态请查看上方提示；个人备注仍可独立使用。'}
            </p>
          )}
          <Link className={styles.textLink} to="/plan">
            {activeTrip ? '查看完整计划' : '前往计划页创建行程'}{' '}
            <ArrowRight size={16} />
          </Link>
        </section>
        <NoteEditor />
      </div>
      {activeTrip && displayedDay && <RouteAttribution />}
    </div>
  )
}
