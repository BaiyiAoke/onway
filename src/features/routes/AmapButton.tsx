import { useState } from 'react'
import { Navigation } from 'lucide-react'
import { canUseAmap, navigateWithAmap } from '../../services/navigation/amap'
import type { TripPlace } from '../../services/travel/types'
import styles from './Routes.module.css'

export function AmapButton({ place }: { place: TripPlace }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!canUseAmap()) return null
  async function open() {
    setBusy(true)
    setError('')
    try {
      await navigateWithAmap(place)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '打开高德失败，请重试。',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.navigation}>
      <button
        type="button"
        className="textButton"
        disabled={busy}
        onClick={() => void open()}
        aria-label={'高德驾车导航到' + place.name}
        title="由高德从当前位置规划，实际路线可能与估算不同"
      >
        <Navigation size={14} /> {busy ? '正在打开…' : '高德驾车导航'}
      </button>
      {error && (
        <p role="alert" className={styles.failure}>
          {error}
        </p>
      )}
    </div>
  )
}
