import type { LocalStore } from './types'
export type StoreSnapshot = Record<string, string | null>
export const RESTORE_EPOCH_KEY = 'backup.restore-epoch'
/** 跨键恢复必须由数据库事务保证，不能逐键写入后假装原子成功。 */
export interface AtomicLocalStore extends LocalStore {
  readBatch(keys: readonly string[]): Promise<StoreSnapshot>
  writeBatch(
    values: Record<string, string>,
    expected?: StoreSnapshot,
  ): Promise<void>
}
export function isAtomicStore(store: LocalStore): store is AtomicLocalStore {
  return 'readBatch' in store && 'writeBatch' in store
}
export function assertSnapshot(
  current: StoreSnapshot,
  expected: StoreSnapshot,
) {
  if (Object.keys(expected).some((key) => current[key] !== expected[key]))
    throw new Error('本地数据已更新，请重新读取后再操作；此次修改未保存。')
}
