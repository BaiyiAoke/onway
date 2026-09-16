import { useState, type FormEvent } from 'react'
import { MapPin, Save, Trash2 } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel, samePlace } from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import {
  parseCoordinates,
  splitCoordinates,
  type CoordinateSystem,
} from '../../services/travel/coordinates'
import styles from './Travel.module.css'
import { TravelSaveFeedback } from './TravelSaveFeedback'

export interface PlaceDraft extends TripPlace {
  dayId: string | null
}

export function newPlaceDraft(dayId: string | null = null): PlaceDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    note: '',
    coordinates: { longitude: NaN, latitude: NaN, crs: 'WGS84' },
    dayId,
  }
}

export function PlaceEditor({
  trip,
  draft,
  onClose,
  onPickLocation,
}: {
  trip?: Trip
  draft: PlaceDraft
  onClose: () => void
  onPickLocation?: (draft: PlaceDraft) => void
}) {
  const { workspace, saving, run } = useTravel()
  const [form, setForm] = useState<PlaceDraft>(() => ({
    ...draft,
    coordinates: { ...draft.coordinates },
  }))
  const initialLng = Number.isFinite(draft.coordinates.longitude)
    ? String(draft.coordinates.longitude)
    : ''
  const initialLat = Number.isFinite(draft.coordinates.latitude)
    ? String(draft.coordinates.latitude)
    : ''
  const [longitude, setLongitude] = useState(initialLng)
  const [latitude, setLatitude] = useState(initialLat)
  const [system, setSystem] = useState<CoordinateSystem>('WGS84')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const originalDay = trip?.days.find((day) =>
    day.places.some((place) => place.id === draft.id),
  )
  const original = trip
    ? (originalDay?.places.find((place) => place.id === draft.id) ??
      trip.unscheduledPlaces.find((place) => place.id === draft.id))
    : workspace?.libraryPlaces.find((place) => place.id === draft.id)
  const baseline = original
    ? { ...original, dayId: originalDay?.id ?? null }
    : { ...draft, name: '', note: '' }
  const dirty =
    JSON.stringify(form) !== JSON.stringify(baseline) ||
    longitude !== initialLng ||
    latitude !== initialLat ||
    system !== 'WGS84'
  function makeDraft(): PlaceDraft {
    const coordinates = parseCoordinates(longitude, latitude, system)
    const changed =
      coordinates.longitude !== draft.coordinates.longitude ||
      coordinates.latitude !== draft.coordinates.latitude
    return {
      ...form,
      coordinates,
      ...(changed
        ? {
            source: undefined,
            sourceUrl: undefined,
            address: form.address === draft.address ? undefined : form.address,
          }
        : {}),
    }
  }
  async function submit(event: FormEvent, allowDuplicate = false) {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('请填写地点名称。')
      return
    }
    let value: PlaceDraft
    try {
      value = makeDraft()
    } catch (reason) {
      setError((reason as Error).message)
      return
    }
    setError('')
    const { dayId, ...place } = value
    const normalized = {
      ...place,
      name: place.name.trim(),
      note: place.note.trim(),
      address: place.address?.trim(),
    }
    if (
      !trip &&
      !original &&
      !allowDuplicate &&
      workspace?.libraryPlaces.some((item) => samePlace(item, normalized))
    ) {
      setDuplicate(true)
      return
    }
    const ok = await run(
      trip
        ? { type: 'savePlace', tripId: trip.id, dayId, place: normalized }
        : { type: 'saveLibraryPlace', place: normalized, allowDuplicate },
    )
    if (ok) onClose()
    else setError('地点保存失败，输入已保留，请重试。')
  }
  async function remove() {
    const ok = await run(
      trip
        ? { type: 'deletePlace', tripId: trip.id, placeId: draft.id }
        : { type: 'deleteLibraryPlace', placeId: draft.id },
    )
    if (ok) onClose()
    else setError('删除未保存，请重试。')
  }
  function pickLocation() {
    let value = form
    try {
      value = makeDraft()
    } catch {
      /* 重新选点允许修正尚未填完的坐标。 */
    }
    onPickLocation?.(value)
  }
  return (
    <EditPanel
      title={
        trip
          ? original
            ? '编辑行程地点'
            : '添加行程地点'
          : original
            ? '编辑收藏地点'
            : '收藏地点'
      }
      onClose={onClose}
      dirty={dirty}
      busy={saving}
    >
      {(requestClose) =>
        deleting ? (
          <div>
            <p>
              {trip
                ? '删除“' +
                  original?.name +
                  '”后，它会从此行程的地图和列表移除。'
                : '从地点库删除“' +
                  original?.name +
                  '”，已有行程副本不受影响。'}
            </p>
            {error && <TravelSaveFeedback message={error} tripId={trip?.id} />}
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
            <p className="muted">
              {trip
                ? '所属行程：' + trip.name
                : '地点库 · 已有行程副本不受修改影响'}
            </p>
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
              分类
              <select
                disabled={saving}
                value={form.categoryId ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    categoryId: event.target.value || undefined,
                  })
                }
              >
                <option value="">未分类</option>
                {workspace?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              地址
              <input
                disabled={saving}
                maxLength={300}
                value={form.address ?? ''}
                onChange={(event) =>
                  setForm({ ...form, address: event.target.value })
                }
              />
            </label>
            <label>
              备注
              <textarea
                disabled={saving}
                rows={3}
                value={form.note}
                placeholder="入口、停车位置等"
                onChange={(event) =>
                  setForm({ ...form, note: event.target.value })
                }
              />
            </label>
            {trip && (
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
            )}
            <fieldset className={styles.coordinates} disabled={saving}>
              <legend>位置</legend>
              <label>
                坐标来源
                <select
                  value={system}
                  onChange={(event) =>
                    setSystem(event.target.value as CoordinateSystem)
                  }
                >
                  <option value="WGS84">GPS／OSM（WGS84）</option>
                  <option value="GCJ02">高德（GCJ-02）</option>
                </select>
              </label>
              <div className={styles.coordinateRow}>
                <label>
                  经度
                  <input
                    required
                    inputMode="decimal"
                    value={longitude}
                    placeholder="103.8343"
                    onChange={(event) => setLongitude(event.target.value)}
                    onPaste={(event) => {
                      const pair = splitCoordinates(
                        event.clipboardData.getData('text'),
                      )
                      if (pair) {
                        event.preventDefault()
                        setLongitude(pair[0])
                        setLatitude(pair[1])
                      }
                    }}
                  />
                </label>
                <label>
                  纬度
                  <input
                    required
                    inputMode="decimal"
                    value={latitude}
                    placeholder="36.0611"
                    onChange={(event) => setLatitude(event.target.value)}
                  />
                </label>
              </div>
              <small>可在经度框粘贴“经度,纬度”。</small>
              {onPickLocation && (
                <button
                  type="button"
                  className="textButton"
                  onClick={pickLocation}
                >
                  <MapPin size={16} />
                  重新选点
                </button>
              )}
            </fieldset>
            {form.sourceUrl && (
              <a
                className="textButton"
                href={form.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                地点资料来源
              </a>
            )}
            {error && <TravelSaveFeedback message={error} tripId={trip?.id} />}
            {duplicate && (
              <div role="status">
                <p>地点库已包含这个地点。</p>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={saving}
                  onClick={(event) => void submit(event, true)}
                >
                  仍然保存一份
                </button>
              </div>
            )}
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
