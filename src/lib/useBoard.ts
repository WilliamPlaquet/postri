import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { BoardElement, Peer, PresenceState, UserInfo } from './types'
import { resolveArrow } from './geometry'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const LOCAL = Symbol('local')

export interface BoardApi {
  doc: Y.Doc
  /** lecture directe (toujours à jour, même pendant un glisser) */
  get: (id: string) => BoardElement | undefined
  all: () => BoardElement[]
  transact: (fn: () => void) => void
  set: (el: BoardElement) => void
  patch: (id: string, changes: Partial<BoardElement>) => void
  /** modification non annulable (ajustement automatique de taille) */
  patchQuiet: (id: string, changes: Partial<BoardElement>) => void
  remove: (ids: string[]) => void
  /** termine l'étape d'annulation en cours (la prochaine modification sera annulable séparément) */
  checkpoint: () => void
  setName: (name: string) => void
  undo: () => void
  redo: () => void
  /** regroupe toutes les modifications suivantes en une seule étape d'annulation */
  beginGesture: () => void
  endGesture: () => void
  setPresence: (state: Partial<PresenceState>) => void
}

export interface Connection {
  doc: Y.Doc
  provider: WebsocketProvider
  ymap: Y.Map<BoardElement>
  meta: Y.Map<string>
  undoManager: Y.UndoManager
}

/** Crée la connexion au board (et la détruit en quittant) */
export function useConnection(boardId: string): Connection | null {
  const [conn, setConn] = useState<Connection | null>(null)
  useEffect(() => {
    const doc = new Y.Doc()
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const provider = new WebsocketProvider(`${proto}//${location.host}/ws`, boardId, doc, { maxBackoffTime: 4000 })
    const ymap = doc.getMap<BoardElement>('elements')
    const meta = doc.getMap<string>('meta')
    const undoManager = new Y.UndoManager(ymap, { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 })
    // code d'accès changé ou partage arrêté : on recharge pour redemander le code
    provider.on('connection-close', (event: CloseEvent | null) => {
      if (event?.code === 4401) location.reload()
    })
    setConn({ doc, provider, ymap, meta, undoManager })
    return () => {
      undoManager.destroy()
      provider.destroy()
      doc.destroy()
    }
  }, [boardId])
  return conn
}

export function useBoard(conn: Connection, user: UserInfo) {
  const [elements, setElements] = useState<Record<string, BoardElement>>({})
  const [name, setNameState] = useState('')
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [synced, setSynced] = useState(false)
  const [peers, setPeers] = useState<Peer[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const { doc, provider, ymap, meta, undoManager } = conn

  const userRef = useRef(user)
  userRef.current = user

  useEffect(() => {
    const sync = (event?: Y.YMapEvent<BoardElement>) => {
      if (!event) {
        setElements(Object.fromEntries(ymap.entries()))
        return
      }
      setElements((prev) => {
        const next = { ...prev }
        event.keysChanged.forEach((k) => {
          const v = ymap.get(k)
          if (v === undefined) delete next[k]
          else next[k] = v
        })
        return next
      })
    }
    sync()
    ymap.observe(sync)

    const onMeta = () => setNameState(meta.get('name') || '')
    onMeta()
    meta.observe(onMeta)

    const onStatus = ({ status }: { status: ConnectionStatus }) => setStatus(status)
    const onSync = (s: boolean) => {
      setSynced(s)
      if (s) {
        setElements(Object.fromEntries(ymap.entries()))
        onMeta()
      }
    }
    provider.on('status', onStatus)
    provider.on('sync', onSync)
    // la connexion a pu s'établir avant qu'on écoute
    setStatus(provider.wsconnected ? 'connected' : provider.wsconnecting ? 'connecting' : 'disconnected')
    if (provider.synced) onSync(true)

    const awareness = provider.awareness
    const onAwareness = () => {
      const list: Peer[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state || !state.user) return
        list.push({ clientId, ...(state as PresenceState) })
      })
      setPeers(list)
    }
    awareness.on('change', onAwareness)
    onAwareness()

    const onStack = () => {
      setCanUndo(undoManager.undoStack.length > 0)
      setCanRedo(undoManager.redoStack.length > 0)
    }
    undoManager.on('stack-item-added', onStack)
    undoManager.on('stack-item-popped', onStack)
    undoManager.on('stack-cleared', onStack)

    return () => {
      ymap.unobserve(sync)
      meta.unobserve(onMeta)
      provider.off('status', onStatus)
      provider.off('sync', onSync)
      awareness.off('change', onAwareness)
      undoManager.off('stack-item-added', onStack)
      undoManager.off('stack-item-popped', onStack)
      undoManager.off('stack-cleared', onStack)
    }
  }, [doc, provider, ymap, meta, undoManager])

  // Identité dans la présence
  useEffect(() => {
    provider.awareness.setLocalStateField('user', user)
  }, [provider, user])

  useEffect(() => {
    provider.awareness.setLocalState({ user: userRef.current, cursor: null, selection: [], editing: null })
  }, [provider])

  const api = useMemo<BoardApi>(() => {
    const transact = (fn: () => void) => doc.transact(fn, LOCAL)
    let savedTimeout = undoManager.captureTimeout
    return {
      doc,
      get: (id) => ymap.get(id),
      all: () => Array.from(ymap.values()).sort((a, b) => a.z - b.z),
      transact,
      set: (el) => {
        if (!doc._transaction) undoManager.stopCapturing()
        transact(() => ymap.set(el.id, { ...el, createdBy: el.createdBy ?? userRef.current.name }))
      },
      checkpoint: () => undoManager.stopCapturing(),
      patch: (id, changes) =>
        transact(() => {
          const cur = ymap.get(id)
          if (cur) ymap.set(id, { ...cur, ...changes })
        }),
      patchQuiet: (id, changes) =>
        doc.transact(() => {
          const cur = ymap.get(id)
          if (cur) ymap.set(id, { ...cur, ...changes })
        }, 'auto'),
      remove: (ids) => {
        undoManager.stopCapturing()
        transact(() => {
          const set = new Set(ids)
          const snapshot = Object.fromEntries(ymap.entries())
          ids.forEach((id) => ymap.delete(id))
          // détacher les flèches accrochées aux éléments supprimés
          ymap.forEach((el, id) => {
            if (el.type !== 'arrow' || set.has(id)) return
            const s = el.start?.bind && set.has(el.start.bind)
            const e = el.end?.bind && set.has(el.end.bind)
            if (s || e) {
              const { a, b } = resolveArrow(el, snapshot)
              ymap.set(id, {
                ...el,
                start: s ? { x: a.x, y: a.y } : el.start,
                end: e ? { x: b.x, y: b.y } : el.end,
              })
            }
          })
        })
        undoManager.stopCapturing()
      },
      setName: (n) => transact(() => meta.set('name', n)),
      undo: () => undoManager.undo(),
      redo: () => undoManager.redo(),
      beginGesture: () => {
        undoManager.stopCapturing()
        savedTimeout = undoManager.captureTimeout
        undoManager.captureTimeout = Number.MAX_SAFE_INTEGER
      },
      endGesture: () => {
        undoManager.captureTimeout = savedTimeout
        undoManager.stopCapturing()
      },
      setPresence: (state) => {
        const cur = provider.awareness.getLocalState() || {}
        provider.awareness.setLocalState({ ...cur, ...state, user: userRef.current })
      },
    }
  }, [doc, ymap, meta, undoManager, provider])

  return { api, elements, name, status, synced, peers, canUndo, canRedo }
}
