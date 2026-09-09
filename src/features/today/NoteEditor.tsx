import { useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, Save } from 'lucide-react'
import { getLocalStore } from '../../services/storage'
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
  const storeRef = useRef<LocalStore | null>(null)

  useEffect(() => {
    let active = true
    loadStore()
      .then(async (store) => {
        await store.initialize()
        const stored = (await store.get(NOTE_KEY)) ?? ''
        if (active) {
          storeRef.current = store
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
    if (!storeRef.current) return
    setStatus('saving')
    try {
      await storeRef.current.set(NOTE_KEY, note)
      setSavedNote(note)
      setStatus('saved')
    } catch {
      setStatus('saveError')
    }
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
          <p className="eyebrow">留给自己的提醒</p>
          <h2 id="note-title">示例旅行备注</h2>
        </div>
        <span className="tag">仅当前设备</span>
      </div>
      <label className="srOnly" htmlFor="travel-note">
        示例旅行备注
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
                ? '保存失败，输入已保留，请重试。'
                : status === 'saved'
                  ? '已保存到当前设备'
                  : note !== savedNote
                    ? '有尚未保存的修改'
                    : '保存后，重新打开仍可查看。'}
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
    </section>
  )
}
