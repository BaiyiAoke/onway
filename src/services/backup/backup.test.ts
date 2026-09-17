import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Table } from 'dexie'
import { WebLocalStore } from '../storage/web'
import { NOTE_KEY } from '../storage/types'
import { RESTORE_EPOCH_KEY } from '../storage/atomic'
import { TravelRepository, TRAVEL_WORKSPACE_KEY } from '../travel/repository'
import {
  defaultCategories,
  emptyWorkspace,
  applyTravelAction,
} from '../travel/model'
import { ROUTE_CACHE_KEY, RouteCacheRepository } from '../routes/repository'
import { BackupRepository } from './repository'
import {
  createBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  summarize,
} from './model'
const stores: WebLocalStore[] = []
const open = (name = 'backup-' + crypto.randomUUID()) => {
  const store = new WebLocalStore(name)
  stores.push(store)
  return store
}
afterEach(() => {
  stores.forEach((s) => s.close())
  stores.length = 0
  vi.restoreAllMocks()
})
function fixture() {
  let w = applyTravelAction(emptyWorkspace(), {
    type: 'createTrip',
    name: '跨月旅行',
    startDate: '2026-09-30',
    dayCount: 2,
  })
  w = applyTravelAction(
    w,
    { type: 'saveCategory', name: '营地' },
    () => 'custom-test',
  )
  w = applyTravelAction(w, {
    type: 'saveLibraryPlace',
    place: {
      id: 'library-test',
      name: '测试点',
      note: '收藏备注',
      categoryId: 'custom-test',
      coordinates: { longitude: 103.8, latitude: 36.1, crs: 'WGS84' },
      source: { provider: 'amap', id: 'public-poi' },
    },
  })
  w = applyTravelAction(w, {
    type: 'copyToTrip',
    placeId: 'library-test',
    tripId: w.trips[0].id,
    dayId: w.trips[0].days[1].id,
  })
  w.trips[0].days[1].places[0].note = '行程副本'
  return createBackup(w, '个人备注')
}
describe('文件备份与事务恢复', () => {
  it('导出只含业务白名单，保持 ID、顺序、日期与独立副本；设置和 Key 不进入文件', async () => {
    const store = open()
    const source = fixture()
    await store.writeBatch({
      [TRAVEL_WORKSPACE_KEY]: JSON.stringify({
        ...source.workspace,
        amapKey: 'private-test-key',
      }),
      [NOTE_KEY]: source.personalNote,
      'search.provider.v1': 'private-test-key',
      [ROUTE_CACHE_KEY]: 'route-cache',
    })
    const text = serializeBackup(await new BackupRepository(store).export())
    expect(text).not.toContain('private-test-key')
    expect(text).not.toContain('route-cache')
    const document = parseBackup(text)
    expect(document.workspace).toEqual(source.workspace)
    expect(document.personalNote).toBe('个人备注')
    expect(summarize(document.workspace)).toEqual({
      trips: 1,
      days: 2,
      tripPlaces: 1,
      libraryPlaces: 1,
      customCategories: 1,
    })
  })
  it('预览与取消不写数据；整体恢复只替换业务数据并清空路线，重新打开仍一致', async () => {
    const name = 'backup-' + crypto.randomUUID(),
      store = open(name),
      repository = new BackupRepository(store)
    await store.writeBatch({
      [NOTE_KEY]: '旧备注',
      'search.provider.v1': 'key-kept',
      [ROUTE_CACHE_KEY]: 'old-cache',
    })
    const before = await store.readBatch([
      TRAVEL_WORKSPACE_KEY,
      NOTE_KEY,
      ROUTE_CACHE_KEY,
    ])
    const source = fixture(),
      preview = await repository.preview(serializeBackup(source))
    expect(await store.readBatch(Object.keys(before))).toEqual(before)
    await repository.restore(preview)
    store.close()
    const reopened = open(name),
      restored = await new BackupRepository(reopened).export()
    expect(restored.workspace).toEqual(source.workspace)
    expect(restored.personalNote).toBe(source.personalNote)
    expect(await reopened.get('search.provider.v1')).toBe('key-kept')
    expect(JSON.parse((await reopened.get(ROUTE_CACHE_KEY))!).entries).toEqual(
      [],
    )
  })
  it.each([
    '{broken',
    JSON.stringify({ ...fixture(), formatVersion: 99 }),
    JSON.stringify({ ...fixture(), workspace: {} }),
    JSON.stringify({ ...fixture(), app: 'elsewhere' }),
  ])('拒绝无效或不支持文件且不改原数据 (%#)', async (text) => {
    const store = open()
    await store.set(NOTE_KEY, '保留')
    await expect(new BackupRepository(store).preview(text)).rejects.toThrow()
    expect(await store.get(NOTE_KEY)).toBe('保留')
    expect(await store.get(TRAVEL_WORKSPACE_KEY)).toBeNull()
  })
  it('拒绝超大文件和无效坐标；支持 UTF-8 BOM 与显式 v1 工作区迁移', () => {
    expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow('20 MB')
    const invalid = fixture()
    invalid.workspace.libraryPlaces[0].coordinates.longitude = 999
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow('格式异常')
    const old = {
      ...fixture(),
      workspace: { schemaVersion: 1, trips: [], activeTripId: null },
    }
    const next = parseBackup('\uFEFF' + JSON.stringify(old))
    expect(next.workspace.schemaVersion).toBe(4)
    expect(next.workspace.categories).toHaveLength(7)
  })
  it.each([2, 3, 4])(
    '外层 v1 备份可导入旅行文档 v%s，新旧分类往返不丢引用',
    (schemaVersion) => {
      const source = fixture()
      const categories =
        schemaVersion === 4
          ? defaultCategories()
          : [
              ...defaultCategories().filter(
                (category) =>
                  !['category-airport', 'category-station'].includes(
                    category.id,
                  ),
              ),
              { id: 'category-transport', name: '交通', builtin: true },
              { id: 'custom-airport', name: '机场', builtin: false },
            ]
      const categoryId =
        schemaVersion === 4 ? 'category-airport' : 'category-transport'
      const workspace = {
        ...source.workspace,
        schemaVersion,
        categories,
        libraryPlaces: [{ ...source.workspace.libraryPlaces[0], categoryId }],
        trips: source.workspace.trips.map((trip) => ({
          ...trip,
          days: trip.days.map((day) => ({
            ...day,
            places: day.places.map((place) => ({ ...place, categoryId })),
          })),
        })),
      }
      const restored = parseBackup(JSON.stringify({ ...source, workspace }))
      expect(restored.formatVersion).toBe(1)
      expect(restored.workspace.schemaVersion).toBe(4)
      expect(restored.workspace.libraryPlaces[0].categoryId).toBe(categoryId)
      expect(restored.workspace.trips[0].days[1].places[0].categoryId).toBe(
        categoryId,
      )
      expect(
        parseBackup(serializeBackup(createBackup(restored.workspace, '备注')))
          .workspace,
      ).toEqual(restored.workspace)
    },
  )
  it('事务第二项失败时已写的第一项也回滚，重试可成功', async () => {
    const store = open(),
      repository = new BackupRepository(store)
    await store.writeBatch({
      [NOTE_KEY]: '旧备注',
      [ROUTE_CACHE_KEY]: '旧路线',
    })
    const preview = await repository.preview(serializeBackup(fixture()))
    const entries = (
      store as unknown as {
        entries: Table<{ key: string; value: string }, string>
      }
    ).entries
    vi.spyOn(entries, 'bulkPut').mockImplementationOnce((rows) =>
      entries.put(rows[0]).then(() => {
        throw new Error('模拟第二项磁盘写入失败')
      }),
    )
    await expect(repository.restore(preview)).rejects.toThrow('第二项')
    expect(await store.readBatch(Object.keys(preview.expected))).toEqual(
      preview.expected,
    )
    await repository.restore(preview)
    expect(await store.get(NOTE_KEY)).toBe('个人备注')
  })
  it('预览后另一连接保存的数据不被覆盖，重新预览后可恢复', async () => {
    const name = 'backup-' + crypto.randomUUID(),
      store = open(name),
      other = open(name),
      repository = new BackupRepository(store)
    const text = serializeBackup(fixture()),
      preview = await repository.preview(text)
    await other.set(NOTE_KEY, '预览后的新备注')
    await expect(repository.restore(preview)).rejects.toThrow('已更新')
    expect(await store.get(NOTE_KEY)).toBe('预览后的新备注')
    await repository.restore(await repository.preview(text))
    expect(await store.get(NOTE_KEY)).toBe('个人备注')
  })
  it('恢复后旧行程仓库与旧路线仓库不能覆盖数据，包含恢复内容恰好相同的情况', async () => {
    const store = open(),
      backup = new BackupRepository(store),
      travel = new TravelRepository(store),
      routes = new RouteCacheRepository(store)
    await store.set(
      TRAVEL_WORKSPACE_KEY,
      JSON.stringify(createBackup(emptyWorkspace(), '').workspace),
    )
    await travel.load()
    await routes.load()
    const preview = await backup.preview(serializeBackup(await backup.export()))
    await backup.restore(preview)
    await expect(
      travel.run({
        type: 'createTrip',
        name: '旧页面',
        startDate: null,
        dayCount: 1,
      }),
    ).rejects.toThrow('已更新')
    // 代次校验在路线格式处理前阻止旧响应，原有服务结果不写入恢复后的缓存。
    const saved = await routes.save(
      { tripId: 'old', dayId: 'old', fingerprint: 'old', result: {} as never },
      [],
      () => true,
    )
    expect(saved).toBe(false)
    expect(await store.get(TRAVEL_WORKSPACE_KEY)).toBe(
      JSON.stringify(preview.document.workspace),
    )
    expect(await store.get(RESTORE_EPOCH_KEY)).toBeTruthy()
  })
})
