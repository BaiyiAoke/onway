import { demoPlaces } from '../../data/demo'
import { pointSignature, reconcileTransport } from '../routes/transport'
import type {
  PlaceGroup,
  TravelAction,
  TravelWorkspace,
  Trip,
  TripPlace,
  PlaceCategory,
} from './types'

export function defaultCategories(): PlaceCategory[] {
  return [
    ['sight', '景点'],
    ['food', '餐饮'],
    ['stay', '住宿'],
    ['parking', '停车'],
    ['airport', '机场'],
    ['station', '车站'],
  ].map(([id, name]) => ({ id: 'category-' + id, name, builtin: true }))
}

export function categoryName(
  workspace: TravelWorkspace | null,
  id?: string,
): string {
  const category = workspace?.categories.find((item) => item.id === id)
  // 旧交通分类保留原 ID；显示待整理，不根据名称推断机场或车站。
  if (category?.builtin && category.id === 'category-transport')
    return '交通（待整理）'
  return category?.name ?? '未分类'
}

// 来源 ID 优先；手动地点只比较名称与原始坐标，不合并可能不同的入口。
export function samePlace(a: TripPlace, b: TripPlace): boolean {
  if (
    a.source &&
    b.source &&
    a.source.provider === b.source.provider &&
    a.source.id === b.source.id
  )
    return true
  return (
    a.name.trim() === b.name.trim() &&
    a.coordinates.longitude === b.coordinates.longitude &&
    a.coordinates.latitude === b.coordinates.latitude
  )
}

const DAY_MS = 86_400_000

export function emptyWorkspace(): TravelWorkspace {
  return {
    schemaVersion: 4,
    trips: [],
    activeTripId: null,
    libraryPlaces: [],
    categories: defaultCategories(),
  }
}

// 以 UTC 运算日历日期，避免夏令时和本地时区让相邻两天错位。
function dateNumber(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.getTime()
    : null
}

export function isValidCalendarDate(value: string): boolean {
  return dateNumber(value) !== null
}

