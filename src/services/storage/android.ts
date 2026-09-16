import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import { initialNote } from '../../data/demo'
import { assertSnapshot, type StoreSnapshot } from './atomic'
import { NOTE_KEY, type LocalStore } from './types'

const CREATE_ENTRIES_SQL =
  'CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);'

export class AndroidLocalStore implements LocalStore {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private db?: SQLiteDBConnection
  private initialization?: Promise<void>

  initialize(): Promise<void> {
    this.initialization ??= this.open().catch((error: unknown) => {
      this.initialization = undefined
      throw error
    })
    return this.initialization
  }

  private async open() {
    if (!this.db) {
      // 连接的 version 参数不会自行写入 user_version，显式注册 v1 迁移。
      // IF NOT EXISTS 也兼容已安装的初始化测试包，并保留已保存备注。
      await this.sqlite.addUpgradeStatement('onway', [
        { toVersion: 1, statements: [CREATE_ENTRIES_SQL] },
      ])
      const consistent = await this.sqlite.checkConnectionsConsistency()
      const connected = await this.sqlite.isConnection('onway', false)
      this.db =
        consistent.result && connected.result
          ? await this.sqlite.retrieveConnection('onway', false)
          : await this.sqlite.createConnection(
              'onway',
              false,
              'no-encryption',
              1,
              false,
            )
    }
    if (!(await this.db.isDBOpen()).result) await this.db.open()
    // v1 初始化可重复执行；后续版本通过 addUpgradeStatement 注册显式迁移。
    await this.db.execute(
      'CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);',
    )
    await this.db.run(
      'INSERT OR IGNORE INTO entries (key, value) VALUES (?, ?)',
      [NOTE_KEY, initialNote],
    )
  }

  // 同一个 SQLite 连接上的读取、普通保存与恢复共用队列，事务中途不插入其他操作。
  private queue: Promise<unknown> = Promise.resolve()
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }
  private async readValues(keys: readonly string[]): Promise<StoreSnapshot> {
    if (!keys.length) return {}
    const result = await this.db!.query(
      'SELECT key, value FROM entries WHERE key IN (' +
        keys.map(() => '?').join(',') +
        ')',
      [...keys],
    )
    const rows = new Map(
      (result.values as { key: string; value: string }[] | undefined)?.map(
        (row) => [row.key, row.value],
      ),
    )
    return Object.fromEntries(keys.map((key) => [key, rows.get(key) ?? null]))
  }
  async readBatch(keys: readonly string[]): Promise<StoreSnapshot> {
    await this.initialize()
    return this.enqueue(() => this.readValues(keys))
  }
  async writeBatch(
    values: Record<string, string>,
    expected?: StoreSnapshot,
  ): Promise<void> {
    await this.initialize()
    return this.enqueue(async () => {
      await this.db!.beginTransaction()
      try {
        if (expected)
          assertSnapshot(await this.readValues(Object.keys(expected)), expected)
        await this.db!.executeSet(
          Object.entries(values).map(([key, value]) => ({
            statement:
              'INSERT INTO entries (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            values: [key, value],
          })),
          false,
        )
        await this.db!.commitTransaction()
      } catch (error) {
        await this.db!.rollbackTransaction()
        throw error
      }
    })
  }
  async get(key: string): Promise<string | null> {
    return (await this.readBatch([key]))[key]
  }
  async set(key: string, value: string): Promise<void> {
    await this.writeBatch({ [key]: value })
  }
}
