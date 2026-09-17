import { getLocalStore } from '../storage'
import { NOTE_KEY, type LocalStore } from '../storage/types'
import {
  isAtomicStore,
  RESTORE_EPOCH_KEY,
  type AtomicLocalStore,
  type StoreSnapshot,
} from '../storage/atomic'
import { parseWorkspace, TRAVEL_WORKSPACE_KEY } from '../travel/repository'
import { ROUTE_CACHE_KEY } from '../routes/repository'
import {
  createBackup,
  parseBackup,
  serializeBackup,
  type BackupDocument,
} from './model'
const keys = [
  TRAVEL_WORKSPACE_KEY,
  NOTE_KEY,
  ROUTE_CACHE_KEY,
  RESTORE_EPOCH_KEY,
]
export interface RestorePreview {
  document: BackupDocument
  expected: StoreSnapshot
  current: BackupDocument | null
}
export class BackupRepository {
  constructor(
    private source: LocalStore | (() => Promise<LocalStore>) = getLocalStore,
  ) {}
  private async store(): Promise<AtomicLocalStore> {
    const store =
      typeof this.source === 'function' ? await this.source() : this.source
    await store.initialize()
    if (!isAtomicStore(store))
      throw new Error('当前存储不支持事务恢复，原数据未改动。')
    return store
  }
  async export(): Promise<BackupDocument> {
    const snapshot = await (await this.store()).readBatch(keys)
    return createBackup(
      parseWorkspace(snapshot[TRAVEL_WORKSPACE_KEY]),
      snapshot[NOTE_KEY] ?? '',
    )
  }
  async preview(text: string): Promise<RestorePreview> {
    const document = parseBackup(text)
    const expected = await (await this.store()).readBatch(keys)
    let current: BackupDocument | null = null
    try {
      current = createBackup(
        parseWorkspace(expected[TRAVEL_WORKSPACE_KEY]),
        expected[NOTE_KEY] ?? '',
      )
    } catch {
      /* 损坏的旧文档也可由有效备份恢复，预览明确提示无法统计。 */
    }
    return { document, expected, current }
  }
  async restore(preview: RestorePreview): Promise<void> {
    // 确认后再次校验，比较的是打开预览时的原始值，避免覆盖期间新增的修改。
    const document = parseBackup(serializeBackup(preview.document))
    await (
      await this.store()
    ).writeBatch(
      {
        [TRAVEL_WORKSPACE_KEY]: JSON.stringify(document.workspace),
        [NOTE_KEY]: document.personalNote,
        [ROUTE_CACHE_KEY]: JSON.stringify({
          schemaVersion: 2,
          entries: [],
          segments: [],
        }),
        [RESTORE_EPOCH_KEY]: crypto.randomUUID(),
      },
      preview.expected,
    )
  }
}
