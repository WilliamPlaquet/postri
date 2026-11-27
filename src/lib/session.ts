import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface Session {
  /** visiteur arrivé par le lien public (tunnel) */
  remote: boolean
  /** a le droit d'utiliser l'API (code saisi, ou pas besoin) */
  authorized: boolean
  /** personne assise devant le PC qui héberge : peut gérer le partage */
  host: boolean
}

export const DEFAULT_SESSION: Session = { remote: false, authorized: true, host: false }
export const SessionContext = createContext<Session>(DEFAULT_SESSION)
export const useSession = () => useContext(SessionContext)

export async function fetchSession(): Promise<Session> {
  try {
    const r = await fetch('/api/session', { cache: 'no-store' })
    if (!r.ok) return DEFAULT_SESSION
    return (await r.json()) as Session
  } catch {
    return DEFAULT_SESSION
  }
}

export type ShareStatus = 'off' | 'downloading' | 'starting' | 'on' | 'error'
export interface ShareState {
  status: ShareStatus
  url: string | null
  code: string | null
  error: string | null
}

/** État du partage sur Internet (uniquement pour le PC qui héberge) */
export function useShare(enabled: boolean) {
  const [state, setState] = useState<ShareState>({ status: 'off', url: null, code: null, error: null })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const call = useCallback(async (action?: 'start' | 'stop' | 'code') => {
    try {
      const r = await fetch(`/api/share${action ? `/${action}` : ''}`, { method: action ? 'POST' : 'GET', cache: 'no-store' })
      if (r.ok) setState((await r.json()) as ShareState)
    } catch {
      /* serveur injoignable : on garde l'état connu */
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    const loop = async () => {
      await call()
      if (stopped) return
      timer.current = setTimeout(loop, 1500)
    }
    loop()
    return () => {
      stopped = true
      clearTimeout(timer.current)
    }
  }, [enabled, call])

  return {
    state,
    start: () => {
      setState((s) => ({ ...s, status: 'starting', error: null }))
      return call('start')
    },
    stop: () => call('stop'),
    newCode: () => call('code'),
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}
