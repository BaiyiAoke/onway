import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Expand, MapPin, RefreshCw } from 'lucide-react'
import { demoPlaces } from '../../data/demo'
import styles from './Map.module.css'

// 显式打包 Worker，避免生产资源改名后默认相对路径失效。
maplibregl.setWorkerUrl(mapWorkerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

export default function MapPage() {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let map: maplibregl.Map | undefined
    const markers: maplibregl.Marker[] = []
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
        center: [102.5, 37.5],
        zoom: 5.5,
        attributionControl: false,
        locale: {
          'Map.Title': '旅行地图',
          'NavigationControl.ZoomIn': '放大',
          'NavigationControl.ZoomOut': '缩小',
          'Popup.Close': '关闭',
        },
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
      const bounds = new maplibregl.LngLatBounds()
      demoPlaces.forEach((place, index) => {
        const { longitude, latitude } = place.coordinates
        bounds.extend([longitude, latitude])
        const markerButton = document.createElement('button')
        markerButton.className = styles.marker
        markerButton.textContent = String(index + 1)
        markerButton.setAttribute('aria-label', `查看${place.name}`)
        const popupContent = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = place.name
        const detail = document.createElement('p')
        detail.textContent = `${place.subtitle} · 示例地点`
        popupContent.append(title, detail)
        markers.push(
          new maplibregl.Marker({ element: markerButton })
            .setLngLat([longitude, latitude])
            .setPopup(
              new maplibregl.Popup({ offset: 22 }).setDOMContent(popupContent),
            )
            .addTo(map!),
        )
      })
      map.fitBounds(bounds, { padding: 65, maxZoom: 9, duration: 0 })
      map.on('load', () => {
        if (!disposed) {
          window.clearTimeout(timer)
          setState('ready')
        }
      })
      map.on('error', fail)
      // 地图容器随横竖屏与导航布局变化调整，不重新创建 WebGL 实例。
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
      markers.forEach((marker) => marker.remove())
      map?.remove()
      mapRef.current = null
    }
  }, [attempt])

  function fitAll() {
    const bounds = new maplibregl.LngLatBounds()
    demoPlaces.forEach(({ coordinates: p }) =>
      bounds.extend([p.longitude, p.latitude]),
    )
    mapRef.current?.fitBounds(bounds, {
      padding: 65,
      maxZoom: 9,
      duration: 500,
    })
  }

  return (
    <div className="page">
      <div className="pageHeading">
        <div>
          <p className="eyebrow">A LITTLE PERSPECTIVE</p>
          <h1>把远方，放在眼前。</h1>
          <p className="muted">河西走廊 · 3 个示例地点 · WGS84</p>
        </div>
        <span className="tag">在线底图</span>
      </div>
      <div className={styles.layout}>
        <section className={styles.mapCard} aria-label="示例旅行地图">
          <div ref={container} className={styles.canvas} />
          {state === 'loading' && (
            <div className={styles.loading} role="status">
              正在加载地图…
            </div>
          )}
          {state === 'error' && (
            <div className={styles.error} role="alert">
              <strong>地图暂时无法加载</strong>
              <p>请检查网络。你仍然可以查看地点清单和本地备注。</p>
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
          <button
            className={styles.fit}
            onClick={fitAll}
            aria-label="显示全部地点"
            disabled={state !== 'ready'}
          >
            <Expand size={18} />
          </button>
        </section>
        <aside className={`card ${styles.places}`}>
          <p className="eyebrow">地图上的小小路标</p>
          <h2>沿途地点</h2>
          <ol>
            {demoPlaces.map((place, index) => (
              <li key={place.id}>
                <span>{index + 1}</span>
                <div>
                  <h3>{place.name}</h3>
                  <p>{place.subtitle}</p>
                </div>
                <MapPin size={16} />
              </li>
            ))}
          </ol>
          <p className={styles.note}>
            示例为城市中心近似位置。当前不提供导航、距离或驾驶时间。
          </p>
        </aside>
      </div>
    </div>
  )
}
