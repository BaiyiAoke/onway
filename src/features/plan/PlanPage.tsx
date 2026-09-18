import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  CalendarDays,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { ConfirmDialog, EditPanel } from '../../components/EditPanel'
import { useBackHandler } from '../../components/BackHandler'
import { ActionMenu } from '../../components/ActionMenu'
import { useTravel } from '../../services/travel/TravelContext'
import {
  categoryName,
  formatDayLabel,
  getTodayDayIndex,
  getGroupPlaces,
} from '../../services/travel/model'
import type { TravelAction, Trip, TripPlace } from '../../services/travel/types'
import { TravelToolbar } from '../travel/TravelToolbar'
import {
  PlaceEditor,
  newPlaceDraft,
  type PlaceDraft,
} from '../travel/PlaceEditor'
import { TravelSaveFeedback } from '../travel/TravelSaveFeedback'
import { useSessionView } from '../travel/useSessionView'
import { readPlanReturn } from '../travel/planReturn'
import { CollectPlaceButton } from '../places/CopyActions'
import { PlaceComposer } from '../places/PlaceComposer'
import {
  DayRouteSummary,
  RouteLeg,
  RouteAttribution,
} from '../routes/DayRouteSummary'
import { AmapButton } from '../routes/AmapButton'
import { DetachedTransport } from '../routes/TransportEditor'
import type { TravelMapHandle, MapState } from '../map/TravelMap'
import { TripEditor } from './TripEditor'
import { PlanDaySummary } from './PlanDaySummary'
import { PlanAddPanel } from './PlanAddPanel'
import { PlanDrag, DraggablePlace, DropSlot } from './PlanDrag'
import { usePlacement, type InsertionTarget } from './usePlacement'
import styles from './Plan.module.css'

