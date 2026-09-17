import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { readPlanReturn } from '../features/travel/planReturn'

export function usePageScroll() {
  const location = useLocation()
  const positions = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const route = location.pathname
    const savedPosition = positions.current.get(route) ?? 0
    const cache = positions.current
    let frame = 0
    let settled = false
    const remember = () => {
      if (settled) cache.set(route, window.scrollY)
    }
    const finish = () => {
      settled = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
    // 懒加载页面要等内容具有足够高度；期间用户主动滚动则立即让出控制。
    const restore = () => {
      if (settled) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        )
        window.scrollTo(0, Math.min(savedPosition, maxScroll))
        if (maxScroll >= savedPosition) finish()
      })
    }
    const observer = new MutationObserver(restore)
    const manualScroll = () => finish()
    const oldRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    if (readPlanReturn(location.state)) {
      // 明确的地点锚点由计划页定位，不能被普通页面滚动记忆覆盖。
      settled = true
    } else {
      observer.observe(
        document.getElementById('main-content') ?? document.body,
        { childList: true, subtree: true },
      )
      restore()
    }
    const timer = window.setTimeout(finish, 2000)
    window.addEventListener('scroll', remember, { passive: true })
    document.addEventListener('click', remember, true)
    window.addEventListener('wheel', manualScroll, { passive: true })
    window.addEventListener('touchstart', manualScroll, { passive: true })
    window.addEventListener('keydown', manualScroll)
    return () => {
      // 卸载时新页面可能已把 scrollY 压到 0，使用导航前捕获的位置。
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.history.scrollRestoration = oldRestoration
      window.removeEventListener('scroll', remember)
      document.removeEventListener('click', remember, true)
      window.removeEventListener('wheel', manualScroll)
      window.removeEventListener('touchstart', manualScroll)
      window.removeEventListener('keydown', manualScroll)
    }
  }, [location.key, location.pathname, location.state])
}
