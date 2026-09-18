import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Expand, RefreshCw } from 'lucide-react'
import { formatDayLabel, getGroupPlaces } from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import type { Wgs84Point } from '../../services/routes/types'
import { useRoutes } from '../../services/routes/RoutesContext'
import { transportLines } from '../../services/routes/segmentView'
import { ROUTE_COLORS, ROUTE_HALO_COLOR } from '../../services/routes/model'
import { canUseAmap, navigateWithAmap } from '../../services/navigation/amap'
import styles from './Map.module.css'

maplibregl.setWorkerUrl(mapWorkerUrl)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
export type MapState = 'loading' | 'ready' | 'error'
export interface TravelMapHandle {
  focusPlace: (place: TripPlace) => void
  closePopup: () => void
  scrollIntoView: () => void
}
export interface TravelMapProps {
  trip: Trip | null
  group: string
  onEdit: (place: TripPlace) => void
  onSelect?: (place: TripPlace) => void
  onPick?: (point: Wgs84Point) => void
  onState?: (state: MapState) => void
  draft?: TripPlace
  picking?: boolean
  hint?: string
  toolbar?: ReactNode
  className?: string
  ref?: Ref<TravelMapHandle>
}
function groupLabel(trip: Trip, place: TripPlace) {
  const index = trip.days.findIndex((day) =>
    day.places.some((item) => item.id === place.id),
  )
  return index < 0 ? '未安排' : formatDayLabel(trip, index)
}

/** 共用地图只负责可视化；是否接受选点由页面显式授权，普通浏览不新增地点。 */
export default function TravelMap({
  trip: activeTrip,
  group,
  onEdit,
  onSelect,
  onPick,
  onState,
  draft,
  picking = false,
  hint,
  toolbar,
  className = '',
  ref,
}: TravelMapProps) {
  const { state: routesState, segments } = useRoutes()
  const visibleRoutes = useMemo(
    () => transportLines(segments, routesState, activeTrip, group),
    [segments, routesState, activeTrip, group],
  )
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<{
    popup: maplibregl.Popup
    placeId: string
    tripId: string
  } | null>(null)
  const fittedTrip = useRef<string | undefined>(undefined)
  const [state, setState] = useState<MapState>('loading')
  const [attempt, setAttempt] = useState(0)
  const editHandler = useRef(onEdit)
  useEffect(() => {
    editHandler.current = onEdit
  }, [onEdit])
  const notifyState = useEffectEvent((next: MapState) => onState?.(next))
  useEffect(() => notifyState(state), [state])
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
      editHandler.current(place)
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
    if (!activeTrip || state !== 'ready' || !onPick) return
    const target = event.originalEvent.target
    if (
      target instanceof Element &&
      target.closest('.maplibregl-marker, .maplibregl-popup')
    )
      return
    closePopup()
    onPick({
      longitude: ((((event.lngLat.lng + 180) % 360) + 360) % 360) - 180,
      latitude: event.lngLat.lat,
      crs: 'WGS84',
    })
  })
  const handleMarkerClick = useEffectEvent((trip: Trip, place: TripPlace) => {
    if (picking) {
      if (state === 'ready') onPick?.(place.coordinates)
      return
    }
    onSelect?.(place)
    showDetails(trip, place)
  })
  useImperativeHandle(
    ref,
    () => ({
      closePopup,
      scrollIntoView: () =>
        container.current?.scrollIntoView?.({
          block: 'center',
          behavior: 'smooth',
        }),
      focusPlace(place) {
        if (!activeTrip || !mapRef.current || state !== 'ready') return
        mapRef.current.easeTo({
          center: [place.coordinates.longitude, place.coordinates.latitude],
          zoom: 13,
          duration: 350,
        })
        showDetails(activeTrip, place)
      },
    }),
    [activeTrip, state, showDetails],
  )
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
    if (!map || !draft || !activeTrip) return
    const original = getGroupPlaces(activeTrip, 'all').find(
      (place) => place.id === draft.id,
    )
    const { longitude, latitude } = draft.coordinates
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
  }, [draft, activeTrip, attempt])

  function fitAll() {
    const places = activeTrip ? getGroupPlaces(activeTrip, group) : []
    const map = mapRef.current
    if (!map) return
    if (!places.length) {
      map.easeTo({ center: [104, 35], zoom: 3, duration: 0 })
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
    map.fitBounds(bounds, { padding: 65, maxZoom: 12, duration: 400 })
  }

  return (
    <section
      className={
        styles.mapCard + ' ' + (picking ? styles.picking : '') + ' ' + className
      }
      aria-label="旅行地图"
    >
      <div ref={container} className={styles.canvas} />
      {toolbar && <div className={styles.mapToolbar}>{toolbar}</div>}
      {state === 'loading' && (
        <div className={styles.loading} role="status">
          正在加载地图…
        </div>
      )}
      {state === 'error' && (
        <div className={styles.error} role="alert">
          <strong>地图暂时无法加载</strong>
          <p>请检查网络。已保存的地点仍可编辑和调整顺序。</p>
          <button
            className="primaryButton"
            onClick={() => {
              setState('loading')
              setAttempt((v) => v + 1)
            }}
          >
            <RefreshCw size={15} />
            重新加载
          </button>
        </div>
      )}
      {state === 'ready' && hint && <div className={styles.hint}>{hint}</div>}
      <button
        className={styles.fit}
        onClick={() => fitAll()}
        aria-label="显示全部地点"
        disabled={state !== 'ready'}
      >
        <Expand size={18} />
      </button>
    </section>
  )
}
