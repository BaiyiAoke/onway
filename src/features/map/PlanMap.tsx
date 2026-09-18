import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import {
  getDefaultMapSettings,
  getMapSettings,
  saveMapSettings,
  type MapSettings,
} from '../../services/maps/settings'
import type { TravelMapProps } from './TravelMap'
import forms from '../travel/Travel.module.css'
import styles from './Map.module.css'

const OpenMap = lazy(() => import('./TravelMap'))
const Amap = lazy(() => import('./AmapTravelMap'))

function MapSettingsEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: MapSettings
  onClose: () => void
  onSaved: (settings: MapSettings) => void
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true)
    setError('')
    try {
      onSaved(await saveMapSettings(value))
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '保存失败，输入已保留。',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <EditPanel
      title="计划页底图设置"
      onClose={onClose}
      busy={busy}
      dirty={JSON.stringify(value) !== JSON.stringify(initial)}
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
          底图来源
          <select
            disabled={busy}
            value={value.provider}
            onChange={(event) =>
              setValue({
                ...value,
                provider: event.target.value as MapSettings['provider'],
              })
            }
          >
            <option value="amap">高德地图</option>
            <option value="openfreemap">OpenFreeMap（无需 Key）</option>
          </select>
        </label>
        <label>
          高德 Web 端（JS API）Key
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={value.amapJsKey}
            onChange={(event) =>
              setValue({ ...value, amapJsKey: event.target.value })
            }
          />
        </label>
        <label>
          安全密钥 securityJsCode
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={value.securityJsCode}
            onChange={(event) =>
              setValue({ ...value, securityJsCode: event.target.value })
            }
          />
        </label>
        <small>
          在高德控制台创建“Web 端（JS
          API）”Key，并填写它对应的安全密钥。搜索和算路继续使用原来的 Web 服务
          Key。
        </small>
        <small>
          仅保存在当前设备，不随备份导出。已加载高德后更换密钥，需要重新打开页面。
        </small>
        <a
          className="textButton"
          href="https://lbs.amap.com/api/javascript-api-v2/prerequisites"
          target="_blank"
          rel="noreferrer"
        >
          查看高德配置说明
        </a>
        {error && (
          <p className="formError" role="alert">
            {error}
          </p>
        )}
        <div className={forms.formActions}>
          <button
            type="button"
            className="secondaryButton"
            disabled={busy}
            onClick={() => setValue(getDefaultMapSettings())}
          >
            恢复默认配置
          </button>
          <button className="primaryButton" disabled={busy}>
            {busy ? '保存中…' : '保存底图设置'}
          </button>
        </div>
      </form>
    </EditPanel>
  )
}

/** 按设备配置懒加载一种底图，避免同时下载两个地图引擎。 */
export default function PlanMap(props: TravelMapProps) {
  const [settings, setSettings] = useState<MapSettings | null>(null)
  const [error, setError] = useState('')
  const [opened, setOpened] = useState(false)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    const baseline = revision.current
    void getMapSettings()
      .then((value) => {
        if (active && revision.current === baseline) setSettings(value)
      })
      .catch(() => {
        if (active && revision.current === baseline)
          setError('底图设置读取失败，请重新设置。')
      })
    return () => {
      active = false
    }
  }, [])
  const loading = (
    <section
      className={styles.mapCard + ' ' + (props.className ?? '')}
      aria-label="旅行地图"
    >
      <p className={styles.loading} role={error ? 'alert' : 'status'}>
        {error || '正在打开地图…'}
      </p>
    </section>
  )
  return (
    <div className={styles.providerMap}>
      <Suspense fallback={loading}>
        {!settings ? (
          loading
        ) : settings.provider === 'amap' ? (
          <Amap
            key={settings.amapJsKey + settings.securityJsCode}
            {...props}
            settings={settings}
          />
        ) : (
          <OpenMap {...props} />
        )}
      </Suspense>
      <button
        className={styles.providerSettings}
        type="button"
        title={
          '底图设置 · ' +
          (settings?.provider === 'amap' ? '高德地图' : 'OpenFreeMap')
        }
        aria-label="底图设置"
        onClick={() => setOpened(true)}
      >
        <Settings2 size={18} />
      </button>
      {opened && (
        <MapSettingsEditor
          initial={settings ?? getDefaultMapSettings()}
          onClose={() => setOpened(false)}
          onSaved={(value) => {
            revision.current++
            setSettings(value)
            setError('')
          }}
        />
      )}
    </div>
  )
}
