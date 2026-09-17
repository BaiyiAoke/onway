import { useLayoutEffect, useRef, type MouseEvent } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom'
import { useOptionalBackRegistry } from './BackHandler'

type NavigationOptions = { onNavigate?: () => void }

function useGuardedClick({
  to,
  replace,
  state,
  preventScrollReset,
  relative,
  target,
  onClick,
  onNavigate,
}: Pick<
  LinkProps,
  | 'to'
  | 'replace'
  | 'state'
  | 'preventScrollReset'
  | 'relative'
  | 'target'
  | 'onClick'
> &
  NavigationOptions) {
  const registry = useOptionalBackRegistry()
  const navigate = useNavigate()
  return (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== '_self')
    )
      return
    event.preventDefault()
    // 筛选等页面副作用随真正导航执行，取消离开时维持原页面状态。
    const proceed = () => {
      onNavigate?.()
      void navigate(to, { replace, state, preventScrollReset, relative })
    }
    if (!registry?.handle(proceed, 'navigation')) proceed()
  }
}

export function GuardedLink({
  onNavigate,
  ...props
}: LinkProps & NavigationOptions) {
  const onClick = useGuardedClick({ ...props, onNavigate })
  return <Link {...props} onClick={onClick} />
}

export function GuardedNavLink({
  onNavigate,
  ...props
}: NavLinkProps & NavigationOptions) {
  const onClick = useGuardedClick({ ...props, onNavigate })
  return <NavLink {...props} onClick={onClick} />
}

// HashRouter 的声明式路由没有 blocker：在路由监听器前拦截历史返回，
// 恢复当前历史位置后再询问，确认时只重放原来那一次返回。
export function BrowserNavigationGuard() {
  const registry = useOptionalBackRegistry()
  const location = useLocation()
  const currentIndexRef = useRef<unknown>(null)
  useLayoutEffect(() => {
    currentIndexRef.current = window.history.state?.idx
  }, [location.key])
  useLayoutEffect(() => {
    if (!registry) return
    let restoring: {
      delta: number
      restored: boolean
      proceed: boolean
    } | null = null
    let replaying = false
    const handlePop = (event: PopStateEvent) => {
      const currentIndex = currentIndexRef.current
      if (typeof currentIndex !== 'number') return
      if (replaying) {
        replaying = false
        return
      }
      if (restoring) {
        event.stopImmediatePropagation()
        const attempt = restoring
        restoring = null
        attempt.restored = true
        if (attempt.proceed) {
          const delta = attempt.delta
          replaying = true
          window.history.go(-delta)
        }
        return
      }
      const nextIndex: unknown = event.state?.idx
      if (typeof nextIndex !== 'number' || nextIndex === currentIndex) return
      const attempt = {
        delta: currentIndex - nextIndex,
        restored: false,
        proceed: false,
      }
      const proceed = () => {
        attempt.proceed = true
        if (attempt.restored) {
          restoring = null
          replaying = true
          window.history.go(-attempt.delta)
        }
      }
      if (!registry.handle(proceed, 'history')) return
      event.stopImmediatePropagation()
      restoring = attempt
      window.history.go(attempt.delta)
    }
    window.addEventListener('popstate', handlePop, true)
    return () => window.removeEventListener('popstate', handlePop, true)
  }, [registry])
  return null
}