const TravelMap = lazy(() => import('../map/PlanMap'))
const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
const isString = (value: unknown): value is string => typeof value === 'string'
function useDesktop() {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia?.('(min-width: 1024px)').matches ?? false,
  )
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)')
    if (!query) return
    const change = () => setDesktop(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return desktop
}
export function PlanPage() {
  const { activeTrip: trip, status, saving, run } = useTravel()
  const location = useLocation()
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null)
  return (
    <div className={'page ' + styles.plannerPage}>
      {(!trip || status !== 'ready') && (
        <TravelToolbar
          compact
          showGroups={false}
          heading={<h1>计划</h1>}
          actions={
            <button
              className="secondaryButton"
              disabled={status !== 'ready' || saving}
              onClick={() => setEditor('new')}
            >
              <Plus size={16} />
              创建行程
            </button>
          }
        />
      )}
      {status === 'ready' && !trip && (
        <section className={'card ' + styles.empty}>
          <CalendarDays size={38} />
          <h2>还没有行程</h2>
          <p>可以先不定出发日期，把想去的地点放进“未安排”。</p>
          <div className={styles.actions}>
            <button
              className="primaryButton"
              disabled={saving}
              onClick={() => setEditor('new')}
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
      {trip && (
        <PlanSession
          key={trip.id + location.key}
          trip={trip}
          onEditTrip={() => setEditor('edit')}
          onCreateTrip={() => setEditor('new')}
        />
      )}
      {editor && (
        <TripEditor
          trip={editor === 'edit' ? (trip ?? undefined) : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}

function PlanSession({
  trip,
  onEditTrip,
  onCreateTrip,
}: {
  trip: Trip
  onEditTrip: () => void
  onCreateTrip: () => void
}) {
  const { workspace, saving, error, run, setGroup } = useTravel()
  const location = useLocation()
  const desktop = useDesktop()
  const inbound = readPlanReturn(location.state)
  const requested = inbound?.tripId === trip.id ? inbound : null
  const defaultDay = trip.days[getTodayDayIndex(trip) ?? 0].id
  const [remembered, setRemembered] = useSessionView(
    'ui.plan.focus.' + trip.id,
    defaultDay,
    isString,
  )
  const initial = requested?.dayId ?? (requested ? 'unscheduled' : remembered)
  const [focused, setFocused] = useState(initial)
  const current =
    focused === 'unscheduled' || trip.days.some((d) => d.id === focused)
      ? focused
      : defaultDay
  const [expanded, setExpanded] = useSessionView(
    'ui.plan.expanded.' + trip.id,
    [current],
    stringList,
  )
  const [initialized, setInitialized] = useState(false)
  if (!initialized) {
    setInitialized(true)
    setRemembered(current)
    if (!expanded.includes(current)) setExpanded([...expanded, current])
  }
  if (focused !== current) {
    setFocused(current)
    setRemembered(current)
    if (!expanded.includes(current)) setExpanded([...expanded, current])
  }
  const [temporary, setTemporary] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(
    requested?.placeId ?? null,
  )
  const [segment, setSegment] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [target, setTarget] = useState<InsertionTarget | null>(null)
  const [pane, setPane] = useState<'map' | 'add'>('map')
  const [mobileMap, setMobileMap] = useState(false)
  const [allRoutes, setAllRoutes] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<PlaceDraft | null>(null)
  const [picked, setPicked] = useState<{
    draft: PlaceDraft
    target: InsertionTarget
  } | null>(null)
  const [confirmation, setConfirmation] = useState<{
    title: string
    message: string
    action: TravelAction
  } | null>(null)
  const map = useRef<TravelMapHandle>(null)
  const [mapState, setMapState] = useState<MapState>('loading')
  const focusedRequest = useRef(0)
  const [focusRequest, setFocusRequest] = useState<{
    placeId: string
    nonce: number
  } | null>(null)
  const { move, undoMove, canUndo, message, fingerprint } = usePlacement(
    trip.id,
  )
  const currentIndex = trip.days.findIndex((d) => d.id === current)
  const mapGroup = allRoutes ? 'all' : current
  const returnKey = useRef('')
  const nextDay = useRef(false)
  const previousDayCount = useRef(trip.days.length)
  const isOpen = (id: string) => expanded.includes(id) || temporary.includes(id)
  function expand(id: string) {
    if (!expanded.includes(id)) setExpanded([...expanded, id])
  }
  function locate(id: string, scroll = true) {
    setFocused(id)
    setRemembered(id)
    setGroup(id)
    expand(id)
    setSegment(null)
    setAllRoutes(false)
    if (scroll)
      requestAnimationFrame(() =>
        document
          .getElementById('plan-day-' + id)
          ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
      )
  }
  function openAdd(value: InsertionTarget) {
    setTarget(value)
    setPane('add')
    setPicking(false)
    locate(value.dayId ?? 'unscheduled', false)
  }
  function addDay() {
    nextDay.current = true
    void run({ type: 'addDay', tripId: trip.id }).then((ok) => {
      if (!ok) nextDay.current = false
    })
  }
  function selectPlace(place: TripPlace, fromMap = false) {
    const dayId =
      trip.days.find((d) => d.places.some((p) => p.id === place.id))?.id ??
      'unscheduled'
    locate(dayId, false)
    setSelected(place.id)
    if (fromMap) {
      if (desktop)
        requestAnimationFrame(() =>
          document
            .getElementById('plan-place-' + place.id)
            ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
        )
    } else {
      setAllRoutes(false)
      setPane('map')
      setFocusRequest({ placeId: place.id, nonce: Date.now() })
      if (!desktop) setMobileMap(true)
    }
  }
  useEffect(() => {
    if (
      !focusRequest ||
      focusedRequest.current === focusRequest.nonce ||
      mapState !== 'ready' ||
      (!desktop && !mobileMap) ||
      pane !== 'map'
    )
      return
    const place = getGroupPlaces(trip, 'all').find(
      (p) => p.id === focusRequest.placeId,
    )
    if (place && map.current) {
      map.current.focusPlace(place)
      focusedRequest.current = focusRequest.nonce
    }
  }, [focusRequest, mapState, desktop, mobileMap, pane, trip])
  useEffect(() => {
    if (!requested || returnKey.current === location.key) return
    returnKey.current = location.key
    const day = requested.dayId ?? 'unscheduled'
    if (day !== 'unscheduled' && !trip.days.some((d) => d.id === day)) return
    // 显式跳转优先于会话记忆，展开目标当天但保留其他手动展开的日期。
    requestAnimationFrame(() =>
      document
        .getElementById(
          requested.placeId
            ? 'plan-place-' + requested.placeId
            : 'plan-day-' + day,
        )
        ?.scrollIntoView?.({ block: 'center' }),
    )
  }, [requested, location.key, trip])
  useEffect(() => {
    if (nextDay.current && trip.days.length > previousDayCount.current) {
      const id = trip.days[trip.days.length - 1].id
      setFocused(id)
      setRemembered(id)
      setGroup(id)
      setExpanded([...expanded, id])
      nextDay.current = false
    }
    previousDayCount.current = trip.days.length
  }, [trip.days, expanded, setExpanded, setRemembered, setGroup])
  async function relocate(
    placeId: string,
    value: InsertionTarget,
    expected?: string,
  ) {
    const ok = await move(placeId, value, expected)
    if (ok) {
      setSelected(placeId)
      setFocused(value.dayId ?? 'unscheduled')
      setRemembered(value.dayId ?? 'unscheduled')
      setGroup(value.dayId ?? 'unscheduled')
    }
    return ok
  }
  function deletePlace(place: TripPlace) {
    setConfirmation({
      title: '删除地点',
      message: '删除“' + place.name + '”后，它会从此行程的地图和列表移除。',
      action: { type: 'deletePlace', tripId: trip.id, placeId: place.id },
    })
  }
  function renderPlaces(places: TripPlace[], dayId: string | null) {
    return (
      <ol className={styles.list}>
        {!places.length && (
          <li className={styles.emptyDay}>还没有地点，点击添加或拖入地点。</li>
        )}
        {places.map((place, index) => (
          <li
            className={
              styles.place +
              (selected === place.id ? ' ' + styles.selectedPlace : '')
            }
            id={'plan-place-' + place.id}
            key={place.id}
            tabIndex={-1}
          >
            <DropSlot
              id={'before:' + place.id}
              target={{ dayId, beforePlaceId: place.id }}
              label={'在「' + place.name + '」之前'}
              disabled={saving}
              onAdd={() => openAdd({ dayId, beforePlaceId: place.id })}
            />
            <DraggablePlace place={place} disabled={saving}>
              <span className={styles.index}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.placeMain}>
                <div className={styles.placeTitle}>
                  <h3>
                    <button
                      className={styles.placeName}
                      onClick={() => selectPlace(place)}
                      title="在计划地图中查看"
                    >
                      {place.name}
                    </button>
                  </h3>
                  {place.categoryId && (
                    <span className="tag">
                      {categoryName(workspace, place.categoryId)}
                    </span>
                  )}
                </div>
                {place.address && <p title={place.address}>{place.address}</p>}
                {place.note && <p title={place.note}>{place.note}</p>}
                <div className={styles.placeLinks}>
                  <button
                    className="textButton"
                    disabled={saving}
                    onClick={() => setEditing({ ...place, dayId })}
                  >
                    <Pencil size={13} />
                    编辑
                  </button>
                  <button
                    className="textButton"
                    disabled={saving}
                    aria-expanded={moving === place.id}
                    aria-label={'移动' + place.name}
                    onClick={() =>
                      setMoving(moving === place.id ? null : place.id)
                    }
                  >
                    移动
                  </button>
                  <ActionMenu label={place.name + '的更多操作'}>
                    <button
                      className="textButton"
                      disabled={saving}
                      onClick={() =>
                        openAdd({ dayId, beforePlaceId: place.id })
                      }
                    >
                      <Plus size={14} />
                      在此前添加
                    </button>
                    <button
                      className="textButton"
                      disabled={saving}
                      onClick={() =>
                        openAdd({
                          dayId,
                          beforePlaceId: places[index + 1]?.id ?? null,
                        })
                      }
                    >
                      <Plus size={14} />
                      在此后添加
                    </button>
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
                    <button
                      className="textButton dangerText"
                      disabled={saving}
                      aria-label={'删除' + place.name}
                      onClick={() => deletePlace(place)}
                    >
                      <Trash2 size={14} />
                      删除地点
                    </button>
                  </ActionMenu>
                </div>
                {moving === place.id && (
                  <div className={styles.placeTools}>
                    <select
                      aria-label={'移动' + place.name + '到'}
                      value={dayId ?? 'unscheduled'}
                      disabled={saving}
                      onChange={(e) => {
                        const destination = e.target.value
                        void relocate(place.id, {
                          dayId:
                            destination === 'unscheduled' ? null : destination,
                          beforePlaceId: null,
                        }).then((ok) => {
                          if (ok) expand(destination)
                        })
                      }}
                    >
                      {trip.days.map((d, i) => (
                        <option key={d.id} value={d.id}>
                          {formatDayLabel(trip, i)}
                        </option>
                      ))}
                      <option value="unscheduled">未安排</option>
                    </select>
                    <div className={styles.iconActions}>
                      <button
                        className="iconButton"
                        disabled={saving || index === 0}
                        aria-label={'置顶' + place.name}
                        title="置顶"
                        onClick={() =>
                          void relocate(place.id, {
                            dayId,
                            beforePlaceId: places[0].id,
                          })
                        }
                      >
                        <ChevronsUp size={16} />
                      </button>
                      <button
                        className="iconButton"
                        disabled={saving || index === 0}
                        aria-label={'上移' + place.name}
                        title="上移"
                        onClick={() =>
                          void relocate(place.id, {
                            dayId,
                            beforePlaceId: places[index - 1].id,
                          })
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        className="iconButton"
                        disabled={saving || index === places.length - 1}
                        aria-label={'下移' + place.name}
                        title="下移"
                        onClick={() =>
                          void relocate(place.id, {
                            dayId,
                            beforePlaceId: places[index + 2]?.id ?? null,
                          })
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        className="iconButton"
                        disabled={saving || index === places.length - 1}
                        aria-label={'置底' + place.name}
                        title="置底"
                        onClick={() =>
                          void relocate(place.id, {
                            dayId,
                            beforePlaceId: null,
                          })
                        }
                      >
                        <ChevronsDown size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </DraggablePlace>
            {dayId && index < places.length - 1 && (
              <div className={styles.placeSegment}>
                <RouteLeg
                  tripId={trip.id}
                  day={trip.days.find((d) => d.id === dayId)!}
                  toIndex={index + 1}
                  variant="planner"
                  selected={segment === place.id}
                  onSelect={() =>
                    setSegment(segment === place.id ? null : place.id)
                  }
                />
              </div>
            )}
          </li>
        ))}
        <li>
          <DropSlot
            id={'end:' + (dayId ?? 'unscheduled')}
            target={{ dayId, beforePlaceId: null }}
            label="追加到本组末尾"
            disabled={saving}
            onAdd={() => openAdd({ dayId, beforePlaceId: null })}
          />
        </li>
      </ol>
    )
  }
  const mapControls = (
    <div className={styles.mapControls}>
      {picking ? (
        <>
          <span>选择新地点的位置</span>
          <button
            className="textButton"
            onClick={() => {
              setPicking(false)
              setPane('add')
            }}
          >
            取消选点
          </button>
        </>
      ) : (
        <>
          <span>
            {allRoutes
              ? '全程'
              : currentIndex < 0
                ? '未安排'
                : formatDayLabel(trip, currentIndex)}
          </span>
          <div className={styles.mapScope} role="group" aria-label="地图范围">
            <button
              aria-label="查看当天"
              aria-pressed={!allRoutes}
              onClick={() => setAllRoutes(false)}
            >
              当天
            </button>
            <button
              aria-label="查看全程"
              aria-pressed={allRoutes}
              onClick={() => setAllRoutes(true)}
            >
              全程
            </button>
          </div>
        </>
      )}
    </div>
  )
  const mapContent = (
    <>
      <Suspense fallback={<p className="muted">正在打开地图…</p>}>
        <TravelMap
          ref={map}
          toolbar={mapControls}
          trip={trip}
          group={mapGroup}
          onState={setMapState}
          onEdit={(place) =>
            setEditing({
              ...place,
              dayId:
                trip.days.find((d) => d.places.some((p) => p.id === place.id))
                  ?.id ?? null,
            })
          }
          onSelect={(place) => selectPlace(place, true)}
          picking={picking}
          hint={picking ? '点击地图选择新地点的位置' : undefined}
          className={styles.planMap}
          onPick={
            picking && target
              ? (point) => {
                  setPicked({
                    draft: {
                      ...newPlaceDraft(target.dayId),
                      coordinates: point,
                    },
                    target: { ...target },
                  })
                  setPicking(false)
                  setMobileMap(false)
                  setPane('add')
                }
              : undefined
          }
        />
      </Suspense>
      <p className="srOnly">
        点击地点名称或地图标记互相定位。交通仅显示已有路线。
      </p>
    </>
  )
  const addContent = target && (
    <PlanAddPanel
      trip={trip}
      target={target}
      onTarget={setTarget}
      onClose={() => {
        setTarget(null)
        setPane('map')
      }}
      onPickMap={() => {
        setPicking(true)
        setPane('map')
        if (!desktop) setMobileMap(true)
      }}
    />
  )
  return (
    <>
      <section className={styles.intro}>
        <div>
          <h1 className="srOnly">{trip.name}</h1>
          <select
            className={styles.tripSelect}
            aria-label="当前行程"
            value={trip.id}
            disabled={saving}
            onChange={(event) =>
              event.target.value === '__create_trip__'
                ? onCreateTrip()
                : void run({ type: 'selectTrip', tripId: event.target.value })
            }
          >
            {workspace?.trips.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            <option value="__create_trip__">＋ 创建行程</option>
          </select>
          <p>
            {trip.startDate ?? '日期待定'} · {trip.days.length} 天 ·{' '}
            {getGroupPlaces(trip, 'all').length} 个地点
            <span role="status">{saving ? ' · 正在保存…' : ''}</span>
          </p>
        </div>
        <div className={styles.actions}>
          <DetachedTransport trip={trip} />
          {desktop && (
            <button
              className="textButton"
              disabled={saving}
              onClick={onEditTrip}
            >
              <Pencil size={14} />
              编辑行程
            </button>
          )}
          <ActionMenu label="行程更多操作">
            {!desktop && (
              <button
                className="textButton"
                disabled={saving}
                onClick={onEditTrip}
              >
                <Pencil size={14} />
                编辑行程
              </button>
            )}
            <button
              className="textButton dangerText"
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
              删除行程
            </button>
          </ActionMenu>
          {!desktop && (
            <button
              className="secondaryButton"
              onClick={() => {
                setPane('map')
                setMobileMap(true)
              }}
            >
              <MapPin size={16} />
              查看地图
            </button>
          )}
          <button
            className="primaryButton"
            disabled={saving}
            onClick={() =>
              openAdd({
                dayId: current === 'unscheduled' ? null : current,
                beforePlaceId: null,
              })
            }
          >
            <Plus size={16} />
            添加地点
          </button>
        </div>
      </section>
      {error && (
        <TravelSaveFeedback message="行程操作未保存。" tripId={trip.id} />
      )}
      <div className={styles.workspace}>
        <div className={styles.itinerary}>
          <div className={styles.workToolbar}>
            <div className={styles.dateLocator}>
              <button
                className="iconButton"
                aria-label="上一天"
                disabled={currentIndex <= 0}
                onClick={() => locate(trip.days[currentIndex - 1].id)}
              >
                <ChevronLeft size={16} />
              </button>
              <label className="srOnly" htmlFor="plan-day-locator">
                选择日期
              </label>
              <select
                id="plan-day-locator"
                value={current}
                onChange={(e) => locate(e.target.value)}
              >
                {trip.days.map((day, index) => (
                  <option key={day.id} value={day.id}>
                    {formatDayLabel(trip, index)}
                  </option>
                ))}
                <option value="unscheduled">未安排</option>
              </select>
              <button
                className="iconButton"
                aria-label="下一天"
                disabled={
                  currentIndex < 0 || currentIndex >= trip.days.length - 1
                }
                onClick={() => locate(trip.days[currentIndex + 1].id)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              className="iconButton"
              disabled={saving}
              onClick={addDay}
              aria-label="追加一天"
              title="追加一天"
            >
              <CalendarDays size={18} />
              <Plus size={12} />
            </button>
          </div>
          <div className={styles.viewActions}>
            <div className={styles.actions}>
              <button
                className="textButton"
                onClick={() =>
                  setExpanded([...trip.days.map((d) => d.id), 'unscheduled'])
                }
              >
                全部展开
              </button>
              <button className="textButton" onClick={() => setExpanded([])}>
                全部收起
              </button>
            </div>
            <button
              className="textButton"
              disabled={!canUndo || saving}
              onClick={() => void undoMove()}
            >
              <Undo2 size={14} />
              撤销移动
            </button>
          </div>
          {message && (
            <p className={styles.feedback} role="status">
              {message}
              {!canUndo && message.startsWith('已移动')
                ? ' · 后续编辑已结束本次撤销'
                : ''}
            </p>
          )}
          <PlanDrag
            fingerprint={fingerprint}
            onMove={relocate}
            onHoverDay={(id) =>
              setTemporary((values) =>
                values.includes(id) ? values : [...values, id],
              )
            }
            onFinish={(value) => {
              setTemporary([])
              if (value) expand(value.dayId ?? 'unscheduled')
            }}
          >
            {trip.days.map((day, index) => (
              <section
                className={
                  styles.daySection +
                  (current === day.id ? ' ' + styles.currentDay : '')
                }
                id={'plan-day-' + day.id}
                key={day.id}
              >
                <DropSlot
                  id={'day:' + day.id}
                  target={{ dayId: day.id, beforePlaceId: null }}
                  label={formatDayLabel(trip, index) + '末尾'}
                  onActivate={() => locate(day.id, false)}
                  disabled={saving}
                >
                  <div className={styles.dayHeading}>
                    <button
                      className={styles.dayToggle}
                      aria-label={
                        (isOpen(day.id) ? '收起' : '展开') +
                        formatDayLabel(trip, index)
                      }
                      aria-expanded={isOpen(day.id)}
                      aria-controls={'day-body-' + day.id}
                      onClick={() =>
                        setExpanded(
                          isOpen(day.id)
                            ? expanded.filter((id) => id !== day.id)
                            : [...expanded, day.id],
                        )
                      }
                    >
                      {isOpen(day.id) ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    <h2>
                      <button
                        className={styles.daySelect}
                        aria-pressed={current === day.id}
                        onClick={() => locate(day.id, false)}
                      >
                        {formatDayLabel(trip, index)}
                      </button>
                    </h2>
                    {current === day.id && (
                      <span className={styles.currentBadge}>当前</span>
                    )}
                    <button
                      className="iconButton"
                      disabled={saving}
                      aria-label={'向第 ' + (index + 1) + ' 天添加地点'}
                      title="添加地点"
                      onClick={() =>
                        openAdd({ dayId: day.id, beforePlaceId: null })
                      }
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <PlanDaySummary trip={trip} day={day} />
                </DropSlot>
                {isOpen(day.id) && (
                  <div id={'day-body-' + day.id}>
                    {renderPlaces(day.places, day.id)}
                    <details className={styles.dayDetails}>
                      <summary>当天交通与日期操作</summary>
                      <DayRouteSummary
                        trip={trip}
                        day={day}
                        editable
                        density="compact"
                      />
                      <button
                        className="textButton dangerText"
                        disabled={saving || trip.days.length === 1}
                        onClick={() =>
                          setConfirmation({
                            title: '删除这一天',
                            message:
                              '这一天的 ' +
                              day.places.length +
                              ' 个地点会移回未安排，后面的日期会顺次前移。',
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
                    </details>
                  </div>
                )}
              </section>
            ))}
            <section
              className={
                styles.daySection +
                (current === 'unscheduled' ? ' ' + styles.currentDay : '')
              }
              id="plan-day-unscheduled"
            >
              <DropSlot
                id="day:unscheduled"
                target={{ dayId: null, beforePlaceId: null }}
                label="未安排末尾"
                onActivate={() => locate('unscheduled', false)}
                disabled={saving}
              >
                <div className={styles.dayHeading}>
                  <button
                    className={styles.dayToggle}
                    aria-label={
                      (isOpen('unscheduled') ? '收起' : '展开') + '未安排地点'
                    }
                    aria-expanded={isOpen('unscheduled')}
                    aria-controls="day-body-unscheduled"
                    onClick={() =>
                      setExpanded(
                        isOpen('unscheduled')
                          ? expanded.filter((id) => id !== 'unscheduled')
                          : [...expanded, 'unscheduled'],
                      )
                    }
                  >
                    {isOpen('unscheduled') ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                  <h2>
                    <button
                      className={styles.daySelect}
                      aria-pressed={current === 'unscheduled'}
                      onClick={() => locate('unscheduled', false)}
                    >
                      未安排地点
                    </button>
                  </h2>
                  {current === 'unscheduled' && (
                    <span className={styles.currentBadge}>当前</span>
                  )}
                  <button
                    className="iconButton"
                    disabled={saving}
                    aria-label="添加未安排地点"
                    onClick={() =>
                      openAdd({ dayId: null, beforePlaceId: null })
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <p className={styles.dayPreview}>
                  {trip.unscheduledPlaces.length} 个地点 · 可拖入某一天
                </p>
              </DropSlot>
              {isOpen('unscheduled') && (
                <div id="day-body-unscheduled">
                  {renderPlaces(trip.unscheduledPlaces, null)}
                </div>
              )}
            </section>
          </PlanDrag>
          <button
            className={styles.appendDay}
            disabled={saving}
            onClick={addDay}
          >
            <Plus size={16} />
            再添加一天
          </button>
          <RouteAttribution />
          <button
            style={{ display: 'none' }}
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
        </div>
        {desktop && (
          <aside className={styles.sidePane} aria-label="计划辅助区">
            {mapContent}
            {target && pane === 'add' && (
              <PlanAddDrawer
                onClose={() => {
                  setPane('map')
                  setTarget(null)
                }}
              >
                {addContent}
              </PlanAddDrawer>
            )}
          </aside>
        )}
      </div>
      {!desktop && target && pane === 'add' && !mobileMap && (
        <EditPanel
          title="添加地点"
          onClose={() => {
            setTarget(null)
            setPane('map')
          }}
          busy={saving}
        >
          {addContent}
        </EditPanel>
      )}
      {!desktop && mobileMap && (
        <EditPanel
          fullscreen
          title="计划地图"
          onClose={() => {
            setMobileMap(false)
            setPicking(false)
          }}
        >
          {mapContent}
        </EditPanel>
      )}
      {editing && (
        <PlaceEditor
          trip={trip}
          draft={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {picked && (
        <PlaceComposer
          mode="manual"
          initial={picked.draft}
          trip={trip}
          dayId={picked.target.dayId}
          beforePlaceId={picked.target.beforePlaceId}
          onClose={() => setPicked(null)}
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
              tripId={trip.id}
            />
          }
        />
      )}
    </>
  )
}

/** 桌面添加面板不遮断行程；返回与 Escape 优先关闭面板，内部编辑弹窗仍由原返回栈处理。 */
function PlanAddDrawer({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)
  useBackHandler(() => {
    onClose()
    return true
  })
  useEffect(() => {
    const previous = document.activeElement
    close.current?.focus()
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true })
    }
  }, [])
  return (
    <section
      className={styles.addDrawer}
      aria-label="添加地点"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !document.querySelector('dialog[open]')
        ) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className={styles.drawerHeading}>
        <h2>添加地点</h2>
        <button
          ref={close}
          className="iconButton"
          aria-label="关闭添加地点"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </section>
  )
}
