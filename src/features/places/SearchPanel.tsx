import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, Settings2, X } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import {
  DEFAULT_SEARCH_ENDPOINT,
  placeSearch,
  type SearchPlace,
} from '../../services/search/nominatim'
import {
  getDefaultSearchSettings,
  getSearchSettings,
  saveSearchSettings,
  searchPlaces,
  subscribeSearchSettings,
  type SearchSettings,
} from '../../services/search/service'
import forms from '../travel/Travel.module.css'
import styles from './Places.module.css'

function SearchSettingsEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (settings: SearchSettings) => void
}) {
  const [settings, setSettings] = useState(getDefaultSearchSettings)
  const [baseline, setBaseline] = useState(settings)
  const [endpoint, setEndpoint] = useState(DEFAULT_SEARCH_ENDPOINT)
  const [savedEndpoint, setSavedEndpoint] = useState(DEFAULT_SEARCH_ENDPOINT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty =
    JSON.stringify(settings) !== JSON.stringify(baseline) ||
    endpoint !== savedEndpoint
  useEffect(() => {
    let active = true
    void Promise.all([getSearchSettings(), placeSearch.endpoint()])
      .then(([value, address]) => {
        if (active) {
          setSettings(value)
          setBaseline(value)
          setEndpoint(address)
          setSavedEndpoint(address)
        }
      })
      .catch(() => {
        if (active) setError('读取设置失败，可重新填写并保存。')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  async function save() {
    setSaving(true)
    setError('')
    try {
      if (
        settings.provider === 'amap' &&
        !/^[a-f\d]{32}$/i.test(settings.amapKey.trim())
      )
        throw new Error('请输入 32 位高德 Web 服务 Key。')
      await placeSearch.setEndpoint(endpoint)
      await saveSearchSettings(settings)
      onSaved(settings)
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '保存失败，输入已保留。',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <EditPanel
      title="地图服务设置"
      onClose={onClose}
      dirty={dirty}
      busy={saving}
    >
      <form
        className={forms.form}
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void save()
        }}
      >
        <label>
          搜索来源
          <select
            disabled={loading || saving}
            value={settings.provider}
            onChange={(event) =>
              setSettings({
                ...settings,
                provider: event.target.value as SearchSettings['provider'],
              })
            }
          >
            <option value="amap">高德地图</option>
            <option value="osm">OpenStreetMap（无需 Key）</option>
          </select>
        </label>
        <label>
          高德 Web 服务 Key
          <input
            type="password"
            autoComplete="off"
            value={settings.amapKey}
            disabled={loading || saving}
            onChange={(event) =>
              setSettings({ ...settings, amapKey: event.target.value })
            }
          />
        </label>
        <small>
          高德路线与城市识别共用此
          Key，独立于搜索来源。配额余量请查看高德控制台。
        </small>
        {settings.provider === 'osm' && (
          <label>
            Nominatim 服务地址
            <input
              type="url"
              required
              value={endpoint}
              disabled={loading || saving}
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </label>
        )}
        <small>查询词发送至所选服务，不自动切换。</small>
        {error && (
          <p className="formError" role="alert">
            {error}
          </p>
        )}
        <div className={forms.formActions}>
          <button
            type="button"
            className="textButton"
            disabled={loading || saving}
            onClick={() => {
              setSettings(getDefaultSearchSettings())
              setEndpoint(DEFAULT_SEARCH_ENDPOINT)
            }}
          >
            恢复默认配置
          </button>
          <button className="primaryButton" disabled={loading || saving}>
            {saving ? '保存中…' : '保存地图服务设置'}
          </button>
        </div>
      </form>
    </EditPanel>
  )
}

export function SearchPanel({
  visible = true,
  inline = false,
  onSelect,
  renderActions,
  onClose = () => {},
}: {
  visible?: boolean
  inline?: boolean
  onSelect: (place: SearchPlace) => void
  renderActions?: (place: SearchPlace) => ReactNode
  onClose?: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPlace[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)
  const [settings, setSettings] = useState(getDefaultSearchSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    let revision = 0
    async function readSettings() {
      const current = ++revision
      try {
        const value = await getSearchSettings()
        if (active && current === revision) setSettings(value)
      } catch {
        if (active && current === revision)
          setError('地图服务设置读取失败，请打开设置重新保存。')
      } finally {
        if (active && current === revision) setLoading(false)
      }
    }
    const unsubscribe = subscribeSearchSettings(() => {
      // 任一设置入口保存后同步来源；旧服务的结果和晚到响应不能混入新来源。
      request.current?.abort()
      request.current = null
      setBusy(false)
      setResults(null)
      setCached(false)
      setError('')
      setLoading(true)
      void readSettings()
    })
    void readSettings()
    return () => {
      active = false
      unsubscribe()
      request.current?.abort()
    }
  }, [])
  async function search() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setResults(null)
    try {
      const response = await searchPlaces(query, controller.signal)
      if (!controller.signal.aborted) {
        setResults(response.results)
        setCached(response.cached)
      }
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : '查询失败，请重试。',
        )
    } finally {
      if (request.current === controller) setBusy(false)
    }
  }
  if (!visible) return null
  const content = (
    <div className={styles.search}>
      <form
        className={styles.searchBar}
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <label>
          <span className="srOnly">地点或地址</span>
          <input
            autoFocus={!inline}
            type="search"
            required
            maxLength={200}
            value={query}
            onChange={(event) => {
              request.current?.abort()
              setBusy(false)
              setResults(null)
              setError('')
              setQuery(event.target.value)
            }}
            placeholder="搜索地点或地址"
          />
        </label>
        <button className="primaryButton" disabled={!query.trim() || loading}>
          <Search size={17} />
          {busy ? '重查' : '搜索'}
        </button>
      </form>
      <div className={styles.searchMeta}>
        <small>
          {settings.provider === 'amap' ? (
            <a href="https://www.amap.com/" target="_blank" rel="noreferrer">
              高德地图
            </a>
          ) : (
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              Nominatim · © OpenStreetMap
            </a>
          )}
        </small>
        <button
          className="textButton"
          onClick={() => {
            request.current?.abort()
            setBusy(false)
            setSettingsOpen(true)
          }}
        >
          <Settings2 size={14} />
          地图服务设置
        </button>
      </div>
      {busy && (
        <div className={styles.actions} role="status">
          <span className="muted">正在查询…</span>
          <button
            className="textButton"
            onClick={() => {
              request.current?.abort()
              setBusy(false)
            }}
          >
            取消查询
          </button>
        </div>
      )}
      {error && (
        <p className="formError" role="alert">
          {error}
        </p>
      )}
      {results && (
        <div className={styles.searchResults}>
          <div className={styles.searchMeta}>
            <small>
              {results.length
                ? results.length + ' 个结果' + (cached ? ' · 本地缓存' : '')
                : '未找到地点，可换个名称或输入经纬度。'}
            </small>
            <button
              className="textButton"
              aria-label="收起搜索结果"
              onClick={() => setResults(null)}
            >
              <X size={16} />
            </button>
          </div>
          {results.map((place) => (
            <article
              className={styles.searchResult}
              key={place.source?.provider + ':' + place.source?.id}
            >
              <h3>{place.name}</h3>
              <p>{place.address}</p>
              <div className={styles.actions}>
                {renderActions ? (
                  renderActions(place)
                ) : (
                  <button
                    className="secondaryButton"
                    onClick={() => onSelect(place)}
                  >
                    选择此地点
                  </button>
                )}
                <a
                  className="textButton"
                  href={place.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {place.source?.provider === 'amap' ? '高德来源' : 'OSM 来源'}
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
  return (
    <>
      {inline ? (
        content
      ) : (
        <EditPanel
          title="搜索地点"
          onClose={() => {
            request.current?.abort()
            onClose()
          }}
        >
          {content}
        </EditPanel>
      )}
      {settingsOpen && (
        <SearchSettingsEditor
          onClose={() => setSettingsOpen(false)}
          onSaved={(value) => {
            setSettings(value)
            setResults(null)
            setError('')
          }}
        />
      )}
    </>
  )
}

export function MapServiceSettingsButton() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <button
        type="button"
        className="textButton"
        onClick={() => setOpened(true)}
      >
        地图服务设置
      </button>
      {opened &&
        createPortal(
          <SearchSettingsEditor
            onClose={() => setOpened(false)}
            onSaved={() => {}}
          />,
          document.body,
        )}
    </>
  )
}