export function todayLocalDate(): string {
  const date = new Date()
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDayLabel(trip: Trip, index: number): string {
  const label = `第 ${index + 1} 天`
  const start = trip.startDate === null ? null : dateNumber(trip.startDate)
  if (start === null) return label
  const date = new Date(start + index * DAY_MS)
  return `${label} · ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`
}

export function getTodayDayIndex(
  trip: Trip,
  today = todayLocalDate(),
): number | null {
  const start = trip.startDate === null ? null : dateNumber(trip.startDate)
  const current = dateNumber(today)
  if (start === null || current === null) return null
  const index = (current - start) / DAY_MS
  return index >= 0 && index < trip.days.length ? index : null
}

export function getGroupPlaces(trip: Trip, group: PlaceGroup): TripPlace[] {
  if (group === 'all')
    return [
      ...trip.days.flatMap((day) => day.places),
      ...trip.unscheduledPlaces,
    ]
  if (group === 'unscheduled') return trip.unscheduledPlaces
  return trip.days.find((day) => day.id === group)?.places ?? []
}

function assertName(name: string) {
  if (!name.trim()) throw new Error('请填写名称。')
}

function assertDate(startDate: string | null) {
  if (startDate !== null && !isValidCalendarDate(startDate)) {
    throw new Error('请填写有效的出发日期，或留空待定。')
  }
}

function targetPlaces(trip: Trip, dayId: string | null): TripPlace[] {
  if (dayId === null) return trip.unscheduledPlaces
  const day = trip.days.find((item) => item.id === dayId)
  if (!day) throw new Error('这一天已不存在，请重新选择。')
  return day.places
}

// 插入目标必须仍在选定当天；失效时提示重新选择，避免悄悄追加到错误位置。
function insertPlace(
  places: TripPlace[],
  place: TripPlace,
  afterPlaceId?: string,
) {
  if (afterPlaceId === undefined) {
    places.push(place)
    return
  }
  const index = places.findIndex((item) => item.id === afterPlaceId)
  if (index < 0)
    throw new Error('插入位置已改变，请重新选择要在哪个地点后添加。')
  places.splice(index + 1, 0, place)
}

function locatePlace(trip: Trip, id: string) {
  const groups = [...trip.days.map((day) => day.places), trip.unscheduledPlaces]
  for (const places of groups) {
    const index = places.findIndex((place) => place.id === id)
    if (index !== -1) return { places, index, place: places[index] }
  }
  return null
}

function assertPlace(place: TripPlace) {
  assertName(place.name)
  const { longitude, latitude, crs } = place.coordinates
  if (
    !place.id.trim() ||
    typeof place.note !== 'string' ||
    crs !== 'WGS84' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error('地点数据无效，请重新选点。')
  }
}

// 动作只修改副本；持久化失败时调用方仍可继续使用原有已保存快照。
// 可注入 ID 工厂，使动作测试无需依赖随机数。
export function applyTravelAction(
  workspace: TravelWorkspace,
  action: TravelAction,
  createId: () => string = () => crypto.randomUUID(),
): TravelWorkspace {
  const next = structuredClone(workspace)
  if (action.type === 'saveCategory') {
    const name = action.name.trim()
    if (!name || name.length > 30 || name === '未分类')
      throw new Error('分类名称须为 1～30 个字符，且不能使用“未分类”。')
    if (next.categories.some((c) => c.id !== action.id && c.name === name))
      throw new Error('已有同名分类。')
    if (action.id) {
      const category = next.categories.find((c) => c.id === action.id)
      if (!category || category.builtin) throw new Error('只能修改自定义分类。')
      category.name = name
    } else next.categories.push({ id: createId(), name, builtin: false })
    return next
  }
  if (action.type === 'deleteCategory') {
    const category = next.categories.find((c) => c.id === action.id)
    if (!category || category.builtin) throw new Error('只能删除自定义分类。')
    next.categories = next.categories.filter((c) => c.id !== action.id)
    // 分类与所有引用同一次写入；删除分类不会删除任何地点。
    for (const place of [
      ...next.libraryPlaces,
      ...next.trips.flatMap((t) => getGroupPlaces(t, 'all')),
    ]) {
      if (place.categoryId === action.id) delete place.categoryId
    }
    return next
  }
  if (action.type === 'saveLibraryPlace') {
    assertPlace(action.place)
    if (next.trips.some((t) => locatePlace(t, action.place.id)))
      throw new Error('行程地点不能直接覆盖地点库，请使用收藏。')
    const place = {
      ...structuredClone(action.place),
      name: action.place.name.trim(),
    }
    const index = next.libraryPlaces.findIndex((p) => p.id === place.id)
    if (
      index < 0 &&
      !action.allowDuplicate &&
      next.libraryPlaces.some((p) => samePlace(p, place))
    )
      throw new Error('地点库中已有这个地点，请确认是否另存副本。')
    if (
      index >= 0 &&
      pointSignature(next.libraryPlaces[index]) !== pointSignature(place)
    ) {
      delete place.citycode
      delete place.adcode
      delete place.cityName
    }
    if (index < 0) next.libraryPlaces.push(place)
    else next.libraryPlaces[index] = place
    return next
  }
  if (action.type === 'deleteLibraryPlace') {
    if (!next.libraryPlaces.some((p) => p.id === action.placeId))
      throw new Error('地点已不存在，请重新读取。')
    next.libraryPlaces = next.libraryPlaces.filter(
      (p) => p.id !== action.placeId,
    )
    return next
  }
  if (action.type === 'createTrip') {
    assertName(action.name)
    assertDate(action.startDate)
    if (!Number.isSafeInteger(action.dayCount) || action.dayCount < 1) {
      throw new Error('行程至少需要一天。')
    }
    const trip: Trip = {
      id: createId(),
      name: action.name.trim(),
      startDate: action.startDate,
      days: Array.from({ length: action.dayCount }, () => ({
        id: createId(),
        places: [],
      })),
      unscheduledPlaces: [],
    }
    if (action.demo) {
      // 仅由用户显式创建示例；每次复制都生成独立 ID，编辑不会影响示例常量。
      demoPlaces.forEach((place, index) => {
        trip.days[Math.min(index, trip.days.length - 1)].places.push({
          id: createId(),
          name: place.name,
          note: place.subtitle,
          coordinates: { ...place.coordinates },
          sourceUrl: place.sourceUrl,
        })
      })
    }
    next.trips.push(trip)
    next.activeTripId = trip.id
    return next
  }
  const trip = next.trips.find((item) => item.id === action.tripId)
  if (!trip) throw new Error('行程已不存在，请重新加载。')
  switch (action.type) {
    case 'savePlaceCity': {
      const found = locatePlace(trip, action.placeId)
      if (
        !found ||
        JSON.stringify(found.place.coordinates) !==
          JSON.stringify(action.coordinates)
      )
        throw new Error('地点位置已改变，城市信息未保存。')
      Object.assign(found.place, action.city)
      break
    }
    case 'saveTransport': {
      const record = structuredClone(action.record)
      const records = (trip.transport ??= [])
      const existing = records.find((r) => r.id === record.id)
      if (
        action.expected !== undefined &&
        JSON.stringify(existing ?? null) !== action.expected
      )
        throw new Error('交通记录已更新，请重新打开后编辑。')
      if (record.dayId !== null) {
        const day = trip.days.find((d) => d.id === record.dayId)
        const index =
          day?.places.findIndex((p) => p.id === record.from.id) ?? -1
        if (
          !day ||
          index < 0 ||
          day.places[index + 1]?.id !== record.to.id ||
          pointSignature(record.from) !== pointSignature(day.places[index]) ||
          pointSignature(record.to) !== pointSignature(day.places[index + 1])
        )
          throw new Error('相邻地点已改变，请重新打开交通设置。')
        if (
          records.some(
            (r) =>
              r.id !== record.id &&
              r.dayId === record.dayId &&
              r.from.id === record.from.id &&
              r.to.id === record.to.id,
          )
        )
          throw new Error('目标路段已有交通设置，请先处理该记录。')
      }
      if (existing) records.splice(records.indexOf(existing), 1, record)
      else records.push(record)
      break
    }
    case 'deleteTransport':
      trip.transport = trip.transport?.filter((r) => r.id !== action.recordId)
      break
    case 'collectPlace': {
      const found = locatePlace(trip, action.placeId)
      if (!found) throw new Error('地点已不存在。')
      if (
        !action.allowDuplicate &&
        next.libraryPlaces.some((p) => samePlace(p, found.place))
      )
        throw new Error('地点库中已有这个地点。')
      const copied = { ...structuredClone(found.place), id: createId() }
      delete copied.libraryPlaceId
      next.libraryPlaces.push(copied)
      break
    }
    case 'copyToTrip': {
      const place = next.libraryPlaces.find((p) => p.id === action.placeId)
      if (!place) throw new Error('地点库中的地点已不存在。')
      if (
        !action.allowDuplicate &&
        getGroupPlaces(trip, 'all').some(
          (p) => p.libraryPlaceId === place.id || samePlace(p, place),
        )
      )
        throw new Error('此行程中已有这个地点。')
      // 独立副本；来源 ID 仅用于重复提醒，不建立可变对象引用。
      insertPlace(
        targetPlaces(trip, action.dayId),
        {
          ...structuredClone(place),
          id: createId(),
          libraryPlaceId: place.id,
        },
        action.afterPlaceId,
      )
      break
    }
    case 'selectTrip':
      next.activeTripId = trip.id
      break
    case 'updateTrip':
      assertName(action.name)
      assertDate(action.startDate)
      trip.name = action.name.trim()
      trip.startDate = action.startDate
      break
    case 'deleteTrip':
      next.trips = next.trips.filter((item) => item.id !== trip.id)
      if (next.activeTripId === trip.id)
        next.activeTripId = next.trips[0]?.id ?? null
      break
    case 'addDay':
      trip.days.push({ id: createId(), places: [] })
      break
    case 'deleteDay': {
      if (trip.days.length <= 1) throw new Error('每个行程至少保留一天。')
      const index = trip.days.findIndex((day) => day.id === action.dayId)
      if (index === -1) throw new Error('这一天已不存在，请重新加载。')
      trip.unscheduledPlaces.push(...trip.days[index].places)
      trip.days.splice(index, 1)
      break
    }
    case 'savePlace': {
      assertPlace(action.place)
      if (
        next.trips.some(
          (item) => item.id !== trip.id && locatePlace(item, action.place.id),
        )
      ) {
        throw new Error('这个地点属于其他行程，不能覆盖。')
      }
      const destination = targetPlaces(trip, action.dayId)
      const found = locatePlace(trip, action.place.id)
      const place = {
        ...structuredClone(action.place),
        name: action.place.name.trim(),
      }
      if (found && pointSignature(found.place) !== pointSignature(place)) {
        delete place.citycode
        delete place.adcode
        delete place.cityName
      }
      if (found?.places === destination) {
        destination[found.index] = place
      } else {
        if (found) {
          found.places.splice(found.index, 1)
          destination.push(place)
        } else insertPlace(destination, place, action.afterPlaceId)
      }
      break
    }
    case 'deletePlace': {
      const found = locatePlace(trip, action.placeId)
      if (!found) throw new Error('地点已不存在，请重新加载。')
      found.places.splice(found.index, 1)
      break
    }
    case 'movePlace': {
      const destination = targetPlaces(trip, action.dayId)
      const found = locatePlace(trip, action.placeId)
      if (!found) throw new Error('地点已不存在，请重新加载。')
      if (found.places !== destination) {
        found.places.splice(found.index, 1)
        destination.push(found.place)
      }
      break
    }
    case 'reorderPlace': {
      const found = locatePlace(trip, action.placeId)
      if (!found) throw new Error('地点已不存在，请重新加载。')
      const destination =
        action.direction === 'top'
          ? 0
          : action.direction === 'bottom'
            ? found.places.length - 1
            : found.index + action.direction
      if (destination >= 0 && destination < found.places.length) {
        const [place] = found.places.splice(found.index, 1)
        found.places.splice(destination, 0, place)
      }
      break
    }
  }
  reconcileTransport(
    trip,
    workspace.trips.find((t) => t.id === trip.id),
  )
  return next
}
