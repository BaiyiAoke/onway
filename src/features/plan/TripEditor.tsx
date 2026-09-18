import { useState, type FormEvent } from 'react'
import { EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import type { TravelAction, Trip } from '../../services/travel/types'
import { TravelSaveFeedback } from '../travel/TravelSaveFeedback'
import forms from '../travel/Travel.module.css'

export function TripEditor({
  trip,
  onClose,
}: {
  trip?: Trip
  onClose: () => void
}) {
  const { saving, run } = useTravel()
  const [name, setName] = useState(trip?.name ?? '')
  const [date, setDate] = useState(trip?.startDate ?? '')
  const [days, setDays] = useState('1')
  const [error, setError] = useState('')
  const dirty =
    name !== (trip?.name ?? '') ||
    date !== (trip?.startDate ?? '') ||
    (!trip && days !== '1')
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('请填写行程名称。')
      return
    }
    const action: TravelAction = trip
      ? {
          type: 'updateTrip',
          tripId: trip.id,
          name: name.trim(),
          startDate: date || null,
        }
      : {
          type: 'createTrip',
          name: name.trim(),
          startDate: date || null,
          dayCount: Number(days),
        }
    if (await run(action)) onClose()
    else setError('行程未保存，请检查名称、日期和天数后重试。')
  }
  return (
    <EditPanel
      title={trip ? '编辑行程' : '创建行程'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
    >
      {(requestClose) => (
        <form className={forms.form} onSubmit={(event) => void save(event)}>
          <label>
            行程名称
            <input
              autoFocus
              required
              maxLength={120}
              disabled={saving}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：秋天去河西走廊"
            />
          </label>
          <label>
            出发日期（可暂不填写）
            <input
              type="date"
              disabled={saving}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <small>确定出发日期后，每天会自动显示对应日期。</small>
          </label>
          {!trip && (
            <label>
              旅行天数
              <input
                type="number"
                required
                min={1}
                max={365}
                step={1}
                disabled={saving}
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </label>
          )}
          {trip && (
            <p className="muted">
              修改出发日期只调整日期显示，地点会完整保留。天数在计划页增减。
            </p>
          )}
          {error && <TravelSaveFeedback message={error} tripId={trip?.id} />}
          <div className={forms.formActions}>
            <button
              type="button"
              className="secondaryButton"
              disabled={saving}
              onClick={requestClose}
            >
              取消
            </button>
            <button className="primaryButton" disabled={saving}>
              {saving ? '保存中…' : '保存行程'}
            </button>
          </div>
        </form>
      )}
    </EditPanel>
  )
}
