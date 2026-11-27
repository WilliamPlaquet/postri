import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface Session {
  /** personne assise devant le PC qui héberge : crée, supprime, partage */
  host: boolean
  /** visiteur arrivé par le lien public (tunnel) */
  remote: boolean
}

export const DEFAULT_SESSION: Session = { host: false, remote: false }
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

/* ------------------------------------------------------------------ */
/* Partage sur Internet (tunnel) — PC qui héberge uniquement           */
/* ------------------------------------------------------------------ */

export type ShareStatus = 'off' | 'downloading' | 'starting' | 'on' | 'error'
export interface ShareState {
  status: ShareStatus
  url: string | null
  error: string | null
}

export function useShare(enabled: boolean) {
  const [state, setState] = useState<ShareState>({ status: 'off', url: null, error: null })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const call = useCallback(async (action?: 'start' | 'stop') => {
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
  }
}

/* ------------------------------------------------------------------ */
/* Code d'accès d'un board — PC qui héberge uniquement                 */
/* ------------------------------------------------------------------ */

export function useInviteCode(boardId: string, enabled: boolean) {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    fetch(`/api/boards/${boardId}/invite`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCode(d.code))
      .catch(() => {})
  }, [boardId, enabled])

  const renew = async () => {
    const r = await fetch(`/api/boards/${boardId}/invite`, { method: 'POST' })
    if (r.ok) setCode((await r.json()).code)
  }

  return { code, renew }
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
