import { lazy, Suspense, useEffect, useState } from 'react'
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { Compass, Map, NotebookPen, Bookmark, Sun, Archive } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App as NativeApp } from '@capacitor/app'
import { TodayPage } from '../features/today/TodayPage'
import { PlanPage } from '../features/plan/PlanPage'
import { ErrorBoundary } from '../components/ErrorBoundary'
import styles from './App.module.css'
import { BackHandlerProvider, useBackRegistry } from '../components/BackHandler'
import { TravelProvider } from '../services/travel/TravelContext'
import { RoutesProvider } from '../services/routes/RoutesContext'

const BackupPage = lazy(() => import('../features/backup/BackupPage'))
const PlacesPage = lazy(() => import('../features/places/PlacesPage'))
const MapPage = lazy(() => import('../features/map/MapPage'))
const links = [
  { to: '/today', label: '今天', icon: Sun },
  { to: '/map', label: '地图', icon: Map },
  { to: '/plan', label: '计划', icon: NotebookPen },
  { to: '/places', label: '地点', icon: Bookmark },
]

export function App() {
  const [dataVersion, setDataVersion] = useState(0)
  const [restoredAt, setRestoredAt] = useState<string | null>(null)
  function onRestored() {
    setRestoredAt(new Date().toISOString())
    setDataVersion((value) => value + 1)
  }
  return (
    <BackHandlerProvider>
      <TravelProvider key={dataVersion}>
        <RoutesProvider>
          <AppShell onRestored={onRestored} restoredAt={restoredAt} />
        </RoutesProvider>
      </TravelProvider>
    </BackHandlerProvider>
  )
}

function AppShell({
  onRestored,
  restoredAt,
}: {
  onRestored: () => void
  restoredAt: string | null
}) {
  const backRegistry = useBackRegistry()
  const location = useLocation()
  const navigate = useNavigate()
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    // 页面返回到今天；根页面交给系统退出，不形成空白 WebView 历史页。
    const listener = NativeApp.addListener('backButton', () => {
      if (backRegistry.handle()) return
      if (location.pathname !== '/today')
        void navigate('/today', { replace: true })
      else void NativeApp.exitApp()
    })
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [location.pathname, navigate, backRegistry])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    // adjustResize 会同时改变 innerHeight，用无键盘时的高度判断遮挡。
    let expandedHeight = window.innerHeight
    const update = () => {
      const editing =
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLInputElement
      if (!editing) expandedHeight = window.innerHeight
      setKeyboardOpen(editing && expandedHeight - viewport.height > 150)
    }
    viewport.addEventListener('resize', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusout', update)
    return () => {
      viewport.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  return (
    <div className={styles.app}>
      <a
        className="skipLink"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        跳到主要内容
      </a>
      <header className={styles.header}>
        <NavLink
          to="/today"
          onClick={(event) => {
            if (backRegistry.handle()) event.preventDefault()
          }}
          className={styles.brand}
          aria-label="在途 Onway 首页"
        >
          <Compass size={30} strokeWidth={1.6} />
          <span>
            onway<span className={styles.brandChinese}>在途</span>
          </span>
        </NavLink>
        <nav
          aria-label="主导航"
          className={`${styles.nav} ${keyboardOpen ? styles.keyboardOpen : ''}`}
        >
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={(event) => {
                if (backRegistry.handle()) event.preventDefault()
              }}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/backup"
          className={styles.backupLink}
          onClick={(event) => {
            if (backRegistry.handle()) event.preventDefault()
          }}
        >
          <Archive size={17} />
          备份
        </NavLink>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>
        <ErrorBoundary key={location.pathname}>
          <Suspense
            fallback={
              <div className="loading" role="status">
                正在打开页面…
              </div>
            }
          >
            <Routes>
              <Route path="/today" element={<TodayPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/plan" element={<PlanPage />} />
              <Route path="/places" element={<PlacesPage />} />
              <Route
                path="/backup"
                element={
                  <BackupPage onRestored={onRestored} restoredAt={restoredAt} />
                }
              />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className={styles.footer}>
        <span>Onway 0.5.1</span>
      </footer>
    </div>
  )
}
