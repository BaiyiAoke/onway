import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import TravelMap, { type TravelMapHandle, type MapState } from './TravelMap'
import { ArrowLeft, MapPin, Pencil, X } from 'lucide-react'
import { useBackHandler } from '../../components/BackHandler'
import { GuardedLink } from '../../components/GuardedNavigation'
import { readPlanReturn } from '../travel/planReturn'
import { useTravel } from '../../services/travel/TravelContext'
import { formatDayLabel, getGroupPlaces } from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import { PlaceEditor, type PlaceDraft } from '../travel/PlaceEditor'
import { PlaceComposer } from '../places/PlaceComposer'
import { LibraryPicker } from '../places/LibraryPicker'
import { SearchPanel } from '../places/SearchPanel'
import { TravelToolbar } from '../travel/TravelToolbar'
import styles from './Map.module.css'
import { MapRouteOverview } from '../routes/MapRouteOverview'
import { RouteAttribution } from '../routes/DayRouteSummary'
type Interaction = {
  mode: 'editing' | 'picking'
  draft: PlaceDraft
} | null

function placeDraft(trip: Trip, place: TripPlace): PlaceDraft {
  return {
    ...place,
    coordinates: { ...place.coordinates },
    dayId:
      trip.days.find((day) => day.places.some((item) => item.id === place.id))
        ?.id ?? null,
  }
}

function groupLabel(trip: Trip, place: TripPlace) {
  const index = trip.days.findIndex((day) =>
    day.places.some((item) => item.id === place.id),
  )
  return index < 0 ? '未安排' : formatDayLabel(trip, index)
}

