import Dexie, { type Table } from 'dexie'
import { initialNote } from '../../data/demo'
import { NOTE_KEY, type LocalStore } from './types'

interface Entry {
  key: string
  value: string
}

export class WebLocalStore implements LocalStore {
  private readonly db: Dexie
  private readonly entries: Table<Entry, string>
  private initialization?: Promise<void>

  constructor(name = 'onway-local') {
    this.db = new Dexie(name)
    // 后续结构变化新增 version，不修改已发布的迁移版本。
    this.db.version(1).stores({ entries: '&key' })
    this.entries = this.db.table('entries')
  }

  initialize(): Promise<void> {
    this.initialization ??= this.db
      .transaction('rw', this.entries, async () => {
        if (!(await this.entries.get(NOTE_KEY))) {
          await this.entries.add({ key: NOTE_KEY, value: initialNote })
        }
      })
      .catch((error: unknown) => {
        this.initialization = undefined
        throw error
      })
    return this.initialization
  }

  async get(key: string) {
    await this.initialize()
    return (await this.entries.get(key))?.value ?? null
  }
  async set(key: string, value: string) {
    await this.initialize()
    await this.entries.put({ key, value })
  }
  close() {
    this.db.close()
  }
}
