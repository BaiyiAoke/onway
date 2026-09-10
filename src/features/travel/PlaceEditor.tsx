import { useState, type FormEvent } from 'react'
import { MapPin, Save, Trash2 } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel } from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import styles from './Travel.module.css'
import { TravelSaveFeedback } from './TravelSaveFeedback'

export interface PlaceDraft extends TripPlace {
  dayId: string | null
}
export function PlaceEditor({
  trip,
  draft,
  onClose,
  onPickLocation,
}: {
  trip: Trip
  draft: PlaceDraft
  onClose: () => void
  onPickLocation?: (draft: PlaceDraft) => void
}) {
  const { saving, run } = useTravel()
  const [form, setForm] = useState<PlaceDraft>(() => ({
    ...draft,
    coordinates: { ...draft.coordinates },
  }))
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const originalDay = trip.days.find((day) =>
    day.places.some((place) => place.id === draft.id),
  )
  const original =
    originalDay?.places.find((place) => place.id === draft.id) ??
    trip.unscheduledPlaces.find((place) => place.id === draft.id)
  const baseline = original
    ? { ...original, dayId: originalDay?.id ?? null }
    : { ...draft, name: '', note: '' }
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('请填写地点名称。')
      return
    }
    setError('')
    const { dayId, ...place } = form
    if (
      await run({
        type: 'savePlace',
        tripId: trip.id,
        dayId,
        place: { ...place, name: place.name.trim(), note: place.note.trim() },
      })
    )
      onClose()
    else setError('地点保存失败，输入已保留，请重试。')
  }
  async function remove() {
    if (await run({ type: 'deletePlace', tripId: trip.id, placeId: draft.id }))
      onClose()
    else setError('删除未保存，请重试。')
  }
  return (
    <EditPanel
      title={original ? '编辑地点' : '添加地点'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
    >
      {(requestClose) =>
        deleting ? (
          <div>
            <p>删除“{original?.name}”后，它会从此行程的地图和列表移除。</p>
            {error && <TravelSaveFeedback message={error} tripId={trip.id} />}
            <div className={styles.formActions}>
              <button
                className="secondaryButton"
                disabled={saving}
                onClick={() => setDeleting(false)}
              >
                返回编辑
              </button>
              <button
                className="dangerButton"
                disabled={saving}
                onClick={() => void remove()}
              >
                确认删除
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => void submit(event)}
            className={styles.form}
          >
            <label>
              地点名称
              <input
                autoFocus
                disabled={saving}
                required
                maxLength={120}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              备注
              <textarea
                disabled={saving}
                rows={3}
                value={form.note}
                placeholder="入口、停车位置、想做的事…"
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
            <label>
              安排到
              <select
                disabled={saving}
                value={form.dayId ?? 'unscheduled'}
                onChange={(event) =>
                  setForm({
                    ...form,
                    dayId:
                      event.target.value === 'unscheduled'
                        ? null
                        : event.target.value,
                  })
                }
              >
                <option value="unscheduled">未安排</option>
                {trip.days.map((day, index) => (
                  <option key={day.id} value={day.id}>
                    {formatDayLabel(trip, index)}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.position}>
              <MapPin size={17} />
              <span>
                已选位置 · {form.coordinates.latitude.toFixed(5)},{' '}
                {form.coordinates.longitude.toFixed(5)}
              </span>
              {onPickLocation && (
                <button
                  type="button"
                  className="textButton"
                  disabled={saving}
                  onClick={() => onPickLocation(form)}
                >
                  重新选点
                </button>
              )}
            </div>
            {form.sourceUrl && (
              <a
                className="textButton"
                href={form.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                示例坐标资料来源
              </a>
            )}
            {error && <TravelSaveFeedback message={error} tripId={trip.id} />}
            <div className={styles.formActions}>
              {original && (
                <button
                  type="button"
                  className="textButton dangerText"
                  disabled={saving}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={15} />
                  删除地点
                </button>
              )}
              <button
                type="button"
                className="secondaryButton"
                disabled={saving}
                onClick={requestClose}
              >
                取消
              </button>
              <button className="primaryButton" disabled={saving}>
                <Save size={16} />
                {saving ? '保存中…' : '保存地点'}
              </button>
            </div>
          </form>
        )
      }
    </EditPanel>
  )
}
