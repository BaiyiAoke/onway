import { useRef, useState } from 'react'
import { Search, Library, MapPin, Plus } from 'lucide-react'
import { useTravel } from '../../services/travel/TravelContext'
import {
  formatDayLabel,
  samePlace,
  getGroupPlaces,
} from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import type { SearchPlace } from '../../services/search/nominatim'
import { SearchPanel } from '../places/SearchPanel'
import { LibraryPicker } from '../places/LibraryPicker'
import {
  PlaceEditor,
  newPlaceDraft,
  type PlaceDraft,
} from '../travel/PlaceEditor'
import type { InsertionTarget } from './usePlacement'
import styles from './Plan.module.css'

/** 添加目标独立于地图和左侧当前选择；连续添加始终插在同一个后继地点之前。 */
export function PlanAddPanel({
  trip,
  target,
  onTarget,
  onClose,
  onPickMap,
}: {
  trip: Trip
  target: InsertionTarget
  onTarget: (target: InsertionTarget) => void
  onClose: () => void
  onPickMap: () => void
}) {
  const { saving, run, error } = useTravel()
  const [tab, setTab] = useState<'search' | 'library'>('search')
  const [duplicate, setDuplicate] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<PlaceDraft | null>(null)
  const pending = useRef(false)
  const dayIndex = trip.days.findIndex((d) => d.id === target.dayId)
  const destination = getGroupPlaces(trip, target.dayId ?? 'unscheduled')
  const anchor = destination.find((p) => p.id === target.beforePlaceId)
  const valid =
    (target.dayId === null || dayIndex >= 0) &&
    (target.beforePlaceId === null || !!anchor)
  function existing(place: SearchPlace) {
    const source = { ...place, id: 'candidate' }
    const labels = trip.days.flatMap((d, i) =>
      d.places.some((p) => samePlace(p, source))
        ? ['第 ' + (i + 1) + ' 天']
        : [],
    )
    if (trip.unscheduledPlaces.some((p) => samePlace(p, source)))
      labels.push('未安排')
    return labels.length ? '已加入' + labels.join('、') : ''
  }
  async function add(source: SearchPlace) {
    if (saving || pending.current || !valid || (existing(source) && !duplicate))
      return
    pending.current = true
    setFailed(false)
    try {
      const place: TripPlace = { ...source, id: crypto.randomUUID() }
      const ok = await run({
        type: 'savePlace',
        tripId: trip.id,
        place,
        ...target,
        preventDuplicate: !duplicate,
      })
      setFailed(!ok)
      setMessage(
        ok
          ? '已添加：' + source.name
          : '添加失败，结果和目标位置已保留，可重试。',
      )
    } finally {
      pending.current = false
    }
  }
  return (
    <div className={styles.addPanel}>
      <div className={styles.target}>
        <label>
          添加到
          <select
            aria-label="添加目标日期"
            value={target.dayId ?? 'unscheduled'}
            disabled={saving}
            onChange={(e) =>
              onTarget({
                dayId: e.target.value === 'unscheduled' ? null : e.target.value,
                beforePlaceId: null,
              })
            }
          >
            {trip.days.map((d, i) => (
              <option key={d.id} value={d.id}>
                {formatDayLabel(trip, i)}
              </option>
            ))}
            <option value="unscheduled">未安排</option>
          </select>
        </label>
        <p>
          {!valid
            ? '目标位置已改变，请重新选择日期或插入位置。'
            : anchor
              ? '插入到「' + anchor.name + '」之前'
              : '追加到当天末尾'}
          <small>按选择顺序连续添加</small>
        </p>
      </div>
      <div className={styles.actions} aria-label="添加地点来源">
        <button
          className="secondaryButton"
          aria-pressed={tab === 'search'}
          onClick={() => setTab('search')}
        >
          <Search size={15} />
          搜索新地点
        </button>
        <button
          className="secondaryButton"
          aria-pressed={tab === 'library'}
          onClick={() => setTab('library')}
        >
          <Library size={15} />
          地点库
        </button>
        <button
          className="textButton"
          disabled={saving || !valid}
          onClick={() => setEditing(newPlaceDraft(target.dayId))}
        >
          <Plus size={15} />
          输入坐标
        </button>
        <button
          className="textButton"
          disabled={saving || !valid}
          onClick={onPickMap}
        >
          <MapPin size={15} />
          地图选点
        </button>
      </div>
      <div hidden={tab !== 'search'}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={duplicate}
            onChange={(e) => setDuplicate(e.target.checked)}
            disabled={saving}
          />
          允许重复添加同一地点
        </label>
        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={failed ? 'formError' : 'muted'}
          >
            {failed ? (error ?? message) : message}
          </p>
        )}
        <SearchPanel
          inline
          onSelect={(p) =>
            setEditing({ ...p, id: crypto.randomUUID(), dayId: target.dayId })
          }
          renderActions={(p) => (
            <>
              {existing(p) && <small>{existing(p)}</small>}
              <button
                className="primaryButton"
                disabled={saving || !valid || (!!existing(p) && !duplicate)}
                onClick={() => void add(p)}
              >
                {existing(p) ? (duplicate ? '再次加入' : '已加入') : '加入'}
              </button>
              <button
                className="textButton"
                disabled={saving || !valid}
                onClick={() =>
                  setEditing({
                    ...p,
                    id: crypto.randomUUID(),
                    dayId: target.dayId,
                  })
                }
              >
                编辑后加入
              </button>
            </>
          )}
        />
      </div>
      <div hidden={tab !== 'library'}>
        <LibraryPicker
          inline
          trip={trip}
          dayId={target.dayId}
          beforePlaceId={target.beforePlaceId}
          onClose={onClose}
        />
      </div>
      {editing && (
        <PlaceEditor
          key={editing.id}
          trip={trip}
          draft={editing}
          beforePlaceId={target.beforePlaceId}
          preventDuplicate={!duplicate}
          onClose={() => setEditing(null)}
          onSaved={() => setMessage('已添加：' + editing.name)}
        />
      )}
    </div>
  )
}
