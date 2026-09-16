import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { EditPanel } from '../../components/EditPanel'
import { useBackHandler } from '../../components/BackHandler'
import { useRoutes } from '../../services/routes/RoutesContext'
import { useTravel } from '../../services/travel/TravelContext'
import {
  BackupRepository,
  type RestorePreview,
} from '../../services/backup/repository'
import {
  backupFilename,
  serializeBackup,
  summarize,
} from '../../services/backup/model'
import { pickBackupFile, saveBackupFile } from '../../services/backup/files'
import styles from './Backup.module.css'
export default function BackupPage({
  onRestored,
  restoredAt,
}: {
  onRestored: () => void
  restoredAt: string | null
}) {
  const [repository] = useState(() => new BackupRepository())
  const { workspace, saving } = useTravel()
  const routes = useRoutes()
  const [preview, setPreview] = useState<RestorePreview | null>(null)
  const [filename, setFilename] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useBackHandler(() => true, busy)
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试。')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  async function exportData() {
    const document = await repository.export()
    const result = await saveBackupFile(
      backupFilename(document),
      serializeBackup(document),
    )
    setMessage(
      result === 'saved'
        ? '备份文件已保存。'
        : result === 'download'
          ? '已发起下载，请确认文件已保存。'
          : '已取消导出。',
    )
  }
  async function choose() {
    const file = await pickBackupFile()
    if (file.cancelled) return
    if (file.text === undefined) throw new Error('未读取到文件内容。')
    const next = await repository.preview(file.text)
    setPreview(next)
    setFilename(file.name ?? 'Onway 备份')
    setConfirmed(false)
  }
  async function restore() {
    if (!preview || !confirmed) return
    routes.cancelPending()
    await repository.restore(preview)
    // 重建数据 Provider，不刷新网页资源；已打开的 Web 在断网时也能继续使用。
    onRestored()
  }
  const current = workspace ? summarize(workspace) : null
  const incoming = preview && summarize(preview.document.workspace)
  const replaced = preview?.current && summarize(preview.current.workspace)
  return (
    <div className={'page ' + styles.page}>
      <div className="pageHeading">
        <div>
          <h1>备份与恢复</h1>
          <p className="muted">在电脑和手机之间转移本地数据。</p>
        </div>
      </div>
      {restoredAt && (
        <p role="status" className={styles.success}>
          已恢复备份 · {new Date(restoredAt).toLocaleTimeString('zh-CN')}
          。路线可按天重新计算。
        </p>
      )}
      {!preview && error && (
        <p role="alert" className="formError">
          {error}
        </p>
      )}
      {!preview && message && <p role="status">{message}</p>}
      <div className={styles.grid}>
        <section className="card">
          <h2>导出备份</h2>
          <p className="muted">包含行程、地点顺序、地点库、分类和个人备注。</p>
          {current && (
            <p>
              {current.trips} 个行程 · {current.libraryPlaces} 个收藏地点 ·{' '}
              {current.tripPlaces} 个行程地点
            </p>
          )}
          <button
            className="primaryButton"
            disabled={busy || saving}
            onClick={() => void perform(exportData)}
          >
            <Download size={17} />
            导出备份
          </button>
        </section>
        <section className="card">
          <h2>从文件恢复</h2>
          <p className="muted">
            选择 Onway JSON 文件，核对后整体替换当前数据。
          </p>
          <button
            className="secondaryButton"
            disabled={busy || saving}
            onClick={() => void perform(choose)}
          >
            <Upload size={17} />
            选择备份文件
          </button>
        </section>
      </div>
      <p className={'muted ' + styles.hint}>
        搜索设置和 Key 留在当前设备。文件不包含搜索与路线缓存，最大 20 MB。
      </p>
      {busy && !preview && <p role="status">正在处理文件…</p>}
      {preview && incoming && (
        <EditPanel
          title="确认恢复备份"
          busy={busy}
          onClose={() => {
            setPreview(null)
            setError('')
            setMessage('')
            setConfirmed(false)
          }}
        >
          <div className={styles.preview}>
            <p className={styles.filename}>{filename}</p>
            <p className="muted">
              导出时间：
              {new Date(preview.document.exportedAt).toLocaleString('zh-CN')}
            </p>
            <table>
              <thead>
                <tr>
                  <th scope="col">数据</th>
                  <th scope="col">当前</th>
                  <th scope="col">备份</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">行程</th>
                  <td>{replaced?.trips ?? '未知'}</td>
                  <td>{incoming.trips}</td>
                </tr>
                <tr>
                  <th scope="row">行程地点</th>
                  <td>{replaced?.tripPlaces ?? '未知'}</td>
                  <td>{incoming.tripPlaces}</td>
                </tr>
                <tr>
                  <th scope="row">收藏地点</th>
                  <td>{replaced?.libraryPlaces ?? '未知'}</td>
                  <td>{incoming.libraryPlaces}</td>
                </tr>
                <tr>
                  <th scope="row">自定义分类</th>
                  <td>{replaced?.customCategories ?? '未知'}</td>
                  <td>{incoming.customCategories}</td>
                </tr>
                <tr>
                  <th scope="row">个人备注</th>
                  <td>
                    {preview.current
                      ? preview.current.personalNote.length + ' 字'
                      : '未知'}
                  </td>
                  <td>{preview.document.personalNote.length} 字</td>
                </tr>
              </tbody>
            </table>
            {!preview.current && (
              <p role="alert" className="formError">
                当前旅行数据无法解析，恢复会将它替换。
              </p>
            )}
            <p>
              恢复会替换所有行程、收藏地点、分类与个人备注，并清空已计算路线。搜索设置不变。
            </p>
            <button
              className="secondaryButton"
              disabled={busy}
              onClick={() => void perform(exportData)}
            >
              先备份当前数据
            </button>
            {message && <p role="status">{message}</p>}
            <label className={styles.confirm}>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              我确认用此备份替换当前数据
            </label>
            {error && (
              <div role="alert" className="formError">
                <p>{error}</p>
                <button
                  className="secondaryButton"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setPreview(
                        await repository.preview(
                          serializeBackup(preview.document),
                        ),
                      )
                      setConfirmed(false)
                    })
                  }
                >
                  重新读取预览
                </button>
              </div>
            )}
            <div className={styles.actions}>
              <button
                className="secondaryButton"
                disabled={busy}
                onClick={() => {
                  setPreview(null)
                  setError('')
                  setMessage('')
                }}
              >
                取消
              </button>
              <button
                className="dangerButton"
                disabled={busy || !confirmed || saving}
                onClick={() => void perform(restore)}
              >
                {busy ? '处理中…' : '确认覆盖并恢复'}
              </button>
            </div>
          </div>
        </EditPanel>
      )}
    </div>
  )
}
