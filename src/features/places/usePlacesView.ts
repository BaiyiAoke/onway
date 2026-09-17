import { useEffect, useRef, useState } from 'react'
import { getLocalStore } from '../../services/storage'

export type PlacesView = 'list' | 'grid'
export const PLACES_VIEW_KEY = 'ui.places.view'

/** 视图仅属于当前设备；不进入旅行文档或备份，也不阻塞地点操作。 */
export function usePlacesView() {
  const [view, setView] = useState<PlacesView>('list')
  const chosen = useRef(false)
  const writes = useRef(Promise.resolve())

  useEffect(() => {
    let active = true
    void getLocalStore()
      .then(async (store) => {
        await store.initialize()
        const value = await store.get(PLACES_VIEW_KEY)
        // 晚到的偏好读取不能覆盖用户已经点选的视图。
        if (active && !chosen.current && (value === 'list' || value === 'grid'))
          setView(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  function chooseView(next: PlacesView) {
    chosen.current = true
    setView(next)
    // 连续切换按点击顺序落盘；保存失败只影响下次打开的默认值。
    writes.current = writes.current
      .then(async () => {
        const store = await getLocalStore()
        await store.initialize()
        await store.set(PLACES_VIEW_KEY, next)
      })
      .catch(() => {})
  }

  return { view, chooseView }
}
