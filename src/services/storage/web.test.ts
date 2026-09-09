import { afterEach, describe, expect, it } from 'vitest'
import { WebLocalStore } from './web'
import { NOTE_KEY } from './types'
import { initialNote } from '../../data/demo'

const stores: WebLocalStore[] = []
function open(name = `test-${crypto.randomUUID()}`) {
  const store = new WebLocalStore(name)
  stores.push(store)
  return store
}
afterEach(() => {
  stores.forEach((store) => store.close())
  stores.length = 0
})

describe('Web 本地持久化', () => {
  it('首次创建示例，重复初始化不会覆盖用户输入，重新打开仍能读取', async () => {
    const name = `test-${crypto.randomUUID()}`
    const first = open(name)
    await Promise.all([first.initialize(), first.initialize()])
    expect(await first.get(NOTE_KEY)).toBe(initialNote)
    await first.set(NOTE_KEY, '明天早点出发')
    first.close()
    const reopened = open(name)
    await reopened.initialize()
    expect(await reopened.get(NOTE_KEY)).toBe('明天早点出发')
  })

  it('保留空备注，不用默认示例替换；不存在的键返回 null', async () => {
    const name = `test-${crypto.randomUUID()}`
    const first = open(name)
    await first.set(NOTE_KEY, '')
    first.close()
    const reopened = open(name)
    expect(await reopened.get(NOTE_KEY)).toBe('')
    expect(await reopened.get('missing')).toBeNull()
  })
})
