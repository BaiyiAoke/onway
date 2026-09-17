import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, Save } from 'lucide-react'
import { getLocalStore } from '../../services/storage'
import {
  isAtomicStore,
  RESTORE_EPOCH_KEY,
  type StoreSnapshot,
} from '../../services/storage/atomic'
import { useBackHandler } from '../../components/BackHandler'
import { EditPanel } from '../../components/EditPanel'
import { NOTE_KEY, type LocalStore } from '../../services/storage/types'
import styles from './Today.module.css'

export function NoteEditor({
  loadStore = getLocalStore,
}: {
  loadStore?: () => Promise<LocalStore>
}) {
  const [note, setNote] = useState('')
  const [savedNote, setSavedNote] = useState('')
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'saving' | 'saved' | 'loadError' | 'saveError'
  >('loading')
  const [retry, setRetry] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const pendingNavigation = useRef<(() => void) | null>(null)
  const storeRef = useRef<LocalStore | null>(null)
  const snapshotRef = useRef<StoreSnapshot | null>(null)
  const [saveError, setSaveError] = useState('')
  const dirty = note !== savedNote

  // 保留原导航目的地，确认后继续同一次操作；保存失败或恢复冲突时留在草稿。
  useBackHandler(
    (proceed) => {
      if (status !== 'saving') {
        pendingNavigation.current = proceed ?? null
        setConfirmDiscard(true)
      }
      return true
    },
    dirty || status === 'saving',
  )

  useEffect(() => {
    let active = true
    loadStore()
      .then(async (store) => {
        await store.initialize()
        const snapshot = isAtomicStore(store)
          ? await store.readBatch([NOTE_KEY, RESTORE_EPOCH_KEY])
          : null
        const stored =
          (snapshot ? snapshot[NOTE_KEY] : await store.get(NOTE_KEY)) ?? ''
        if (active) {
          storeRef.current = store
          snapshotRef.current = snapshot
          setNote(stored)
          setSavedNote(stored)
          setStatus('ready')
        }
      })
      .catch(() => {
        if (active) setStatus('loadError')
      })
    return () => {
      active = false
    }
  }, [loadStore, retry])

  async function save() {
    if (!storeRef.current || status === 'saving') return false
    setStatus('saving')
    try {
      if (isAtomicStore(storeRef.current) && snapshotRef.current) {
        await storeRef.current.writeBatch(
          { [NOTE_KEY]: note },
          snapshotRef.current,
        )
        snapshotRef.current = { ...snapshotRef.current, [NOTE_KEY]: note }
      } else await storeRef.current.set(NOTE_KEY, note)
      setSavedNote(note)
      setStatus('saved')
      return true
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message.includes('已更新')
          ? '保存失败，输入已保留。' + error.message
          : '',
      )
      setStatus('saveError')
      return false
    }
  }

  function cancelNavigation() {
    pendingNavigation.current = null
    setConfirmDiscard(false)
  }

  function continueNavigation() {
    const proceed = pendingNavigation.current
    pendingNavigation.current = null
    setConfirmDiscard(false)
    proceed?.()
  }

  useEffect(() => {
    if (note === savedNote) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [note, savedNote])

  return (
    <section className={`card ${styles.notes}`} aria-labelledby="note-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="note-title">个人备注</h2>
        </div>
        <span className="tag">仅当前设备</span>
      </div>
      <label className="srOnly" htmlFor="travel-note">
        个人备注
      </label>
      <textarea
        id="travel-note"
        value={note}
        disabled={
          status === 'loading' || status === 'loadError' || status === 'saving'
        }
        placeholder="记下出发前想提醒自己的事…"
        onChange={(event) => {
          setNote(event.target.value)
          setStatus('ready')
        }}
      />
      <div className={styles.noteActions}>
        <span
          role="status"
          aria-live="polite"
          className={status.endsWith('Error') ? styles.error : styles.hint}
        >
          {status === 'loading'
            ? '正在读取本地备注…'
            : status === 'loadError'
              ? '本地数据读取失败，请重试。'
              : status === 'saveError'
                ? saveError || '保存失败，输入已保留，请重试。'
                : status === 'saved'
                  ? '已保存到当前设备'
                  : note !== savedNote
                    ? '有尚未保存的修改'
                    : '已保存'}
        </span>
        {status === 'loadError' ? (
          <button
            className="primaryButton"
            onClick={() => {
              setStatus('loading')
              setRetry((value) => value + 1)
            }}
          >
            重新读取
          </button>
        ) : (
          <button
            className="primaryButton"
            onClick={() => void save()}
            disabled={status === 'loading' || status === 'saving'}
          >
            {status === 'saving' ? (
              <LoaderCircle size={16} />
            ) : status === 'saved' ? (
              <Check size={16} />
            ) : (
              <Save size={16} />
            )}
            {status === 'saving' ? '保存中' : '保存备注'}
          </button>
        )}
      </div>
      {confirmDiscard && (
        <EditPanel
          title="个人备注尚未保存"
          onClose={cancelNavigation}
          busy={status === 'saving'}
        >
          <p className="muted">
            可以保存后继续，或放弃未保存的修改并前往刚才选择的页面。
          </p>
          <div className={styles.noteActions}>
            <button
              className="secondaryButton"
              onClick={cancelNavigation}
              disabled={status === 'saving'}
            >
              继续编辑
            </button>
            <button
              className="dangerButton"
              onClick={() => {
                setNote(savedNote)
                setStatus('ready')
                continueNavigation()
              }}
              disabled={status === 'saving'}
            >
              放弃并继续
            </button>
            <button
              className="primaryButton"
              disabled={status === 'saving'}
              onClick={() =>
                void save().then((saved) => {
                  if (saved) continueNavigation()
                })
              }
            >
              {status === 'saving' ? '保存中…' : '保存并继续'}
            </button>
          </div>
          {status === 'saveError' && (
            <p role="alert" className="formError">
              {saveError || '保存失败，输入已保留，请重试。'}
            </p>
          )}
        </EditPanel>
      )}
    </section>
  )
}
