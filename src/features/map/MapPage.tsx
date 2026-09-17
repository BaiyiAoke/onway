import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { ArrowLeft, Expand, MapPin, Pencil, RefreshCw, X } from 'lucide-react'
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
import { useRoutes } from '../../services/routes/RoutesContext'
import { transportLines } from '../../services/routes/segmentView'
import { ROUTE_COLORS, ROUTE_HALO_COLOR } from '../../services/routes/model'
import { MapRouteOverview } from '../routes/MapRouteOverview'
import { RouteAttribution } from '../routes/DayRouteSummary'
import { canUseAmap, navigateWithAmap } from '../../services/navigation/amap'

// 显式打包 Worker，避免生产资源改名后默认相对路径失效。
maplibregl.setWorkerUrl(mapWorkerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
type MapState = 'loading' | 'ready' | 'error'
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
  const { state: routesState, segments } = useRoutes()
  const visibleRoutes = useMemo(
    () => transportLines(segments, routesState, activeTrip, group),
    [segments, routesState, activeTrip, group],
  )
  const [searchParams] = useSearchParams()
  const requestedPlaceId = searchParams.get('place')
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<{
    popup: maplibregl.Popup
    placeId: string
    tripId: string
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
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
  const fittedTrip = useRef<string | undefined>(undefined)
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
    popupRef.current?.popup.remove()
    popupRef.current = null
  }

  const showDetails = useCallback((trip: Trip, place: TripPlace) => {
    const map = mapRef.current
    if (!map) return
    popupRef.current?.popup.remove()
    const content = document.createElement('div')
    content.className = styles.popup
    const title = document.createElement('strong')
    title.textContent = place.name
    const category = document.createElement('span')
    category.textContent = groupLabel(trip, place)
    const note = document.createElement('p')
    note.textContent = place.note || '还没有添加备注'
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.textContent = '编辑地点'
    edit.className = styles.popupEdit
    edit.addEventListener('click', (event) => {
      event.stopPropagation()
      popupRef.current?.popup.remove()
      popupRef.current = null
      setInteraction({ mode: 'editing', draft: placeDraft(trip, place) })
    })
    content.append(title, category, note, edit)
    if (canUseAmap()) {
      const navigate = document.createElement('button')
      navigate.type = 'button'
      navigate.textContent = '高德驾车导航'
      navigate.className = styles.popupNavigate
      navigate.setAttribute('aria-label', '高德驾车导航到' + place.name)
      const message = document.createElement('p')
      message.className = styles.navigationMessage
      message.textContent = '从当前位置导航，路线以高德为准。'
      navigate.addEventListener('click', (event) => {
        event.stopPropagation()
        navigate.disabled = true
        void navigateWithAmap(place)
          .catch((reason: unknown) => {
            if (!content.isConnected) return
            message.setAttribute('role', 'alert')
            message.textContent =
              reason instanceof Error
                ? reason.message
                : '打开高德失败，请重试。'
          })
          .finally(() => {
            navigate.disabled = false
          })
      })
      content.append(navigate, message)
    }
    // 弹窗和地点标记的点击不能继续冒泡为地图新增地点。
    content.addEventListener('click', (event) => event.stopPropagation())
    const popup = new maplibregl.Popup({ offset: 24, maxWidth: '280px' })
      .setLngLat([place.coordinates.longitude, place.coordinates.latitude])
      .setDOMContent(content)
      .addTo(map)
    popup.on('close', () => {
      if (popupRef.current?.popup === popup) popupRef.current = null
    })
    popupRef.current = { popup, placeId: place.id, tripId: trip.id }
  }, [])

  const fitCurrent = useEffectEvent((duration = 0) => {
    const map = mapRef.current
    if (!map) return
    const places = activeTrip ? getGroupPlaces(activeTrip, group) : []
    if (places.length === 0) {
      map.easeTo({ center: [104, 35], zoom: 3, duration })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    places.forEach(({ coordinates }) =>
      bounds.extend([coordinates.longitude, coordinates.latitude]),
    )
    visibleRoutes.forEach(({ entry }) =>
      entry.result.geometry.coordinates.forEach((point) =>
        bounds.extend(point),
      ),
    )
    map.fitBounds(bounds, { padding: 65, maxZoom: 12, duration })
  })

  const handleMapClick = useEffectEvent((event: maplibregl.MapMouseEvent) => {
    // 底图未就绪时不接收新坐标，避免空白或失败画布产生误选点。
    if (
      !activeTrip ||
      status !== 'ready' ||
      state !== 'ready' ||
      interaction?.mode === 'editing'
    )
      return
    const target = event.originalEvent.target
    if (
      target instanceof Element &&
      target.closest('.maplibregl-marker, .maplibregl-popup')
    )
      return
    closePopup()
    const coordinates = {
      longitude: ((((event.lngLat.lng + 180) % 360) + 360) % 360) - 180,
      latitude: event.lngLat.lat,
      crs: 'WGS84' as const,
    }
    const draft: PlaceDraft =
      interaction?.mode === 'picking'
        ? {
            ...interaction.draft,
            coordinates,
            sourceUrl: undefined,
            source: undefined,
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
  })

  const handleMarkerClick = useEffectEvent((trip: Trip, place: TripPlace) => {
    if (interaction?.mode === 'picking') {
      if (state !== 'ready') return
      setInteraction({
        mode: 'editing',
        draft: {
          ...interaction.draft,
          coordinates: { ...place.coordinates },
          sourceUrl: undefined,
        },
      })
      return
    }
    if (!interaction) showDetails(trip, place)
  })

  useBackHandler(() => {
    if (interaction?.mode !== 'picking') return false
    setInteraction({ ...interaction, mode: 'editing' })
    return true
  }, picking)

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let map: maplibregl.Map | undefined
    let lastDrag = -Infinity
    const timer = window.setTimeout(() => {
      if (!disposed) setState('error')
    }, 20000)
    const fail = () => {
      if (!disposed) setState('error')
    }
    window.addEventListener('offline', fail)
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: [104, 35],
        zoom: 3,
        attributionControl: false,
        clickTolerance: 4,
        locale: {
          'Map.Title': '旅行地图',
          'NavigationControl.ZoomIn': '放大',
          'NavigationControl.ZoomOut': '缩小',
          'Popup.Close': '关闭',
        },
      })
      mapRef.current = map
      fittedTrip.current = undefined
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-left',
      )
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        'bottom-right',
      )
      map.on('load', () => {
        if (!disposed) {
          window.clearTimeout(timer)
          setState('ready')
          fitCurrent()
        }
      })
      map.on('error', fail)
      map.on('dragend', () => {
        lastDrag = performance.now()
      })
      map.on('click', (event) => {
        if (performance.now() - lastDrag > 180) handleMapClick(event)
      })
    } catch {
      fail()
    }
    const observer = new ResizeObserver(() => map?.resize())
    observer.observe(container.current)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener('offline', fail)
      observer.disconnect()
      popupRef.current?.popup.remove()
      popupRef.current = null
      map?.remove()
      mapRef.current = null
    }
  }, [attempt])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const places = activeTrip ? getGroupPlaces(activeTrip, group) : []
    // 只更新标记；编辑、分天及行程切换均保留同一个地图实例。
    const markers = places.map((place, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.marker
      button.textContent = String(index + 1)
      button.setAttribute('aria-label', `查看${place.name}`)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (activeTrip) handleMarkerClick(activeTrip, place)
      })
      return new maplibregl.Marker({ element: button })
        .setLngLat([place.coordinates.longitude, place.coordinates.latitude])
        .addTo(map)
    })
    const opened = popupRef.current
    if (opened) {
      const currentPlace = places.find((place) => place.id === opened.placeId)
      if (activeTrip?.id === opened.tripId && currentPlace)
        showDetails(activeTrip, currentPlace)
      else closePopup()
    }
    return () => markers.forEach((marker) => marker.remove())
  }, [activeTrip, group, attempt, showDetails])

  // 只更新 GeoJSON 数据，不因路线重算或筛选而重建底图。
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource<maplibregl.GeoJSONSource>(
      'onway-driving-routes',
    )
    if (!source && state !== 'ready') return
    let active = true
    const data = {
      type: 'FeatureCollection' as const,
      features: visibleRoutes.map(({ entry, index, mode }) => ({
        type: 'Feature' as const,
        properties: { color: ROUTE_COLORS[index % ROUTE_COLORS.length], mode },
        geometry: entry.result.geometry,
      })),
    }
    if (source)
      void source.setData(data).catch(() => {
        if (active) setState('error')
      })
    else {
      map.addSource('onway-driving-routes', { type: 'geojson', data })
      map.addLayer({
        id: 'onway-route-outline',
        type: 'line',
        source: 'onway-driving-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_HALO_COLOR,
          'line-width': 8,
          'line-opacity': 0.8,
        },
      })
      map.addLayer({
        id: 'onway-route-line',
        type: 'line',
        source: 'onway-driving-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-dasharray': [
            'case',
            ['==', ['get', 'mode'], 'walking'],
            ['literal', [1, 2]],
            ['==', ['get', 'mode'], 'driving'],
            ['literal', [1, 0]],
            ['literal', [3, 1]],
          ],
        },
      })
    }
    return () => {
      active = false
    }
  }, [visibleRoutes, state, attempt])

  useEffect(() => {
    if (state !== 'ready') return
    const tripId = `${activeTrip?.id ?? ''}:${group}`
    if (fittedTrip.current !== tripId) {
      fitCurrent()
      fittedTrip.current = tripId
    }
  }, [activeTrip?.id, group, state, attempt])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !interaction || !activeTrip) return
    const original = getGroupPlaces(activeTrip, 'all').find(
      (place) => place.id === interaction.draft.id,
    )
    const { longitude, latitude } = interaction.draft.coordinates
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
    if (
      original?.coordinates.longitude === longitude &&
      original.coordinates.latitude === latitude
    )
      return
    const element = document.createElement('div')
    element.className = `${styles.marker} ${styles.temporary}`
    element.textContent = '+'
    element.setAttribute('aria-label', '尚未保存的地点')
    const marker = new maplibregl.Marker({ element })
      .setLngLat([longitude, latitude])
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [interaction, activeTrip, attempt])

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
    showDetails(activeTrip, place)
    mapRef.current?.easeTo({
      center: [place.coordinates.longitude, place.coordinates.latitude],
      zoom: 11,
      duration: 0,
    })
  }, [requestedPlaceId, activeTrip, group, setGroup, state, showDetails])

  function focusPlace(place: TripPlace) {
    if (!activeTrip || picking || interaction) return
    closePopup()
    if (state !== 'ready' || !mapRef.current) {
      // 底图不可用时，名称入口仍能打开本地资料，独立编辑按钮也始终保留。
      setInteraction({ mode: 'editing', draft: placeDraft(activeTrip, place) })
      return
    }
    mapRef.current.easeTo({
      center: [place.coordinates.longitude, place.coordinates.latitude],
      zoom: 13,
      duration: 400,
    })
    showDetails(activeTrip, place)
    container.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }

  function fitAll() {
    const map = mapRef.current
    if (!map) return
    if (!visiblePlaces.length) {
      map.easeTo({ center: [104, 35], zoom: 3, duration: 0 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    visiblePlaces.forEach(({ coordinates }) =>
      bounds.extend([coordinates.longitude, coordinates.latitude]),
    )
    visibleRoutes.forEach(({ entry }) =>
      entry.result.geometry.coordinates.forEach((point) =>
        bounds.extend(point),
      ),
    )
    map.fitBounds(bounds, { padding: 65, maxZoom: 12, duration: 400 })
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
        <section
          className={`${styles.mapCard} ${picking ? styles.picking : ''}`}
          aria-label="旅行地图"
        >
          <div ref={container} className={styles.canvas} />
          {state === 'loading' && (
            <div className={styles.loading} role="status">
              正在加载地图…
            </div>
          )}
          {state === 'error' && (
            <div className={styles.error} role="alert">
              <strong>地图暂时无法加载</strong>
              <p>请检查网络。你仍然可以在下方清单编辑已保存的地点。</p>
              <button
                className="primaryButton"
                onClick={() => {
                  setState('loading')
                  setAttempt((value) => value + 1)
                }}
              >
                <RefreshCw size={15} />
                重新加载
              </button>
            </div>
          )}
          {state === 'ready' && activeTrip && !picking && (
            <div className={styles.hint}>点击地图空白处添加地点</div>
          )}
          <button
            className={styles.fit}
            onClick={fitAll}
            aria-label="显示全部地点"
            disabled={state !== 'ready'}
          >
            <Expand size={18} />
          </button>
        </section>
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
