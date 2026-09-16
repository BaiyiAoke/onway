import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { ConfirmDialog, EditPanel } from '../../components/EditPanel'
import { useTravel } from '../../services/travel/TravelContext'
import { categoryName, formatDayLabel } from '../../services/travel/model'
import type { TravelAction, Trip, TripPlace } from '../../services/travel/types'
import { TravelToolbar } from '../travel/TravelToolbar'
import { PlaceEditor, type PlaceDraft } from '../travel/PlaceEditor'
import forms from '../travel/Travel.module.css'
import styles from './Plan.module.css'
import { CollectPlaceButton } from '../places/CopyActions'
import {
  DayRouteSummary,
  RouteLeg,
  RouteAttribution,
} from '../routes/DayRouteSummary'
import { AmapButton } from '../routes/AmapButton'
import { ActionMenu } from '../../components/ActionMenu'
import { TravelSaveFeedback } from '../travel/TravelSaveFeedback'

function TripEditor({ trip, onClose }: { trip?: Trip; onClose: () => void }) {
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

export function PlanPage() {
  const {
    workspace,
    activeTrip: trip,
    status,
    saving,
    group,
    setGroup,
    run,
  } = useTravel()
  const [tripEditor, setTripEditor] = useState<'new' | 'edit' | null>(null)
  const [editingPlace, setEditingPlace] = useState<PlaceDraft | null>(null)
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
    action: TravelAction
  } | null>(null)
  function editPlace(place: TripPlace, dayId: string | null) {
    setEditingPlace({ ...place, dayId })
  }
  function deletePlace(place: TripPlace) {
    if (!trip) return
    setConfirmation({
      title: '删除地点',
      message: '删除“' + place.name + '”后，它会从此行程的地图和列表移除。',
      action: { type: 'deletePlace', tripId: trip.id, placeId: place.id },
    })
  }
  function renderPlaces(places: TripPlace[], dayId: string | null) {
    if (!trip) return null
    if (!places.length)
      return (
        <div className={styles.emptyDay}>
          <MapPin size={20} />
          <p>{dayId ? '这一天还没有地点。' : '还没有未安排的地点。'}</p>
          <Link
            className="textButton"
            to="/map"
            onClick={() => setGroup(dayId ?? 'unscheduled')}
          >
            去地图添加地点
          </Link>
        </div>
      )
    return (
      <ol className={styles.list}>
        {places.map((place, index) => (
          <li className={styles.place} key={place.id}>
            <span className={styles.index}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className={styles.placeMain}>
              {dayId && (
                <RouteLeg
                  tripId={trip.id}
                  day={trip.days.find((day) => day.id === dayId)!}
                  toIndex={index}
                />
              )}
              <h3>{place.name}</h3>
              {place.categoryId && (
                <span className="tag">
                  {categoryName(workspace, place.categoryId)}
                </span>
              )}
              {place.address && <p>{place.address}</p>}
              {place.note && <p>{place.note}</p>}
              <div className={styles.placeLinks}>
                <button
                  className="textButton"
                  disabled={saving}
                  onClick={() => editPlace(place, dayId)}
                >
                  <Pencil size={14} />
                  编辑
                </button>
                <Link
                  className="textButton"
                  to={'/map?place=' + encodeURIComponent(place.id)}
                  onClick={() => setGroup('all')}
                >
                  <MapPin size={14} />
                  在地图查看
                </Link>
                <ActionMenu label={place.name + '的更多操作'}>
                  <AmapButton place={place} />
                  <CollectPlaceButton tripId={trip.id} place={place} />
                  {place.sourceUrl && (
                    <a
                      className="textButton"
                      href={place.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      地点资料
                    </a>
                  )}
                </ActionMenu>
              </div>
            </div>
            <div className={styles.placeTools}>
              <label className="srOnly" htmlFor={'move-' + place.id}>
                移动{place.name}到
              </label>
              <select
                id={'move-' + place.id}
                value={dayId ?? 'unscheduled'}
                disabled={saving}
                onChange={(event) =>
                  void run({
                    type: 'movePlace',
                    tripId: trip.id,
                    placeId: place.id,
                    dayId:
                      event.target.value === 'unscheduled'
                        ? null
                        : event.target.value,
                  })
                }
              >
                <option value="unscheduled">未安排</option>
                {trip.days.map((day, dayIndex) => (
                  <option key={day.id} value={day.id}>
                    {formatDayLabel(trip, dayIndex)}
                  </option>
                ))}
              </select>
              <div className={styles.iconActions}>
                <button
                  className="iconButton"
                  disabled={saving || index === 0}
                  aria-label={'上移' + place.name}
                  onClick={() =>
                    void run({
                      type: 'reorderPlace',
                      tripId: trip.id,
                      placeId: place.id,
                      direction: -1,
                    })
                  }
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="iconButton"
                  disabled={saving || index === places.length - 1}
                  aria-label={'下移' + place.name}
                  onClick={() =>
                    void run({
                      type: 'reorderPlace',
                      tripId: trip.id,
                      placeId: place.id,
                      direction: 1,
                    })
                  }
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="iconButton dangerText"
                  disabled={saving}
                  aria-label={'删除' + place.name}
                  onClick={() => deletePlace(place)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <div className="page">
      <div className="pageHeading">
        <div>
          <h1>计划</h1>
        </div>
        <button
          className="primaryButton"
          disabled={status !== 'ready' || saving}
          onClick={() => setTripEditor('new')}
        >
          <Plus size={17} />
          创建行程
        </button>
      </div>
      <TravelToolbar />
      {status === 'ready' && !trip && (
        <section className={'card ' + styles.empty}>
          <CalendarDays size={38} strokeWidth={1.3} />
          <h2>还没有行程</h2>
          <p>可以先不定出发日期，把想去的地点放进“未安排”。</p>
          <div className={styles.actions}>
            <button
              className="primaryButton"
              disabled={saving}
              onClick={() => setTripEditor('new')}
            >
              创建我的第一个行程
            </button>
            <button
              className="secondaryButton"
              disabled={saving}
              onClick={() =>
                void run({
                  type: 'createTrip',
                  name: '河西走廊之旅（示例）',
                  startDate: null,
                  dayCount: 3,
                  demo: true,
                })
              }
            >
              创建示例行程
            </button>
          </div>
        </section>
      )}
      {status === 'ready' && trip && (
        <>
          <section className={'card ' + styles.intro}>
            <div>
              <h2>{trip.name}</h2>
              <p>
                {trip.days.length} 天 ·{' '}
                {trip.days.reduce((count, day) => count + day.places.length, 0)}{' '}
                个已安排地点 · {trip.unscheduledPlaces.length} 个未安排
              </p>
              <p>
                {trip.startDate ? trip.startDate + ' 出发' : '出发日期待定'}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                className="secondaryButton"
                disabled={saving}
                onClick={() => setTripEditor('edit')}
              >
                <Pencil size={15} />
                编辑行程
              </button>
              <button
                className="iconButton dangerText"
                disabled={saving}
                aria-label="删除当前行程"
                onClick={() =>
                  setConfirmation({
                    title: '删除行程',
                    message:
                      '删除“' +
                      trip.name +
                      '”及其全部日期和地点。个人备注与其他行程会保留。',
                    action: { type: 'deleteTrip', tripId: trip.id },
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          </section>
          <div className={styles.dayActions}>
            <button
              className="secondaryButton"
              disabled={saving}
              onClick={() => void run({ type: 'addDay', tripId: trip.id })}
            >
              <Plus size={16} />
              追加一天
            </button>
            <Link className="primaryButton" to="/map">
              <MapPin size={16} />
              地图选点
            </Link>
          </div>
          {(group === 'all' || group === 'unscheduled') && (
            <section className={'card ' + styles.daySection}>
              <div className={styles.dayHeading}>
                <div>
                  <h2>未安排地点</h2>
                </div>
                <span className="tag">
                  {trip.unscheduledPlaces.length} 个地点
                </span>
              </div>
              {renderPlaces(trip.unscheduledPlaces, null)}
            </section>
          )}
          {trip.days.map((day, index) =>
            group !== 'all' && group !== day.id ? null : (
              <section className={'card ' + styles.daySection} key={day.id}>
                <div className={styles.dayHeading}>
                  <div>
                    <h2>{formatDayLabel(trip, index)}</h2>
                  </div>
                  <button
                    className="textButton dangerText"
                    disabled={saving || trip.days.length === 1}
                    onClick={() =>
                      setConfirmation({
                        title: '删除这一天',
                        message:
                          '这一天的 ' +
                          day.places.length +
                          ' 个地点会移回未安排，后续天数和日期将重新编号。',
                        action: {
                          type: 'deleteDay',
                          tripId: trip.id,
                          dayId: day.id,
                        },
                      })
                    }
                  >
                    删除这一天
                  </button>
                </div>
                <DayRouteSummary trip={trip} day={day} editable />
                {renderPlaces(day.places, day.id)}
              </section>
            ),
          )}
          <RouteAttribution />
          <button
            className="textButton"
            disabled={saving}
            onClick={() =>
              void run({
                type: 'createTrip',
                name: '河西走廊之旅（示例）',
                startDate: null,
                dayCount: 3,
                demo: true,
              })
            }
          >
            另建一个示例行程
          </button>
        </>
      )}
      {workspace && tripEditor && (
        <TripEditor
          key={tripEditor === 'new' ? 'new' : trip?.id}
          trip={tripEditor === 'edit' && trip ? trip : undefined}
          onClose={() => setTripEditor(null)}
        />
      )}
      {trip && editingPlace && (
        <PlaceEditor
          trip={trip}
          draft={editingPlace}
          onClose={() => setEditingPlace(null)}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          onClose={() => setConfirmation(null)}
          onConfirm={() => run(confirmation.action)}
          failure={
            <TravelSaveFeedback
              message="操作未保存，原数据仍保留。"
              tripId={trip?.id}
            />
          }
        />
      )}
    </div>
  )
}
