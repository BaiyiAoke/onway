import { lazy, Suspense, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTravel } from '../../services/travel/TravelContext'
import { categoryName } from '../../services/travel/model'
import type { TripPlace } from '../../services/travel/types'
import { CategoryManager } from './CategoryManager'
import { CopyToTrip } from './CopyActions'
import { PlaceComposer } from './PlaceComposer'
import { SearchPanel } from './SearchPanel'
import { newPlaceDraft, type PlaceDraft } from '../travel/PlaceEditor'
import styles from './Places.module.css'
const PointMap = lazy(() => import('./PointMap'))

export default function PlacesPage() {
  const { workspace, status, error, reload, saving } = useTravel()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [draft, setDraft] = useState<PlaceDraft | null>(null)
  const [copy, setCopy] = useState<TripPlace | null>(null)
  const selectedCategory =
    category === 'all' ||
    category === '' ||
    workspace?.categories.some((item) => item.id === category)
      ? category
      : 'all'
  const filter = query.trim().toLocaleLowerCase()
  const places = (workspace?.libraryPlaces ?? []).filter(
    (place) =>
      (selectedCategory === 'all' ||
        (place.categoryId ?? '') === selectedCategory) &&
      (place.name + ' ' + (place.address ?? ''))
        .toLocaleLowerCase()
        .includes(filter),
  )
  return (
    <div className="page">
      <div className={'pageHeading ' + styles.heading}>
        <div>
          <h1>地点</h1>
          <p className="muted">
            {workspace?.libraryPlaces.length ?? 0} 个收藏地点
          </p>
        </div>
        <button
          className="textButton"
          disabled={status !== 'ready' || saving}
          onClick={() => setCategoriesOpen(true)}
        >
          管理分类
        </button>
      </div>
      {status === 'loading' && <p role="status">正在读取地点…</p>}
      {status === 'error' && (
        <div className="formError" role="alert">
          <p>{error}</p>
          <button className="secondaryButton" onClick={() => void reload()}>
            重新读取
          </button>
        </div>
      )}
      {status === 'ready' && (
        <>
          <SearchPanel
            inline
            onSelect={(place) =>
              setDraft({ ...place, id: crypto.randomUUID(), dayId: null })
            }
          />
          <Suspense
            fallback={
              <div className={styles.map} role="status">
                正在打开地图…
              </div>
            }
          >
            <PointMap
              places={places}
              onSelect={(place) => setDraft({ ...place, dayId: null })}
              onPick={(coordinates) => {
                if (!saving) setDraft({ ...newPlaceDraft(), coordinates })
              }}
            />
          </Suspense>
          <div className={styles.searchMeta}>
            <small>点击地图添加地点</small>
            <button
              className="secondaryButton"
              disabled={saving}
              onClick={() => setDraft(newPlaceDraft())}
            >
              <Plus size={16} />
              输入坐标
            </button>
          </div>
          <div className={styles.filters}>
            <label>
              筛选名称或地址
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="筛选已收藏地点"
              />
            </label>
            <label>
              分类
              <select
                value={selectedCategory}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">全部分类</option>
                <option value="">未分类</option>
                {workspace?.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.list}>
            {places.map((place) => (
              <article className={'card ' + styles.place} key={place.id}>
                <span className="tag">
                  {categoryName(workspace, place.categoryId)}
                </span>
                <h2>{place.name}</h2>
                {place.address && <p>{place.address}</p>}
                {place.note && <p>{place.note}</p>}
                <div className={styles.actions}>
                  <button
                    className="textButton"
                    disabled={saving}
                    onClick={() => setDraft({ ...place, dayId: null })}
                  >
                    编辑地点
                  </button>
                  <button
                    className="secondaryButton"
                    disabled={saving}
                    onClick={() => setCopy(place)}
                  >
                    添加到行程
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!places.length && (
            <div className={'card ' + styles.empty}>
              {workspace?.libraryPlaces.length
                ? '没有符合筛选条件的地点。'
                : '还没有收藏地点。'}
            </div>
          )}
        </>
      )}
      {draft && (
        <PlaceComposer
          key={draft.id}
          mode="manual"
          initial={draft}
          onClose={() => setDraft(null)}
        />
      )}
      {categoriesOpen && (
        <CategoryManager onClose={() => setCategoriesOpen(false)} />
      )}
      {copy && <CopyToTrip place={copy} onClose={() => setCopy(null)} />}
    </div>
  )
}
