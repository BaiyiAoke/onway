import { beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => {
  let rows = new Map<string, string>(),
    rollback: Map<string, string> | null = null
  const flags = { fail: false, pause: null as (() => Promise<void>) | null }
  const db = {
    isDBOpen: async () => ({ result: true }),
    open: async () => {},
    execute: async () => {},
    run: async (_sql: string, values: string[]) => {
      if (!rows.has(values[0])) rows.set(values[0], values[1])
    },
    query: vi.fn(async (_sql: string, keys: string[]) => ({
      values: keys
        .filter((k) => rows.has(k))
        .map((key) => ({ key, value: rows.get(key) })),
    })),
    beginTransaction: async () => {
      rollback = new Map(rows)
    },
    commitTransaction: vi.fn(async () => {
      rollback = null
    }),
    rollbackTransaction: vi.fn(async () => {
      rows = rollback!
      rollback = null
    }),
    executeSet: async (set: { values: string[] }[], transaction: boolean) => {
      if (transaction !== false) throw Error('批量语句不得嵌套事务')
      for (let i = 0; i < set.length; i++) {
        rows.set(set[i].values[0], set[i].values[1])
        if (i === 0) {
          await flags.pause?.()
          if (flags.fail) throw Error('磁盘写入失败')
        }
      }
    },
  }
  return {
    db,
    flags,
    reset: () => {
      rows = new Map()
      rollback = null
      flags.fail = false
      flags.pause = null
    },
  }
})
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    addUpgradeStatement = async () => {}
    checkConnectionsConsistency = async () => ({ result: false })
    isConnection = async () => ({ result: false })
    createConnection = async () => native.db
  },
}))
import { AndroidLocalStore } from './android'
beforeEach(() => native.reset())
describe('Android 原子存储适配', () => {
  it('第二项写入失败则回滚全部键，后续重试仍可用', async () => {
    const store = new AndroidLocalStore()
    await store.writeBatch({ trip: 'old', note: 'old' })
    native.flags.fail = true
    await expect(
      store.writeBatch({ trip: 'new', note: 'new' }),
    ).rejects.toThrow('磁盘')
    expect(await store.readBatch(['trip', 'note'])).toEqual({
      trip: 'old',
      note: 'old',
    })
    expect(native.db.rollbackTransaction).toHaveBeenCalledTimes(1)
    native.flags.fail = false
    await store.writeBatch({ trip: 'new', note: 'new' })
    expect(await store.readBatch(['trip', 'note'])).toEqual({
      trip: 'new',
      note: 'new',
    })
  })
  it('事务中途的并发读取排在提交以后，不读到半恢复状态', async () => {
    const store = new AndroidLocalStore()
    await store.writeBatch({ trip: 'old', note: 'old' })
    let release!: () => void
    let started!: () => void
    const paused = new Promise<void>((resolve) => {
      started = resolve
    })
    native.flags.pause = () => {
      started()
      return new Promise((resolve) => {
        release = resolve
      })
    }
    const write = store.writeBatch({ trip: 'new', note: 'new' })
    await paused
    let resolved = false
    const read = store.readBatch(['trip', 'note']).then((value) => {
      resolved = true
      return value
    })
    await Promise.resolve()
    expect(resolved).toBe(false)
    release()
    await write
    expect(await read).toEqual({ trip: 'new', note: 'new' })
  })
  it('预览快照冲突不会执行覆盖，事务回滚后仍可正常读取', async () => {
    const store = new AndroidLocalStore()
    await store.set('note', 'new')
    await expect(
      store.writeBatch({ note: 'replacement' }, { note: 'old' }),
    ).rejects.toThrow('已更新')
    expect(await store.get('note')).toBe('new')
  })
})