export default function MapPage() {
  const { activeTrip, status, group, setGroup } = useTravel()
  const location = useLocation()
  const navigate = useNavigate()
  const origin = readPlanReturn(location.state)
  const planReturn = origin?.tripId === activeTrip?.id ? origin : null
  const returnDayIndex =
    activeTrip?.days.findIndex((day) => day.id === planReturn?.dayId) ?? -1
  const [searchParams] = useSearchParams()
  const requestedPlaceId = searchParams.get('place')
  const mapRef = useRef<TravelMapHandle>(null)
  const [state, setState] = useState<MapState>('loading')
  const [interaction, setInteraction] = useState<Interaction>(null)
  const [composer, setComposer] = useState<'manual' | 'search' | null>(null)
  const [interactionTripId, setInteractionTripId] = useState(activeTrip?.id)
  const [libraryTarget, setLibraryTarget] = useState<{
    tripId: string
    group: string
    dayId: string | null
  } | null>(null)
  const focusedRequest = useRef('')
  const picking = interaction?.mode === 'picking'
  // 页面来源只接管系统返回；主导航仍允许直接前往其他页面。
  useBackHandler((_proceed, source) => {
    if (
      source !== 'system' ||
      !planReturn ||
      interaction ||
      composer ||
      libraryTarget
    )
      return false
    void navigate('/plan', { state: { planReturn }, replace: true })
    return true
  }, !!planReturn)

  // 行程切换后结束当前选点，避免返回旧行程时重新出现尚未保存的面板。
  if (interactionTripId !== activeTrip?.id) {
    setInteractionTripId(activeTrip?.id)
    setInteraction(null)
    setComposer(null)
  }

  // 添加面板绑定打开时的行程和日期；切换筛选后关闭，避免误加到新目标。
  if (
    libraryTarget &&
    (libraryTarget.tripId !== activeTrip?.id || libraryTarget.group !== group)
  ) {
    setLibraryTarget(null)
  }

  const visiblePlaces = activeTrip ? getGroupPlaces(activeTrip, group) : []

  function closePopup() {
    mapRef.current?.closePopup()
  }
  function pickPoint(coordinates: TripPlace['coordinates']) {
    if (!activeTrip || status !== 'ready' || interaction?.mode === 'editing')
      return
    const draft: PlaceDraft =
      interaction?.mode === 'picking'
        ? {
            ...interaction.draft,
            coordinates,
            source: undefined,
            sourceUrl: undefined,
            citycode: undefined,
            adcode: undefined,
            cityName: undefined,
            address: undefined,
          }
        : {
            id: crypto.randomUUID(),
            name: '',
            note: '',
            coordinates,
            dayId: group === 'all' || group === 'unscheduled' ? null : group,
          }
    setInteraction({ mode: 'editing', draft })
  }
  useBackHandler(() => {
    if (interaction?.mode !== 'picking') return false
    setInteraction({ ...interaction, mode: 'editing' })
    return true
  }, picking)

  useEffect(() => {
    if (!requestedPlaceId) {
      focusedRequest.current = ''
      return
    }
    if (!activeTrip || state !== 'ready') return
    const requestKey = `${activeTrip.id}:${requestedPlaceId}`
    if (focusedRequest.current === requestKey) return
    const place = getGroupPlaces(activeTrip, 'all').find(
      (item) => item.id === requestedPlaceId,
    )
    if (!place) return
    // 直接定位到目标所属日，保留当天交通上下文，不清空为全部日期。
    const targetGroup =
      activeTrip.days.find((day) =>
        day.places.some((item) => item.id === place.id),
      )?.id ?? 'unscheduled'
    if (group !== targetGroup) {
      setGroup(targetGroup)
      return
    }
    focusedRequest.current = requestKey
    mapRef.current?.focusPlace(place)
  }, [requestedPlaceId, activeTrip, group, setGroup, state])

  function focusPlace(place: TripPlace) {
    if (!activeTrip || picking || interaction) return
    if (state !== 'ready')
      setInteraction({ mode: 'editing', draft: placeDraft(activeTrip, place) })
    else {
      mapRef.current?.focusPlace(place)
      mapRef.current?.scrollIntoView()
    }
  }

  return (
    <div className="page">
      {planReturn && (
        <GuardedLink
          className={styles.returnLink}
          to="/plan"
          state={{ planReturn }}
        >
          <ArrowLeft size={16} />
          {returnDayIndex >= 0
            ? '返回第 ' + (returnDayIndex + 1) + ' 天计划'
            : planReturn.dayId === null
              ? '返回未安排计划'
              : '返回计划'}
        </GuardedLink>
      )}
      <fieldset
        className={styles.toolbarLock}
        disabled={picking}
        aria-label="行程选择与筛选"
      >
        <TravelToolbar
          compact
          heading={
            <>
              <h1>地图</h1>
              <p className="muted">
                {activeTrip
                  ? activeTrip.name +
                    ' · 当前显示 ' +
                    visiblePlaces.length +
                    ' 个地点'
                  : '未选择行程'}
              </p>
            </>
          }
          actions={<span className="tag">在线底图</span>}
        />
      </fieldset>
      {!activeTrip && status === 'ready' && (
        <div className={styles.emptyTrip}>
          <div>
            <strong>创建行程，开始在地图上选点</strong>
            <p>也可以先到“地点”收藏，不必创建行程。</p>
          </div>
          <Link className="primaryButton" to="/plan">
            去创建行程
          </Link>
        </div>
      )}
      {picking && (
        <div className={styles.pickBanner} role="status">
          <MapPin size={18} />
          <div>
            <strong>点击地图，重新选择位置</strong>
            <p>已填写的名称和备注会保留，选好后仍需保存。</p>
          </div>
          <button
            type="button"
            onClick={() =>
              interaction && setInteraction({ ...interaction, mode: 'editing' })
            }
          >
            <X size={16} />
            取消选点
          </button>
        </div>
      )}
      {!picking && activeTrip && (
        <div className={styles.searchTools}>
          <SearchPanel
            inline
            onSelect={(place) => {
              closePopup()
              setInteraction({
                mode: 'editing',
                draft: {
                  ...place,
                  id: crypto.randomUUID(),
                  dayId:
                    group === 'all' || group === 'unscheduled' ? null : group,
                },
              })
            }}
          />
          <div className={styles.addActions}>
            <button
              className="secondaryButton"
              onClick={() => setComposer('manual')}
            >
              输入坐标
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => {
                closePopup()
                setLibraryTarget({
                  tripId: activeTrip.id,
                  group,
                  dayId:
                    group === 'all' || group === 'unscheduled' ? null : group,
                })
              }}
            >
              从地点库添加
            </button>
          </div>
        </div>
      )}
      <div className={styles.layout}>
        <TravelMap
          ref={mapRef}
          trip={activeTrip}
          group={group}
          picking={picking}
          draft={interaction?.draft}
          onState={setState}
          onPick={interaction?.mode === 'editing' ? undefined : pickPoint}
          onEdit={(place) => {
            if (activeTrip)
              setInteraction({
                mode: 'editing',
                draft: placeDraft(activeTrip, place),
              })
          }}
          hint={
            activeTrip
              ? picking
                ? '点击地图，重新选择位置'
                : '点击地图空白处添加地点'
              : undefined
          }
        />
        {!picking && group !== 'unscheduled' && <MapRouteOverview />}
        <section className={'card ' + styles.places} aria-label="沿途地点">
          <h2>
            沿途地点 <span>{visiblePlaces.length}</span>
          </h2>
          {visiblePlaces.length === 0 ? (
            <div className={styles.emptyPlaces}>
              <MapPin size={25} />
              <p>
                {activeTrip
                  ? '这里还没有地点。可以点击地图添加，或换一个日期看看。'
                  : '创建行程后，你选下的地点会出现在这里。'}
              </p>
            </div>
          ) : (
            <ol>
              {visiblePlaces.map((place, index) => (
                <li key={place.id}>
                  <span className={styles.order}>{index + 1}</span>
                  <div>
                    <h3>
                      <button
                        type="button"
                        className={styles.placeName}
                        aria-label={'在地图上查看' + place.name}
                        disabled={picking}
                        onClick={() => focusPlace(place)}
                      >
                        {place.name}
                      </button>
                    </h3>
                    <p>{activeTrip && groupLabel(activeTrip, place)}</p>
                    {place.note && (
                      <p className={styles.placeNote}>{place.note}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.edit}
                    aria-label={`编辑${place.name}`}
                    disabled={picking}
                    onClick={() => {
                      if (!activeTrip) return
                      closePopup()
                      setInteraction({
                        mode: 'editing',
                        draft: placeDraft(activeTrip, place),
                      })
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {activeTrip && <RouteAttribution />}
        </section>
      </div>
      {activeTrip &&
        libraryTarget &&
        libraryTarget.tripId === activeTrip.id &&
        libraryTarget.group === group && (
          <LibraryPicker
            key={libraryTarget.tripId + ':' + libraryTarget.group}
            trip={activeTrip}
            dayId={libraryTarget.dayId}
            onClose={() => setLibraryTarget(null)}
          />
        )}
      {activeTrip && composer && (
        <PlaceComposer
          key={activeTrip.id}
          mode={composer}
          trip={activeTrip}
          dayId={group === 'all' || group === 'unscheduled' ? null : group}
          onClose={() => setComposer(null)}
        />
      )}
      {activeTrip && interaction?.mode === 'editing' && (
        <PlaceEditor
          key={interaction.draft.id}
          trip={activeTrip}
          draft={interaction.draft}
          onClose={() => setInteraction(null)}
          onPickLocation={(draft) => {
            closePopup()
            setInteraction({ mode: 'picking', draft })
          }}
        />
      )}
    </div>
  )
}
