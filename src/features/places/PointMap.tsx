import { useEffect, useEffectEvent, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { TripPlace } from '../../services/travel/types'
import type { Wgs84Point } from '../../services/routes/types'
import styles from './Places.module.css'
maplibregl.setWorkerUrl(mapWorkerUrl)

export default function PointMap({
  places,
  onSelect,
  onPick,
}: {
  places: TripPlace[]
  onSelect?: (place: TripPlace) => void
  onPick?: (point: Wgs84Point) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const pick = useEffectEvent((point: Wgs84Point) => onPick?.(point))
  const select = useEffectEvent((place: TripPlace) => onSelect?.(place))
  function fit() {
    const map = mapRef.current
    if (!map) return
    if (!places.length) {
      map.easeTo({ center: [104, 35], zoom: 3, duration: 0 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    places.forEach((place) =>
      bounds.extend([place.coordinates.longitude, place.coordinates.latitude]),
    )
    map.fitBounds(bounds, { padding: 55, maxZoom: 13, duration: 0 })
  }
  const initialFit = useEffectEvent(fit)
  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let map: maplibregl.Map | undefined
    const fail = () => {
      if (!disposed) setState('error')
    }
    const timer = window.setTimeout(fail, 15000)
    window.addEventListener('offline', fail)
    try {
      map = new maplibregl.Map({
        container: host.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [104, 35],
        zoom: 3,
        attributionControl: false,
      })
      mapRef.current = map
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
          clearTimeout(timer)
          setState('ready')
          initialFit()
        }
      })
      map.on('error', fail)
      let lastDrag = 0
      map.on('dragend', () => {
        lastDrag = performance.now()
      })
      map.on('click', (event) => {
        if (performance.now() - lastDrag > 180)
          pick({
            longitude: event.lngLat.wrap().lng,
            latitude: event.lngLat.lat,
            crs: 'WGS84',
          })
      })
    } catch {
      fail()
    }
    const observer = new ResizeObserver(() => map?.resize())
    observer.observe(host.current)
    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener('offline', fail)
      observer.disconnect()
      map?.remove()
      mapRef.current = null
    }
  }, [attempt])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = places.map((place, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = styles.marker
      button.textContent = String(index + 1)
      button.setAttribute('aria-label', '查看' + place.name)
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        select(place)
      })
      return new maplibregl.Marker({ element: button })
        .setLngLat([place.coordinates.longitude, place.coordinates.latitude])
        .addTo(map)
    })
    return () => markers.forEach((marker) => marker.remove())
  }, [places, attempt])
  return (
    <div className={styles.map}>
      <div ref={host} className={styles.canvas} />
      {state === 'ready' && (
        <button className={'secondaryButton ' + styles.fit} onClick={fit}>
          显示全部
        </button>
      )}
      {state === 'loading' && (
        <div className={styles.overlay} role="status">
          正在加载地图…
        </div>
      )}
      {state === 'error' && (
        <div className={styles.overlay} role="alert">
          <strong>地图暂时无法加载</strong>
          <span>可返回列表或手动输入坐标。</span>
          <button
            className="primaryButton"
            onClick={() => {
              setState('loading')
              setAttempt((value) => value + 1)
            }}
          >
            重新加载
          </button>
        </div>
      )}
    </div>
  )
}
