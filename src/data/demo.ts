export interface DemoPlace {
  id: string
  name: string
  subtitle: string
  coordinates: { longitude: number; latitude: number; crs: 'WGS84' }
  sourceUrl: string
}

// 公开城市中心的近似坐标，仅作地图演示，不是景点入口或导航目的地。
export const demoPlaces: DemoPlace[] = [
  {
    id: 'lanzhou',
    name: '兰州',
    subtitle: '从黄河边出发',
    coordinates: { longitude: 103.8343, latitude: 36.0611, crs: 'WGS84' },
    sourceUrl: 'https://en.wikipedia.org/wiki/Lanzhou',
  },
  {
    id: 'wuwei',
    name: '武威',
    subtitle: '河西走廊的第一站',
    coordinates: { longitude: 102.638, latitude: 37.929, crs: 'WGS84' },
    sourceUrl: 'https://en.wikipedia.org/wiki/Wuwei,_Gansu',
  },
  {
    id: 'zhangye',
    name: '张掖',
    subtitle: '向祁连山与丹霞前行',
    coordinates: { longitude: 100.4498, latitude: 38.9329, crs: 'WGS84' },
    sourceUrl: 'https://en.wikipedia.org/wiki/Zhangye',
  },
]

export const initialNote = '出发前检查证件与充电线，给沿途停留留一点余量。'
