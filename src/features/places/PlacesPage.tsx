import { lazy, Suspense, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
} from 'lucide-react'
import { useTravel } from '../../services/travel/TravelContext'
import { categoryName } from '../../services/travel/model'
import type { TripPlace } from '../../services/travel/types'
import { CategoryManager } from './CategoryManager'
import { CopyToTrip } from './CopyActions'
import { PlaceComposer } from './PlaceComposer'
import { usePlacesView } from './usePlacesView'
import { useSessionView } from '../travel/useSessionView'
const isText = (value: unknown): value is string => typeof value === 'string'
import { newPlaceDraft, type PlaceDraft } from '../travel/PlaceEditor'
import styles from './Places.module.css'
const PointMap = lazy(() => import('./PointMap'))

export default function PlacesPage() {
  const { workspace, status, error, reload, saving } = useTravel()
  const [query, setQuery] = useSessionView('ui.places.query', '', isText)
  const [category, setCategory] = useSessionView(
    'ui.places.category',
    'all',
    isText,
  )
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [draft, setDraft] = useState<PlaceDraft | null>(null)
  const [copy, setCopy] = useState<TripPlace | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const { view, chooseView } = usePlacesView()
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
          <div className={styles.libraryTools}>
            <button
              className="primaryButton"
              disabled={saving}
              onClick={() => setSearchOpen(true)}
            >
              <Search size={17} />
              搜索新地点
            </button>
            <button
              className="secondaryButton"
              disabled={saving}
              onClick={() => setDraft(newPlaceDraft())}
            >
              <Plus size={16} />
              输入坐标
            </button>
            <button
              className="secondaryButton"
              aria-expanded={mapOpen}
              aria-controls="library-map"
              onClick={() => setMapOpen(!mapOpen)}
            >
              <MapPin size={17} />
              {mapOpen ? '收起地图' : '展开地图'}
              {mapOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
          {mapOpen && (
            <section id="library-map" aria-label="收藏地点地图">
              <p className={styles.mapHint}>
                显示当前筛选的地点，点击地图空白处添加。
              </p>
              <Suspense
                fallback={
                  <div className={styles.map} role="status">
                    正在打开地图…
                  </div>
                }
              >
                <PointMap
                  places={places}
                  onSelect={(place) => {
                    if (!saving) setDraft({ ...place, dayId: null })
                  }}
                  onPick={(coordinates) => {
                    if (!saving) setDraft({ ...newPlaceDraft(), coordinates })
                  }}
                />
              </Suspense>
            </section>
          )}
          <div className={styles.filters}>
            <label>
              筛选收藏地点
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="筛选名称或地址"
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
                    {categoryName(workspace, item.id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.resultsToolbar}>
            <p role="status" className={styles.resultCount}>
              {places.length} 个地点
              {(query.trim() || selectedCategory !== 'all') &&
                ` · 共 ${workspace?.libraryPlaces.length ?? 0} 个收藏`}
            </p>
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label="地点展示方式"
            >
              <button
                className="secondaryButton"
                aria-pressed={view === 'list'}
                onClick={() => chooseView('list')}
              >
                <List size={17} />
                列表
              </button>
              <button
                className="secondaryButton"
                aria-pressed={view === 'grid'}
                onClick={() => chooseView('grid')}
              >
                <LayoutGrid size={17} />
                网格
              </button>
            </div>
          </div>
          <div
            className={styles.list + (view === 'grid' ? ' ' + styles.grid : '')}
          >
            {places.map((place) => (
              <article className={'card ' + styles.place} key={place.id}>
                <div className={styles.placeContent}>
                  <div className={styles.placeHeading}>
                    <h2>{place.name}</h2>
                    <span className="tag">
                      {categoryName(workspace, place.categoryId)}
                    </span>
                  </div>
                  {place.address && <p>{place.address}</p>}
                  {place.note && <p>{place.note}</p>}
                </div>
                <div className={styles.placeActions}>
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
      {searchOpen && (
        <PlaceComposer mode="search" onClose={() => setSearchOpen(false)} />
      )}
      {categoriesOpen && (
        <CategoryManager onClose={() => setCategoriesOpen(false)} />
      )}
      {copy && <CopyToTrip place={copy} onClose={() => setCopy(null)} />}
    </div>
  )
}
