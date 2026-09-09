import { Capacitor } from '@capacitor/core'
import type { LocalStore } from './types'

let instance: Promise<LocalStore> | undefined

export function getLocalStore(): Promise<LocalStore> {
  instance ??= (async () => {
    if (Capacitor.getPlatform() === 'android') {
      const { AndroidLocalStore } = await import('./android')
      return new AndroidLocalStore()
    }
    const { WebLocalStore } = await import('./web')
    return new WebLocalStore()
  })().catch((error: unknown) => {
    instance = undefined
    throw error
  })
  return instance
}
