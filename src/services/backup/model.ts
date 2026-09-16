import { parseWorkspace } from '../travel/repository'
import type { TravelWorkspace, TripPlace } from '../travel/types'
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024
export interface BackupDocument {
  app: 'onway'
  formatVersion: 1
  appVersion: string
  exportedAt: string
  workspace: TravelWorkspace
  personalNote: string
}
// 仅白名单字段进入文件，配置、Key 和未知文档字段不会随备份泄露。
function cleanPlace(p: TripPlace): TripPlace {
  return {
    id: p.id,
    name: p.name,
    note: p.note,
    coordinates: {
      longitude: p.coordinates.longitude,
      latitude: p.coordinates.latitude,
      crs: 'WGS84',
    },
    address: p.address,
    categoryId: p.categoryId,
    libraryPlaceId: p.libraryPlaceId,
    source: p.source && { provider: p.source.provider, id: p.source.id },
    sourceUrl: p.sourceUrl,
  }
}
export function cleanWorkspace(w: TravelWorkspace): TravelWorkspace {
  return {
    schemaVersion: 2,
    activeTripId: w.activeTripId,
    categories: w.categories.map((c) => ({
      id: c.id,
      name: c.name,
      builtin: c.builtin,
    })),
    libraryPlaces: w.libraryPlaces.map(cleanPlace),
    trips: w.trips.map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      days: t.days.map((d) => ({ id: d.id, places: d.places.map(cleanPlace) })),
      unscheduledPlaces: t.unscheduledPlaces.map(cleanPlace),
    })),
  }
}
export function createBackup(
  workspace: TravelWorkspace,
  personalNote: string,
): BackupDocument {
  return {
    app: 'onway',
    formatVersion: 1,
    appVersion: '0.5.0',
    exportedAt: new Date().toISOString(),
    workspace: cleanWorkspace(workspace),
    personalNote,
  }
}
export function serializeBackup(document: BackupDocument): string {
  const text = JSON.stringify(document, null, 2)
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error('备份超过 20 MB，当前版本无法处理。')
  return text
}
export function parseBackup(text: string): BackupDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    throw new Error('文件超过 20 MB。')
  let d: unknown
  try {
    d = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('文件不是有效的 JSON 备份。')
  }
  if (!d || typeof d !== 'object' || Array.isArray(d))
    throw new Error('这不是 Onway 备份。')
  const v = d as Record<string, unknown>
  if (v.app !== 'onway') throw new Error('这不是 Onway 备份。')
  if (v.formatVersion !== 1)
    throw new Error('备份版本暂不支持，请使用兼容的 Onway 版本。')
  if (
    typeof v.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(v.exportedAt) ||
    !Number.isFinite(Date.parse(v.exportedAt)) ||
    typeof v.appVersion !== 'string' ||
    typeof v.personalNote !== 'string' ||
    !v.workspace
  )
    throw new Error('备份内容不完整，原数据未改动。')
  const workspace = cleanWorkspace(parseWorkspace(JSON.stringify(v.workspace)))
  return {
    app: 'onway',
    formatVersion: 1,
    appVersion: v.appVersion,
    exportedAt: v.exportedAt,
    workspace,
    personalNote: v.personalNote,
  }
}
export function summarize(workspace: TravelWorkspace) {
  return {
    trips: workspace.trips.length,
    days: workspace.trips.reduce((n, t) => n + t.days.length, 0),
    tripPlaces: workspace.trips.reduce(
      (n, t) =>
        n +
        t.unscheduledPlaces.length +
        t.days.reduce((m, d) => m + d.places.length, 0),
      0,
    ),
    libraryPlaces: workspace.libraryPlaces.length,
    customCategories: workspace.categories.filter((c) => !c.builtin).length,
  }
}
export function backupFilename(document: BackupDocument) {
  return 'onway-backup-' + document.exportedAt.replace(/[:.]/g, '-') + '.json'
}
