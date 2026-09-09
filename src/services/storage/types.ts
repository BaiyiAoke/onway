export interface LocalStore {
  initialize(): Promise<void>
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

export const NOTE_KEY = 'demo.travel-note'
