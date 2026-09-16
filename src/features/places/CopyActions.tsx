import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import {
  formatDayLabel,
  getGroupPlaces,
  samePlace,
} from '../../services/travel/model'
import type { TripPlace } from '../../services/travel/types'
import { TravelSaveFeedback } from '../travel/TravelSaveFeedback'
import forms from '../travel/Travel.module.css'

export function CopyToTrip({
  place,
  onClose,
}: {
  place: TripPlace
  onClose: () => void
}) {
  const { workspace, run, saving } = useTravel()
  const [tripId, setTripId] = useState(
    workspace?.activeTripId ?? workspace?.trips[0]?.id ?? '',
  )
  const [dayId, setDayId] = useState('')
  const [allow, setAllow] = useState(false)
  const [error, setError] = useState(false)
  const trip = workspace?.trips.find((item) => item.id === tripId)
  const duplicate =
    trip &&
    getGroupPlaces(trip, 'all').some(
      (item) => item.libraryPlaceId === place.id || samePlace(item, place),
    )
  return (
    <EditPanel title="添加到行程" onClose={onClose} busy={saving}>
      {!workspace?.trips.length ? (
        <p>
          还没有行程。
          <Link className="textButton" to="/plan" onClick={onClose}>
            去创建行程
          </Link>
        </p>
      ) : (
        <form
          className={forms.form}
          onSubmit={(event) => {
            event.preventDefault()
            void run({
              type: 'copyToTrip',
              placeId: place.id,
              tripId,
              dayId: dayId || null,
              allowDuplicate: allow,
            }).then((ok) => {
              setError(!ok)
              if (ok) onClose()
            })
          }}
        >
          <p>{place.name}</p>
          <label>
            行程
            <select
              value={tripId}
              disabled={saving}
              onChange={(event) => {
                setTripId(event.target.value)
                setDayId('')
                setAllow(false)
              }}
            >
              {workspace.trips.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            安排到
            <select
              value={dayId}
              disabled={saving}
              onChange={(event) => setDayId(event.target.value)}
            >
              <option value="">未安排</option>
              {trip?.days.map((day, index) => (
                <option key={day.id} value={day.id}>
                  {formatDayLabel(trip, index)}
                </option>
              ))}
            </select>
          </label>
          {duplicate && (
            <div role="status">
              <p>此行程已包含该地点。</p>
              <button
                type="button"
                className="secondaryButton"
                disabled={saving}
                aria-pressed={allow}
                onClick={() => setAllow(!allow)}
              >
                {allow ? '已允许再添加一份' : '仍要再添加一份'}
              </button>
            </div>
          )}
          <small className="muted">
            加入后独立保存，修改地点库不会影响行程。
          </small>
          {error && <TravelSaveFeedback message="添加失败，请重试。" />}
          <div className={forms.formActions}>
            <button
              className="primaryButton"
              disabled={saving || !trip || Boolean(duplicate && !allow)}
            >
              确认添加
            </button>
          </div>
        </form>
      )}
    </EditPanel>
  )
}

export function CollectPlaceButton({
  tripId,
  place,
}: {
  tripId: string
  place: TripPlace
}) {
  const { workspace, run, saving } = useTravel()
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  async function collect(allowDuplicate = false) {
    if (
      !allowDuplicate &&
      workspace?.libraryPlaces.some((item) => samePlace(item, place))
    ) {
      setConfirm(true)
      return
    }
    if (
      await run({
        type: 'collectPlace',
        tripId,
        placeId: place.id,
        allowDuplicate,
      })
    ) {
      setMessage('已收藏')
      setConfirm(false)
    } else setMessage('收藏失败，请重试')
  }
  return (
    <>
      <button
        className="textButton"
        disabled={saving}
        onClick={() => void collect()}
      >
        <BookmarkPlus size={14} />
        {message || '收藏到地点库'}
      </button>
      {confirm && (
        <EditPanel
          title="地点已在库中"
          onClose={() => setConfirm(false)}
          busy={saving}
        >
          <p>地点库已包含此地点，是否仍要保存一份独立副本？</p>
          <div className={forms.formActions}>
            <button
              className="secondaryButton"
              onClick={() => setConfirm(false)}
            >
              取消
            </button>
            <button
              className="primaryButton"
              disabled={saving}
              onClick={() => void collect(true)}
            >
              仍然收藏
            </button>
          </div>
          {message.includes('失败') && <TravelSaveFeedback message={message} />}
        </EditPanel>
      )}
    </>
  )
}
