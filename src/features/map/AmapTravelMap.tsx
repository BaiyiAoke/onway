import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Expand, Minus, Plus, RefreshCw } from 'lucide-react'
import {
  AmapReloadRequired,
  fromAmapPoint,
  loadAmap,
  toAmapPoint,
  type AmapSdk,
} from '../../services/maps/amap'
import type { MapSettings } from '../../services/maps/settings'
import { formatDayLabel, getGroupPlaces } from '../../services/travel/model'
import type { Trip, TripPlace } from '../../services/travel/types'
import { useRoutes } from '../../services/routes/RoutesContext'
import { transportLines } from '../../services/routes/segmentView'
import { ROUTE_COLORS, ROUTE_HALO_COLOR } from '../../services/routes/model'
import { canUseAmap, navigateWithAmap } from '../../services/navigation/amap'
import type { MapState, TravelMapProps } from './TravelMap'
import styles from './Map.module.css'

type MapClick = {
  lnglat: { getLng: () => number; getLat: () => number }
  originEvent?: Event
}

/** 高德只负责底图和已有交通几何，查看地图不会请求新路线。 */
export default function AmapTravelMap({
  trip,
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
  settings,
}: TravelMapProps & { settings: MapSettings }) {
  const { state: routesState, segments } = useRoutes()
  const visibleRoutes = useMemo(
    () => transportLines(segments, routesState, trip, group),
    [segments, routesState, trip, group],
  )
  const container = useRef<HTMLDivElement>(null)
  const current = useRef<{ sdk: AmapSdk; map: AMap.Map } | null>(null)
  const [runtime, setRuntime] = useState<typeof current.current>(null)
  const markers = useRef<AMap.Marker[]>([])
  const lines = useRef<AMap.Polyline[]>([])
  const popup = useRef<{
    window: AMap.InfoWindow
    placeId: string
    tripId: string
  } | null>(null)
  const [state, setState] = useState<MapState>('loading')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const fitted = useRef('')
  const edit = useRef(onEdit)
  useEffect(() => {
    edit.current = onEdit
  }, [onEdit])
  const notify = useEffectEvent((value: MapState) => onState?.(value))
  useEffect(() => notify(state), [state])
  const closePopup = useCallback(() => {
    popup.current?.window.close()
    popup.current = null
  }, [])
  const showDetails = useCallback(
    (activeTrip: Trip, place: TripPlace) => {
      const target = current.current
      if (!target) return
      closePopup()
      const content = document.createElement('div')
      content.className = styles.popup
      const title = document.createElement('strong')
      title.textContent = place.name
      const day = document.createElement('span')
      const index = activeTrip.days.findIndex((item) =>
        item.places.some((p) => p.id === place.id),
      )
      day.textContent = index < 0 ? '未安排' : formatDayLabel(activeTrip, index)
      const note = document.createElement('p')
      note.textContent = place.note || '还没有添加备注'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.popupEdit
      button.textContent = '编辑地点'
      button.addEventListener('click', () => {
        closePopup()
        edit.current(place)
      })
      content.append(title, day, note, button)
      if (canUseAmap()) {
        const navigate = document.createElement('button')
        navigate.type = 'button'
        navigate.className = styles.popupNavigate
        navigate.textContent = '高德驾车导航'
        navigate.setAttribute('aria-label', '高德驾车导航到' + place.name)
        const status = document.createElement('p')
        status.className = styles.navigationMessage
        status.textContent = '从当前位置导航，路线以高德为准。'
        navigate.addEventListener('click', () => {
          navigate.disabled = true
          void navigateWithAmap(place)
            .catch((reason: unknown) => {
              if (!content.isConnected) return
              status.setAttribute('role', 'alert')
              status.textContent =
                reason instanceof Error
                  ? reason.message
                  : '打开高德失败，请重试。'
            })
            .finally(() => {
              navigate.disabled = false
            })
        })
        content.append(navigate, status)
      }
      content.addEventListener('click', (event) => event.stopPropagation())
      const info = new target.sdk.InfoWindow({
        content,
        offset: new target.sdk.Pixel(0, -22),
        closeWhenClickMap: true,
        autoMove: true,
      })
      // 官方支持 close 事件，类型包 0.0.15 尚未收录。
      info.on('close' as AMap.EventType, () => {
        if (popup.current?.window === info) popup.current = null
      })
      popup.current = { window: info, placeId: place.id, tripId: activeTrip.id }
      info.open(target.map, toAmapPoint(place.coordinates))
    },
    [closePopup],
  )
  const fit = useCallback((immediately = true) => {
    const map = current.current?.map
    if (!map) return
    const overlays = [...markers.current, ...lines.current]
    if (overlays.length)
      map.setFitView(overlays, immediately, [80, 50, 60, 70], 12)
    else map.setZoomAndCenter(3, [104, 35], immediately)
  }, [])
  const click = useEffectEvent((event: MapClick) => {
    if (!trip || state !== 'ready' || !onPick) return
    const target = event.originEvent?.target
    if (target instanceof Element && target.closest('.amap-marker, .amap-info'))
      return
    closePopup()
    onPick(fromAmapPoint(event.lnglat.getLng(), event.lnglat.getLat()))
  })
  const markerClick = useEffectEvent((activeTrip: Trip, place: TripPlace) => {
    if (picking) {
      if (state === 'ready') onPick?.(place.coordinates)
      return
    }
    onSelect?.(place)
    showDetails(activeTrip, place)
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
        if (!trip || !current.current || state !== 'ready') return
        current.current.map.setZoomAndCenter(
          13,
          toAmapPoint(place.coordinates),
          false,
          350,
        )
        showDetails(trip, place)
      },
    }),
    [closePopup, trip, state, showDetails],
  )

  useEffect(() => {
    let disposed = false
    let map: AMap.Map | undefined
    let lastDrag = -Infinity
    const fail = (text: string) => {
      if (disposed) return
      setMessage(text)
      setState('error')
    }
    const timer = window.setTimeout(
      () => fail('高德地图加载超时，请检查网络及底图设置。'),
      20000,
    )
    const offline = () =>
      fail('当前网络不可用，已保存的地点仍可编辑和调整顺序。')
    window.addEventListener('offline', offline)
    void loadAmap({
      provider: 'amap',
      amapJsKey: settings.amapJsKey,
      securityJsCode: settings.securityJsCode,
    })
      .then((sdk) => {
        if (disposed || !container.current) return
        // SDK 会随侧栏和窗口尺寸变化调整画布；类型包缺少此公开选项。
        const options: AMap.MapOptions & { resizeEnable: boolean } = {
          resizeEnable: true,
          center: [104, 35],
          zoom: 3,
          viewMode: '2D',
          mapStyle: 'amap://styles/whitesmoke',
          showBuildingBlock: false,
          rotateEnable: false,
          pitchEnable: false,
          keyboardEnable: true,
        }
        map = new sdk.Map(container.current, options)
        current.current = { sdk, map }
        fitted.current = ''
        setRuntime(current.current)
        map.on('complete', () => {
          if (disposed) return
          window.clearTimeout(timer)
          setState('ready')
          setMessage('')
        })
        map.on('dragend', () => {
          lastDrag = performance.now()
        })
        map.on('click', (event: MapClick) => {
          if (performance.now() - lastDrag > 180) click(event)
        })
      })
      .catch((reason: unknown) => {
        if (disposed) return
        window.clearTimeout(timer)
        setReload(reason instanceof AmapReloadRequired)
        fail(
          reason instanceof Error ? reason.message : '高德地图暂时无法加载。',
        )
      })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener('offline', offline)
      closePopup()
      markers.current = []
      lines.current = []
      map?.destroy()
      current.current = null
    }
  }, [settings.amapJsKey, settings.securityJsCode, attempt, closePopup])

  // 日期和地点变化只替换覆盖物，保留底图实例及已加载的瓦片。
  useEffect(() => {
    if (!runtime) return
    const places = trip ? getGroupPlaces(trip, group) : []
    const added = places.map((place, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.marker
      button.textContent = String(index + 1)
      button.setAttribute('aria-label', '查看' + place.name)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (trip) markerClick(trip, place)
      })
      return new runtime.sdk.Marker({
        map: runtime.map,
        position: toAmapPoint(place.coordinates),
        anchor: 'center',
        content: button,
        bubble: false,
      })
    })
    markers.current = added
    const opened = popup.current
    if (opened) {
      const place = places.find((item) => item.id === opened.placeId)
      if (trip?.id === opened.tripId && place) showDetails(trip, place)
      else closePopup()
    }
    return () => {
      added.forEach((marker) => marker.setMap(null))
      markers.current = []
    }
  }, [runtime, trip, group, closePopup, showDetails])
  useEffect(() => {
    if (!runtime) return
    const added = visibleRoutes.flatMap(({ entry, index, mode }) => {
      const coordinates = entry.result.geometry.coordinates
      // 只画服务返回的完整有效几何；不能把铁路或缺失坐标补成直线。
      if (
        coordinates.length < 2 ||
        coordinates.some(
          ([lng, lat]) =>
            !Number.isFinite(lng) ||
            !Number.isFinite(lat) ||
            Math.abs(lng) > 180 ||
            Math.abs(lat) > 90,
        )
      )
        return []
      const line = new runtime.sdk.Polyline({
        path: coordinates.map(([longitude, latitude]) =>
          toAmapPoint({ longitude, latitude }),
        ),
        strokeColor: ROUTE_COLORS[index % ROUTE_COLORS.length],
        strokeWeight: 4,
        isOutline: true,
        outlineColor: ROUTE_HALO_COLOR,
        borderWeight: 2,
        strokeStyle: mode === 'driving' ? 'solid' : 'dashed',
        strokeDasharray: mode === 'walking' ? [2, 6] : [10, 4],
        lineJoin: 'round',
        lineCap: 'round',
        bubble: true,
      })
      runtime.map.add(line)
      return [line]
    })
    lines.current = added
    return () => {
      added.forEach((line) => line.setMap(null))
      lines.current = []
    }
  }, [runtime, visibleRoutes])
  useEffect(() => {
    if (state !== 'ready') return
    const key = (trip?.id ?? '') + ':' + group
    if (fitted.current !== key) {
      fit()
      fitted.current = key
    }
  }, [runtime, trip?.id, group, state, fit])
  useEffect(() => {
    if (!runtime || !draft || !trip) return
    const original = getGroupPlaces(trip, 'all').find(
      (place) => place.id === draft.id,
    )
    if (
      original?.coordinates.longitude === draft.coordinates.longitude &&
      original.coordinates.latitude === draft.coordinates.latitude
    )
      return
    if (
      !Number.isFinite(draft.coordinates.longitude) ||
      !Number.isFinite(draft.coordinates.latitude)
    )
      return
    const element = document.createElement('div')
    element.className = styles.marker + ' ' + styles.temporary
    element.textContent = '+'
    element.setAttribute('aria-label', '尚未保存的地点')
    const marker = new runtime.sdk.Marker({
      map: runtime.map,
      content: element,
      anchor: 'center',
      position: toAmapPoint(draft.coordinates),
      clickable: false,
    })
    return () => marker.setMap(null)
  }, [runtime, draft, trip])

  return (
    <section
      className={
        styles.mapCard + ' ' + (picking ? styles.picking : '') + ' ' + className
      }
      aria-label="旅行地图"
    >
      <div
        ref={container}
        className={styles.canvas + ' ' + styles.amapCanvas}
      />
      {toolbar && <div className={styles.mapToolbar}>{toolbar}</div>}
      {state === 'loading' && (
        <div className={styles.loading} role="status">
          正在加载高德地图…
        </div>
      )}
      {state === 'error' && (
        <div className={styles.error} role="alert">
          <strong>高德地图暂时无法加载</strong>
          <p>{message}</p>
          <button
            className="primaryButton"
            onClick={() => {
              if (reload) {
                window.location.reload()
                return
              }
              setState('loading')
              setMessage('')
              setRuntime(null)
              setAttempt((value) => value + 1)
            }}
          >
            <RefreshCw size={15} />
            {reload ? '重新打开页面' : '重新加载'}
          </button>
        </div>
      )}
      {state === 'ready' && hint && <div className={styles.hint}>{hint}</div>}
      <button
        className={styles.fit}
        onClick={() => fit(false)}
        aria-label="显示全部地点"
        disabled={state !== 'ready'}
      >
        <Expand size={18} />
      </button>
      <div className={styles.zoomControls}>
        <button
          type="button"
          aria-label="放大"
          disabled={state !== 'ready'}
          onClick={() => current.current?.map.zoomIn()}
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="缩小"
          disabled={state !== 'ready'}
          onClick={() => current.current?.map.zoomOut()}
        >
          <Minus size={18} />
        </button>
      </div>
    </section>
  )
}
