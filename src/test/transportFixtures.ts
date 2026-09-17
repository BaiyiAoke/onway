import { defaultCategories } from '../services/travel/model'
import type { TravelWorkspace } from '../services/travel/types'
import type { TransportOption } from '../services/routes/transportTypes'
import type { LocalStore } from '../services/storage/types'
export function travelFixture(): TravelWorkspace {
  return {
    schemaVersion: 4,
    activeTripId: 'trip',
    categories: defaultCategories(),
    libraryPlaces: [],
    trips: [
      {
        id: 'trip',
        name: '公开测试',
        startDate: '2026-09-16',
        unscheduledPlaces: [],
        days: [
          {
            id: 'day',
            places: [
              {
                id: 'a',
                name: '起点',
                note: '',
                coordinates: { longitude: 116.4, latitude: 39.9, crs: 'WGS84' },
              },
              {
                id: 'b',
                name: '终点',
                note: '',
                coordinates: {
                  longitude: 116.42,
                  latitude: 39.92,
                  crs: 'WGS84',
                },
              },
            ],
          },
          { id: 'other', places: [] },
        ],
      },
    ],
  }
}
export function optionFixture(): TransportOption {
  return {
    id: 'one',
    source: '测试服务',
    distanceMeters: 2000,
    durationSeconds: 600,
    calculatedAt: '2026-09-16T01:00:00Z',
    steps: [
      {
        mode: 'walking',
        instruction: '步行至车站',
        lines: [
          [
            [116.4, 39.9],
            [116.42, 39.92],
          ],
        ],
      },
    ],
  }
}
export function memoryStore() {
  const values = new Map<string, string>()
  const store: LocalStore = {
    initialize: async () => {},
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v)
    },
  }
  return { values, store }
}
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { resolve, promise }
}
