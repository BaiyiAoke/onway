import { lazy, Suspense, useState } from 'react'
import { EditPanel } from '../../components/EditPanel'
import type { Trip } from '../../services/travel/types'
import {
  PlaceEditor,
  newPlaceDraft,
  type PlaceDraft,
} from '../travel/PlaceEditor'
import { SearchPanel } from './SearchPanel'
const PointMap = lazy(() => import('./PointMap'))

/** 搜索结果、坐标输入和地图选点最终都交给同一表单保存。 */
export function PlaceComposer({
  mode,
  initial,
  trip,
  dayId = null,
  onClose,
}: {
  mode: 'manual' | 'search' | 'map'
  initial?: PlaceDraft
  trip?: Trip
  dayId?: string | null
  onClose: () => void
}) {
  const [draft, setDraft] = useState<PlaceDraft | null>(() =>
    mode === 'manual' ? (initial ?? newPlaceDraft(dayId)) : null,
  )
  const [picking, setPicking] = useState(mode === 'map')
  const [revision, setRevision] = useState(0)
  const points =
    draft &&
    Number.isFinite(draft.coordinates.longitude) &&
    Number.isFinite(draft.coordinates.latitude)
      ? [draft]
      : []
  function closeEditor() {
    if (mode === 'search') setDraft(null)
    else onClose()
  }
  return (
    <>
      {mode === 'search' && (
        <SearchPanel
          visible={!draft && !picking}
          onClose={onClose}
          onSelect={(place) => {
            setDraft({ ...place, id: crypto.randomUUID(), dayId })
            setRevision((value) => value + 1)
          }}
        />
      )}
      {picking ? (
        <EditPanel
          title="地图选点"
          onClose={() => {
            if (draft) setPicking(false)
            else onClose()
          }}
        >
          <p className="muted">点击地图选择位置，之后填写地点信息。</p>
          <Suspense fallback={<p>正在打开地图…</p>}>
            <PointMap
              places={points}
              onPick={(coordinates) => {
                const next = {
                  ...(draft ?? newPlaceDraft(dayId)),
                  coordinates,
                  source: undefined,
                  sourceUrl: undefined,
                  address: undefined,
                }
                setDraft(next)
                setRevision((value) => value + 1)
                setPicking(false)
              }}
            />
          </Suspense>
          <button
            className="secondaryButton"
            onClick={() => {
              if (!draft) setDraft(newPlaceDraft(dayId))
              setPicking(false)
            }}
          >
            {draft ? '取消选点' : '改用经纬度输入'}
          </button>
        </EditPanel>
      ) : (
        draft && (
          <PlaceEditor
            key={draft.id + ':' + revision}
            trip={trip}
            draft={draft}
            onClose={closeEditor}
            onPickLocation={(value) => {
              setDraft(value)
              setPicking(true)
            }}
          />
        )
      )}
    </>
  )
}
