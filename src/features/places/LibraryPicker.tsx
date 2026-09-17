import { useRef, useState } from 'react'
import { EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import {
  formatDayLabel,
  getGroupPlaces,
  samePlace,
} from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import forms from '../travel/Travel.module.css'
import styles from './LibraryPicker.module.css'

interface LibraryPickerProps {
  trip: Trip
  dayId: string | null
  afterPlaceId?: string
  onClose: () => void
}

export function LibraryPicker(props: LibraryPickerProps) {
  return (
    <LibraryPickerSession
      key={JSON.stringify([props.trip.id, props.dayId, props.afterPlaceId])}
      {...props}
    />
  )
}

function LibraryPickerSession({
  trip,
  dayId,
  afterPlaceId,
  onClose,
}: LibraryPickerProps) {
  const { workspace, run, saving, error } = useTravel()
  const [query, setQuery] = useState('')
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState<'local' | 'save' | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [copying, setCopying] = useState(false)
  const copyingNow = useRef(false)
  const [lastAdded, setLastAdded] = useState<{
    sourceId: string
    previousIds: string[]
  } | null>(null)
  const currentTrip =
    workspace?.trips.find((item) => item.id === trip.id) ?? trip
  const library = workspace?.libraryPlaces ?? []
  const busy = saving || copying
  const matched = library.filter((place) => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return true
    return (
      place.name.toLowerCase().includes(keyword) ||
      (place.address ?? '').toLowerCase().includes(keyword) ||
      place.note.toLowerCase().includes(keyword)
    )
  })
  const dayIndex = currentTrip.days.findIndex((day) => day.id === dayId)
  const label = dayId
    ? dayIndex >= 0
      ? formatDayLabel(currentTrip, dayIndex)
      : '所选日期已不存在'
    : '未安排'
  const matchesCopy = (item: TripPlace, source: TripPlace) =>
    item.libraryPlaceId === source.id || samePlace(item, source)
  function addedTo(place: TripPlace) {
    const labels = currentTrip.days.flatMap((day, index) =>
      day.places.some((item) => matchesCopy(item, place))
        ? ['第 ' + (index + 1) + ' 天']
        : [],
    )
    if (currentTrip.unscheduledPlaces.some((item) => matchesCopy(item, place)))
      labels.push('未安排')
    return labels.length ? '已加入' + labels.join('、') : ''
  }
  async function copy(place: TripPlace) {
    if (busy || copyingNow.current) return
    if (addedTo(place) && !allowDuplicate) return
    const destination = getGroupPlaces(currentTrip, dayId ?? 'unscheduled')
    // run 仅返回成功标记；从最新快照辨认新副本，连续加入才会依次插在上一项后面。
    const cursor = lastAdded
      ? destination.find(
          (item) =>
            item.libraryPlaceId === lastAdded.sourceId &&
            !lastAdded.previousIds.includes(item.id),
        )?.id
      : afterPlaceId
    if (
      afterPlaceId !== undefined &&
      (!cursor || !destination.some((item) => item.id === cursor))
    ) {
      setFailed('local')
      setMessage('插入位置已改变，请关闭面板后重新选择要在哪个地点后添加。')
      return
    }
    copyingNow.current = true
    setCopying(true)
    setFailed(null)
    const previousIds = getGroupPlaces(currentTrip, 'all').map(
      (item) => item.id,
    )
    try {
      const ok = await run({
        type: 'copyToTrip',
        placeId: place.id,
        tripId: trip.id,
        dayId,
        afterPlaceId: afterPlaceId === undefined ? undefined : cursor,
        allowDuplicate,
      })
      if (ok) {
        if (afterPlaceId !== undefined)
          setLastAdded({ sourceId: place.id, previousIds })
        setAddedCount((count) => count + 1)
        setMessage('已添加：' + place.name)
      } else {
        setFailed('save')
        setMessage('添加失败，请重试。')
      }
    } finally {
      copyingNow.current = false
      setCopying(false)
    }
  }
  return (
    <EditPanel title="从地点库添加" onClose={onClose} busy={busy}>
      <div className={forms.form}>
        <p className="muted">
          添加到：{label}
          {afterPlaceId !== undefined && ' · 按选择顺序插入'}
        </p>
        <label>
          搜索地点库
          <input
            autoFocus
            value={query}
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="地点名称、地址或备注"
          />
        </label>
        <label className={styles.inlineCheck}>
          <input
            type="checkbox"
            checked={allowDuplicate}
            disabled={busy}
            onChange={(event) => setAllowDuplicate(event.target.checked)}
          />
          允许重复添加同一地点
        </label>
        {message && (
          <p
            role={failed ? 'alert' : 'status'}
            className={failed ? 'formError' : undefined}
          >
            {failed === 'save' ? (error ?? message) : message}
          </p>
        )}
        {!library.length ? (
          <p className="muted">地点库暂无地点。</p>
        ) : !matched.length ? (
          <p className="muted">没有匹配的地点。</p>
        ) : (
          <div className={styles.libraryList}>
            {matched.map((place) => {
              const joined = addedTo(place)
              return (
                <article key={place.id} aria-label={place.name}>
                  <div>
                    <strong>{place.name}</strong>
                    {place.address && <p>{place.address}</p>}
                    {joined && <p className={styles.joined}>{joined}</p>}
                  </div>
                  <button
                    type="button"
                    className="secondaryButton"
                    disabled={busy || (!!joined && !allowDuplicate)}
                    onClick={() => void copy(place)}
                  >
                    {joined ? (allowDuplicate ? '再次加入' : '已加入') : '加入'}
                  </button>
                </article>
              )
            })}
          </div>
        )}
        <footer className={styles.footer}>
          <span className="muted" aria-live="polite">
            本次已加入 {addedCount} 个
          </span>
          <button
            type="button"
            className="primaryButton"
            disabled={busy}
            onClick={onClose}
          >
            完成
          </button>
        </footer>
      </div>
    </EditPanel>
  )
}
